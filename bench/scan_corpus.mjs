// Run parda over real chatbot user turns. Writes aggregate counts to results/corpus_<name>.json
// (safe to publish) and a review sample with values to data/review_<name>.jsonl (never published).
//   node bench/scan_corpus.mjs data/corpus_wildchat.jsonl wildchat
import fs from "node:fs";
import readline from "node:readline";
import { scan } from "../parda/parda.js";

const [, , path, name] = process.argv;
const perKind = {}, msgsWith = {}, sample = {};
let n = 0, withAny = 0, withSev3 = 0, chars = 0;
const t0 = performance.now();
let seed = Number(process.env.SEED || 1);
const REVIEW = process.env.REVIEW || name;  // review file suffix, so a fresh sample never overwrites an old one
const exclude = new Set((process.env.EXCLUDE || "").split(",").filter(Boolean).flatMap(f => fs.readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l).id)));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
for await (const line of rl) {
  const { id, text } = JSON.parse(line);
  n++; chars += text.length;
  const f = scan(text);
  const sampleable = !exclude.has(id);
  if (!f.length) continue;
  withAny++;
  if (f.some(x => x.sev === 3)) withSev3++;
  const kinds = new Set();
  for (const x of f) {
    perKind[x.kind] = (perKind[x.kind] || 0) + 1;
    kinds.add(x.kind);
    // reservoir sample of 40 per kind for manual precision review
    sample[x.kind] ??= { seen: 0, rows: [] };
    const s = sample[x.kind]; s.seen++;
    const row = { id, kind: x.kind, value: x.value, ctx: text.slice(Math.max(0, x.start - 70), x.end + 50).replace(/\s+/g, " ") };
    if (!sampleable) continue;
    if (s.rows.length < 40) s.rows.push(row); else { const j = Math.floor(rnd() * s.seen); if (j < 40) s.rows[j] = row; }
  }
  for (const k of kinds) msgsWith[k] = (msgsWith[k] || 0) + 1;
}
const secs = (performance.now() - t0) / 1000;
const res = { corpus: name, messages: n, chars, messages_flagged: withAny, messages_with_severe: withSev3,
  findings_per_kind: perKind, messages_per_kind: msgsWith, seconds: secs, ms_per_message: 1000 * secs / n };
fs.mkdirSync("results", { recursive: true });
fs.writeFileSync(`results/corpus_${name}.json`, JSON.stringify(res, null, 1));
fs.writeFileSync(`data/review_${REVIEW}.jsonl`, Object.values(sample).flatMap(s => s.rows).map(r => JSON.stringify(r)).join("\n") + "\n");
console.log(JSON.stringify({ name, n, withAny, withSev3, secs: secs.toFixed(1) }));
console.log(Object.entries(msgsWith).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
