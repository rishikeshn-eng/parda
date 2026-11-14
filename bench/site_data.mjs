// Collect published numbers into docs/data/results.json (aggregates only: no corpus text, no values).
import fs from "node:fs";
const J = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
const gold = J("results/gold_metrics.json"), held = J("results/heldout_metrics.json"), pres = J("results/presidio_baseline.json");
const strip = m => m && ({ n_messages: m.n_messages, n_gold_spans: m.n_gold_spans, micro: m.micro, per_kind: m.per_kind,
  negative_messages: m.negative_messages, negative_messages_flagged: m.negative_messages_flagged, ms_per_message: m.ms_per_message });
const corpus = ["wildchat", "sharegpt"].map(n => J(`results/corpus_${n}.json`)).filter(Boolean)
  .map(({ corpus, messages, messages_flagged, messages_with_severe, messages_per_kind, ms_per_message }) => ({ corpus, messages, messages_flagged, messages_with_severe, messages_per_kind, ms_per_message }));
const out = { gold: strip(gold), heldout: strip(held), presidio: pres, corpus,
  precision_v01: J("results/precision_v01_sharegpt.json"), precision_v02: J("results/precision_v02.json"), roundtrip: J("results/roundtrip.json") };
fs.mkdirSync("docs/data", { recursive: true });
fs.writeFileSync("docs/data/results.json", JSON.stringify(out));
console.log("wrote docs/data/results.json", (fs.statSync("docs/data/results.json").size / 1024).toFixed(1), "KB");
