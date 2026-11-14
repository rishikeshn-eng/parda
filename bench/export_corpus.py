"""Export real user turns sent to chatbots into data/corpus_<name>.jsonl ({id, text}).
WildChat-1M (already PII-scrubbed by its authors) and ShareGPT (not scrubbed). Kept local only."""
import glob
import json
from pathlib import Path

import pandas as pd

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = RAW.parent

n = 0
with open(OUT / "corpus_wildchat.jsonl", "w") as f:
    for p in sorted(glob.glob(str(RAW / "wildchat1m_*.parquet"))):
        df = pd.read_parquet(p, columns=["conversation_hash", "conversation"])
        for h, conv in zip(df.conversation_hash, df.conversation):
            for k, turn in enumerate(conv):
                if turn["role"] == "user" and turn["content"].strip():
                    f.write(json.dumps({"id": f"{h}:{k}", "text": turn["content"][:20000]}) + "\n")  # ascii escapes: raw U+2028 breaks line readers
                    n += 1
print("wildchat user turns", n)

n = 0
with open(OUT / "corpus_sharegpt.jsonl", "w") as f:
    for conv in json.load(open(RAW / "sharegpt.json")):
        for k, turn in enumerate(conv.get("conversations") or []):
            if turn.get("from") == "human" and (turn.get("value") or "").strip():
                f.write(json.dumps({"id": f"{conv['id']}:{k}", "text": turn["value"][:20000]}) + "\n")  # ascii escapes: raw U+2028 breaks line readers
                n += 1
print("sharegpt user turns", n)
