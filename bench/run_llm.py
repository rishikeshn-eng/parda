"""Answer prompts with local MLX models (greedy, thinking off), resumable.
  python bench/run_llm.py data/roundtrip_prompts.jsonl data/roundtrip_out MODEL [MODEL ...]
Rows: {id, prompt}. Writes OUT_DIR/<model>.jsonl with {id, output}. Needs mlx-lm."""
import gc
import json
import sys
from pathlib import Path


def slug(m):
    return m.split("/")[-1].replace("-4bit", "").lower()


def main():
    rows = [json.loads(l) for l in open(sys.argv[1])]
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for model_id in sys.argv[3:]:
        out = out_dir / f"{slug(model_id)}.jsonl"
        done = {json.loads(l)["id"] for l in open(out)} if out.exists() else set()
        todo = sorted([r for r in rows if r["id"] not in done], key=lambda r: len(r["prompt"]))
        if not todo:
            continue
        from mlx_lm import batch_generate, load
        model, tok = load(model_id)

        def chat(p):
            msg = [{"role": "user", "content": p}]
            try:
                return tok.apply_chat_template(msg, add_generation_prompt=True, enable_thinking=False)
            except TypeError:
                return tok.apply_chat_template(msg, add_generation_prompt=True)

        with open(out, "a") as f:
            for i in range(0, len(todo), 16):
                chunk = todo[i:i + 16]
                r = batch_generate(model, tok, [chat(x["prompt"]) for x in chunk], max_tokens=400)
                for x, text in zip(chunk, r.texts):
                    f.write(json.dumps({"id": x["id"], "output": text}, ensure_ascii=False) + "\n")
                f.flush()
                print(slug(model_id), i + len(chunk), "/", len(todo), flush=True)
        del model, tok
        gc.collect()


if __name__ == "__main__":
    main()
