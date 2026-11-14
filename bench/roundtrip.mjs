// Redact -> chatbot -> restore. Do chatbots keep the placeholders intact so the real values can be
// put back? Compares two redaction styles on tasks whose answer must repeat the sensitive values:
//   tag       [AADHAAR_1], [EMAIL_1] ...
//   surrogate a fake value of the same format (valid checksum), swapped back afterwards
//   node bench/roundtrip.mjs make  > data/roundtrip_prompts.jsonl
//   node bench/roundtrip.mjs score data/roundtrip_prompts.jsonl data/roundtrip_out/*.jsonl
import fs from "node:fs";
import { redact, restore, scan } from "../parda/parda.js";

const TASKS = [
  "Write a short, polite WhatsApp message to my landlord saying I paid this month's rent to {UPI_ID} and he can call me on {IN_PHONE}.",
  "Format this as a neat table with two columns (field, value):\nName: Meera Iyer\nAadhaar: {AADHAAR}\nPAN: {PAN}\nMobile: {IN_PHONE}\nEmail: {EMAIL}",
  "Draft a leave application to my manager. Include my contact details at the end: email {EMAIL}, phone {IN_PHONE}.",
  "Translate into Hindi: \"Please send the payment to {UPI_ID} or call me on {IN_PHONE}.\"",
  "Write an email to my client asking them to transfer the advance to account number {BANK_ACCOUNT}, IFSC {IFSC}.",
  "Turn this into a JSON object with keys name, pan, gstin, email: Ravi Traders, PAN {PAN}, GSTIN {GSTIN}, email {EMAIL}.",
  "Rewrite this professionally: hi, my card {CARD} was charged twice, pls refund. my email is {EMAIL}",
  "Fix this .env file so the keys are in alphabetical order and nothing else changes:\nOPENAI_API_KEY={OPENAI_KEY}\nDATABASE_URL=postgres://admin:{DB_PASSWORD}@db.acme.in:5432/app\nAWS_ACCESS_KEY_ID={AWS_ACCESS_KEY}",
];

let seed = 4242;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const dig = k => Array.from({ length: k }, () => Math.floor(rnd() * 10)).join("");
const up = k => Array.from({ length: k }, () => String.fromCharCode(65 + Math.floor(rnd() * 26))).join("");
const al = (k, s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") => Array.from({ length: k }, () => s[Math.floor(rnd() * s.length)]).join("");
const { verhoeffCheckDigit, luhnValid, gstinCheckChar } = await import("../parda/parda.js");
const V = {
  UPI_ID: () => pick(["rahul.s", "priya" + dig(2), "kiran" + dig(3)]) + "@" + pick(["okaxis", "ybl", "oksbi"]),
  IN_PHONE: () => pick(["9", "8", "7"]) + dig(9),
  AADHAAR: () => { const b = String(2 + Math.floor(rnd() * 8)) + dig(10); const d = b + verhoeffCheckDigit(b); return d.slice(0, 4) + " " + d.slice(4, 8) + " " + d.slice(8); },
  PAN: () => up(3) + "P" + up(1) + dig(4) + up(1),
  EMAIL: () => pick(["meera.iyer", "ravi.t", "anil" + dig(2)]) + "@" + pick(["gmail.com", "outlook.com", "acme.in"]),
  BANK_ACCOUNT: () => dig(12),
  IFSC: () => pick(["SBIN", "HDFC", "ICIC"]) + "0" + dig(6),
  GSTIN: () => { const f = "27" + up(3) + "P" + up(1) + dig(4) + up(1) + "1Z"; return f + gstinCheckChar(f); },
  CARD: () => { let b = "4" + dig(14); for (let c = 0; c < 10; c++) if (luhnValid(b + c)) return (b + c).match(/.{4}/g).join(" "); },
  OPENAI_KEY: () => "sk-proj-" + al(48),
  DB_PASSWORD: () => pick(["s3cr3tPass9", "Adm1n!2024x", "prodpass99"]),
  AWS_ACCESS_KEY: () => "AKIA" + al(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"),
};

const mode = process.argv[2];
if (mode === "make") {
  for (let k = 0; k < 160; k++) {
    const t = TASKS[k % TASKS.length];
    const text = t.replace(/\{([A-Z_]+)\}/g, (_, kind) => V[kind]());
    const real = scan(text).map(f => f.value);
    for (const style of ["tag", "surrogate"]) {
      const r = redact(text, { style, seed: k });
      process.stdout.write(JSON.stringify({ id: `rt${k}_${style}`, task: k % TASKS.length, style, original: text, prompt: r.text, map: r.map, real }) + "\n");
    }
  }
} else if (mode === "score") {
  const prompts = Object.fromEntries(fs.readFileSync(process.argv[3], "utf8").trim().split("\n").map(l => JSON.parse(l)).map(r => [r.id, r]));
  const res = {};
  for (const f of process.argv.slice(4)) {
    const model = f.split("/").pop().replace(".jsonl", "");
    for (const line of fs.readFileSync(f, "utf8").trim().split("\n")) {
      const { id, output } = JSON.parse(line);
      const p = prompts[id];
      const back = restore(output, p.map);
      // each real value the task asked to repeat: is it in the restored answer?
      const need = p.map.length, got = p.map.filter(m => back.includes(m.value)).length;
      // a placeholder the model mangled: the restored answer still shows a tag or a surrogate fragment
      const leftover = p.style === "tag" ? (back.match(/\[[A-Z_]+_\d+\]/g) || []).length : 0;
      const complains = /placeholder|redacted|\bmasked\b|actual (number|value|details)|replace (it|this|them|\[)|real (number|value)/i.test(output);
      const key = `${model}|${p.style}`;
      res[key] ??= { model, style: p.style, n: 0, values: 0, restored: 0, all_restored: 0, leftover_tags: 0, complains: 0 };
      const r = res[key];
      r.n++; r.values += need; r.restored += got; r.all_restored += got === need; r.leftover_tags += leftover; r.complains += complains;
    }
  }
  const out = Object.values(res).map(r => ({ ...r, value_restore_rate: r.restored / r.values, answer_fully_restored: r.all_restored / r.n, complain_rate: r.complains / r.n }));
  fs.mkdirSync("results", { recursive: true });
  fs.writeFileSync("results/roundtrip.json", JSON.stringify(out, null, 1));
  for (const r of out) console.log(r.model.padEnd(24), r.style.padEnd(10), `values back ${(100 * r.value_restore_rate).toFixed(1)}%`, `answers fully restored ${(100 * r.answer_fully_restored).toFixed(1)}%`, `mentions placeholder ${(100 * r.complain_rate).toFixed(1)}%`);
}
