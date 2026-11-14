// Score parda on a gold jsonl ({text, spans:[{start,end,kind}]}). Span counts as found when a
// prediction of the same kind overlaps it by >= 50% of the gold span. Prints JSON metrics.
//   node bench/eval.mjs data/gold.jsonl [--out results/gold_metrics.json]
import fs from "node:fs";
import { scan } from "../parda/parda.js";

const [, , path, flag, outPath] = process.argv;
const rows = fs.readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const per = {};
const bump = (k, f) => { per[k] ??= { tp: 0, fn: 0, fp: 0 }; per[k][f]++; };
let negMsgs = 0, negFlagged = 0, posMsgs = 0, posAllCaught = 0, t0 = performance.now();
const misses = [], falseAlarms = [];
for (const r of rows) {
  const pred = scan(r.text);
  const used = new Set();
  let all = true;
  for (const g of r.spans) {
    const j = pred.findIndex((p, i) => !used.has(i) && p.kind === g.kind && overlap(p, g) >= 0.5 * (g.end - g.start));
    if (j >= 0) { used.add(j); bump(g.kind, "tp"); } else { bump(g.kind, "fn"); all = false; misses.push({ id: r.id, kind: g.kind, value: g.value, got: pred.filter(p => overlap(p, g) > 0).map(p => p.kind) }); }
  }
  pred.forEach((p, i) => {
    if (used.has(i)) return;
    // a prediction overlapping a gold span of another kind is a kind confusion, counted as fp for that kind
    bump(p.kind, "fp");
    falseAlarms.push({ id: r.id, kind: p.kind, value: p.value });
  });
  if (r.split === "negative") { negMsgs++; if (pred.length) negFlagged++; }
  else { posMsgs++; if (all) posAllCaught++; }
}
const ms = (performance.now() - t0) / rows.length;
const f1 = ({ tp, fp, fn }) => { const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1); return { precision: p, recall: r, f1: p + r ? 2 * p * r / (p + r) : 0 }; };
const tot = Object.values(per).reduce((a, x) => ({ tp: a.tp + x.tp, fp: a.fp + x.fp, fn: a.fn + x.fn }), { tp: 0, fp: 0, fn: 0 });
const res = {
  n_messages: rows.length, n_gold_spans: tot.tp + tot.fn, micro: { ...tot, ...f1(tot) },
  per_kind: Object.fromEntries(Object.entries(per).sort().map(([k, v]) => [k, { ...v, ...f1(v) }])),
  negative_messages: negMsgs, negative_messages_flagged: negFlagged,
  positive_messages: posMsgs, positive_messages_fully_caught: posAllCaught, ms_per_message: ms,
  misses: misses.slice(0, 40), false_alarms: falseAlarms.slice(0, 40),
};
if (flag === "--out") { fs.mkdirSync("results", { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(res, null, 1)); }
console.log(JSON.stringify({ micro: res.micro, negFlagged: `${negFlagged}/${negMsgs}`, posAll: `${posAllCaught}/${posMsgs}`, ms }, null, 0));
for (const [k, v] of Object.entries(res.per_kind)) console.log(k.padEnd(16), v.tp, v.fp, v.fn, v.precision.toFixed(3), v.recall.toFixed(3));
console.log("misses", JSON.stringify(misses.slice(0, 12)));
console.log("false alarms", JSON.stringify(falseAlarms.slice(0, 12)));
