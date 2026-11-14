"""Microsoft Presidio on the same gold sets, as the baseline.

Presidio is given its best configuration: every predefined recognizer, including the India-specific
ones (Aadhaar, PAN, passport, voter ID, vehicle registration), score threshold 0.3.
A gold span counts as caught when ANY Presidio entity overlaps it by >= 50% (redaction is what
matters, so its label does not have to match). False alarms are counted on the negative-only
messages, ignoring PERSON / LOCATION / NRP / DATE_TIME / URL, which parda does not try to find.
  python bench/presidio_baseline.py data/gold.jsonl data/heldout.jsonl
"""
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from presidio_analyzer import AnalyzerEngine, RecognizerRegistry

IGNORE = {"PERSON", "LOCATION", "NRP", "DATE_TIME", "URL", "ORGANIZATION"}


def engine():
    reg = RecognizerRegistry()
    reg.load_predefined_recognizers()
    try:  # India recognizers are not all loaded by default in every release
        from presidio_analyzer.predefined_recognizers import (InAadhaarRecognizer, InPanRecognizer,
                                                              InPassportRecognizer, InVehicleRegistrationRecognizer,
                                                              InVoterRecognizer)
        have = {r.name for r in reg.recognizers}
        for cls in (InAadhaarRecognizer, InPanRecognizer, InPassportRecognizer, InVoterRecognizer,
                    InVehicleRegistrationRecognizer):
            r = cls()
            if r.name not in have:
                reg.add_recognizer(r)
    except ImportError as e:
        print("India recognizers missing:", e, file=sys.stderr)
    return AnalyzerEngine(registry=reg, supported_languages=["en"])


def main():
    an = engine()
    print("recognizers:", sorted({r.name for r in an.registry.recognizers}), file=sys.stderr)
    out = {}
    for path in sys.argv[1:]:
        rows = [json.loads(l) for l in open(path)]
        per = defaultdict(lambda: [0, 0])
        neg_flag, neg_n, t0 = 0, 0, time.time()
        fp_types = Counter()
        for r in rows:
            res = an.analyze(text=r["text"], language="en", score_threshold=0.3)
            for g in r["spans"]:
                L = g["end"] - g["start"]
                hit = any(min(p.end, g["end"]) - max(p.start, g["start"]) >= 0.5 * L for p in res)
                per[g["kind"]][0] += hit
                per[g["kind"]][1] += 1
            if r["split"] == "negative":
                neg_n += 1
                extra = [p for p in res if p.entity_type not in IGNORE]
                if extra:
                    neg_flag += 1
                    fp_types.update(p.entity_type for p in extra)
        tot = [sum(v[0] for v in per.values()), sum(v[1] for v in per.values())]
        out[Path(path).stem] = {"recall_per_kind": {k: v for k, v in sorted(per.items())}, "recall": tot,
                                "negative_messages_flagged": [neg_flag, neg_n], "negative_flag_types": fp_types,
                                "ms_per_message": 1000 * (time.time() - t0) / len(rows)}
        print(Path(path).stem, "recall", tot, f"{tot[0] / tot[1]:.3f}", "neg flagged", neg_flag, "/", neg_n, file=sys.stderr)
        for k, v in sorted(per.items()):
            print(f"  {k:16s} {v[0]:4d}/{v[1]:4d}", file=sys.stderr)
    Path("results").mkdir(exist_ok=True)
    json.dump(out, open("results/presidio_baseline.json", "w"), indent=1, default=dict)


if __name__ == "__main__":
    main()
