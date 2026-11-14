"""Answer the round-trip prompts with a Gemini model (free tier: ~10 requests/min), cached and resumable.
  python bench/run_gemini.py data/roundtrip_prompts.jsonl data/roundtrip_out gemini-3.5-flash-lite"""
import json
import os
import re
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types


def main():
    src, out_dir, model = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{model}.jsonl"
    done = {json.loads(l)["id"] for l in open(out)} if out.exists() else set()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    rows = [json.loads(l) for l in open(src)]
    for n, r in enumerate(x for x in rows if x["id"] not in done):
        for attempt in range(8):
            try:
                t0 = time.time()
                resp = client.models.generate_content(model=model, contents=r["prompt"], config=types.GenerateContentConfig(
                    temperature=0, max_output_tokens=600, thinking_config=types.ThinkingConfig(thinking_level="minimal"),
                    http_options=types.HttpOptions(timeout=120000)))
                with open(out, "a") as f:
                    f.write(json.dumps({"id": r["id"], "output": resp.text or ""}, ensure_ascii=False) + "\n")
                time.sleep(max(0, 6.5 - (time.time() - t0)))
                break
            except Exception as e:  # noqa: BLE001
                msg = str(e)
                if "PerDay" in msg:
                    raise SystemExit("daily quota exhausted; rerun later, finished rows are kept")
                m = re.search(r"retry in ([0-9.]+)s", msg)
                time.sleep(float(m.group(1)) + 2 if m else 10 * (attempt + 1))
        if n % 20 == 0:
            print(model, n, flush=True)


if __name__ == "__main__":
    main()
