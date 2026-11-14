// Generate the parda gold set: chat drafts people actually paste into chatbots, with planted
// sensitive values (exact spans recorded) and hard negatives that look sensitive but are not.
// Values are built from the official formats (checksums included), not from parda's regexes.
//   node bench/make_gold.mjs > data/gold.jsonl
import { verhoeffCheckDigit, luhnValid, gstinCheckChar } from "../parda/parda.js";

let seed = Number(process.env.SEED || 20261114);
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const dig = k => Array.from({ length: k }, () => Math.floor(rnd() * 10)).join("");
const up = k => Array.from({ length: k }, () => String.fromCharCode(65 + Math.floor(rnd() * 26))).join("");
const alnum = (k, set = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") =>
  Array.from({ length: k }, () => set[Math.floor(rnd() * set.length)]).join("");
const sep = () => pick([" ", " ", "-", ""]);

// ---- generators for real-format values ----
const G = {
  AADHAAR: () => { const b = String(2 + Math.floor(rnd() * 8)) + dig(10); const d = b + verhoeffCheckDigit(b); const s = sep(); return d.slice(0, 4) + s + d.slice(4, 8) + s + d.slice(8); },
  PAN: () => up(3) + pick("PPPPCHFT".split("")) + up(1) + dig(4) + up(1),
  GSTIN: () => { const f = String(1 + Math.floor(rnd() * 36)).padStart(2, "0") + up(3) + pick("PCF".split("")) + up(1) + dig(4) + up(1) + "1Z"; return f + gstinCheckChar(f); },
  UPI_ID: () => pick(["rahul.sharma", "priya" + dig(2), "anil" + dig(4), "9" + dig(9), "neha.k", "shop.ravi", "mehta.family"]) + "@" + pick(["okaxis", "oksbi", "ybl", "paytm", "okhdfcbank", "ibl", "axl", "upi"]),
  IFSC: () => pick(["SBIN", "HDFC", "ICIC", "UTIB", "PUNB", "KKBK", "BARB", "CNRB"]) + "0" + dig(6),
  IN_PHONE: () => { const n = pick(["6", "7", "8", "9"]) + dig(9); return pick(["", "", "+91 ", "+91-", "0"]) + pick([n, n.slice(0, 5) + " " + n.slice(5)]); },
  BANK_ACCOUNT: () => dig(pick([11, 12, 14, 16])),
  PASSPORT: () => pick("ABCDEFGHJKLMNPRSTUVWY".split("")) + String(1 + Math.floor(rnd() * 9)) + dig(5) + String(1 + Math.floor(rnd() * 9)),
  VOTER_ID: () => up(3) + dig(7),
  CARD: () => { const pre = pick(["4", "4", "5" + (1 + Math.floor(rnd() * 5)), "60", "65", "6521", "81", "508"]); /* Visa, Mastercard, RuPay, Discover */ let b = pre + dig(15 - pre.length); for (let c = 0; c < 10; c++) if (luhnValid(b + c)) { b = b + c; break; } const s = pick([" ", "-", ""]); return b.match(/.{1,4}/g).join(s); },
  EMAIL: () => pick(["rohan.verma", "kavya.n", "amit_k", "sneha" + dig(2), "hr.team", "accounts"]) + "@" + pick(["gmail.com", "yahoo.co.in", "outlook.com", "infosys.com", "iitr.ac.in", "acmecorp.in"]),
  OPENAI_KEY: () => "sk-" + pick(["proj-", ""]) + alnum(48, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"),
  ANTHROPIC_KEY: () => "sk-ant-api03-" + alnum(93, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"),
  GOOGLE_KEY: () => "AIza" + alnum(35, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"),
  AWS_ACCESS_KEY: () => "AKIA" + alnum(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"),
  AWS_SECRET: () => alnum(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/+"),
  GITHUB_TOKEN: () => "ghp_" + alnum(36),
  SLACK_TOKEN: () => "xoxb-" + dig(12) + "-" + dig(13) + "-" + alnum(24),
  HF_TOKEN: () => "hf_" + alnum(34),
  JWT: () => "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ" + alnum(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") + "." + alnum(43, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"),
  PASSWORD: () => pick(["Rahul@1992", "qwerty#2024", "Sunshine!77", "Mumbai$123", "P@ssw0rd2025", "chotu1234", "Delhi@6", "Anjali#99"]),
  DB_PASSWORD: () => pick(["s3cr3tPass", "Adm1n!2024", "prodpass99", "hunter22x"]),
  IP_ADDRESS: () => [pick([13, 34, 49, 52, 64, 103, 117, 142, 157, 182, 203]), Math.floor(rnd() * 255), Math.floor(rnd() * 255), Math.floor(1 + rnd() * 250)].join("."),
  DOB: () => `${1 + Math.floor(rnd() * 28)}/${1 + Math.floor(rnd() * 12)}/${1965 + Math.floor(rnd() * 40)}`,
};

// ---- hard negatives: look sensitive, are not ----
const N = {
  aadhaar_bad_checksum: () => { let d; do { d = String(2 + Math.floor(rnd() * 8)) + dig(11); } while (/^(\d)\1+$/.test(d) || verhoeffOk(d)); return d.slice(0, 4) + " " + d.slice(4, 8) + " " + d.slice(8); },
  order_id: () => pick(["Order #", "order id ", "Ref no. ", "Txn ID "]) + dig(12),
  card_bad_luhn: () => { let b; do { b = "4" + dig(15); } while (luhnValid(b)); return b.match(/.{4}/g).join(" "); },
  ten_digits_low: () => pick(["1", "2", "3", "4", "5"]) + dig(9),
  pincode: () => "pincode " + String(1 + Math.floor(rnd() * 8)) + dig(5),
  git_sha: () => alnum(40, "0123456789abcdef"),
  uuid: () => [alnum(8, "0123456789abcdef"), alnum(4, "0123456789abcdef"), "4" + alnum(3, "0123456789abcdef"), alnum(4, "0123456789abcdef"), alnum(12, "0123456789abcdef")].join("-"),
  version: () => `v${1 + Math.floor(rnd() * 5)}.${Math.floor(rnd() * 20)}.${Math.floor(rnd() * 30)}`,
  price: () => "₹" + (1000 + Math.floor(rnd() * 90000)).toLocaleString("en-IN"),
  isbn: () => "ISBN 978" + dig(10),
  aws_example: () => "AKIAIOSFODNN7EXAMPLE",
  key_placeholder: () => pick(["sk-your-api-key-here", "OPENAI_API_KEY=<your key>", "api_key = 'xxxxxxxxxxxxxxxx'", "Bearer YOUR_TOKEN"]),
  private_ip: () => pick(["192.168.1.", "10.0.0.", "127.0.0."]) + Math.floor(1 + rnd() * 250),
  password_word: () => pick(["how do I reset my password", "password policy for the team", "forgot password page", "the password field is not showing"]),
  date_plain: () => `${1 + Math.floor(rnd() * 28)}/${1 + Math.floor(rnd() * 12)}/2025`,
  phone_like_math: () => `${dig(5)} x ${dig(5)}`,
};
function verhoeffOk(d) { return verhoeffCheckDigit(d.slice(0, 11)) === Number(d[11]); }

// ---- templates: {X} = planted sensitive value of kind X, {~x} = hard negative x ----
const T = [
  // ID-heavy personal messages (English / Hinglish)
  "Hi, I'm filling a KYC form. My Aadhaar is {AADHAAR} and PAN {PAN}. Can you check if the format looks right?",
  "Bhai mera Aadhaar {AADHAAR} hai aur PAN {PAN}, ITR file karne ke liye kya documents chahiye?",
  "Write a polite email to my landlord. Pay rent to {UPI_ID} — wait, he says the UPI is wrong. My number is {IN_PHONE}.",
  "Draft a leave application. Name: Rohit, employee email {EMAIL}, phone {IN_PHONE}, DOB {DOB}.",
  "My HDFC account number is {BANK_ACCOUNT} and IFSC {IFSC}. Write a message asking my client to transfer the advance.",
  "Can you format this neatly?\nName: Meera Iyer\nPassport no: {PASSPORT}\nAadhaar: {AADHAAR}\nMobile: {IN_PHONE}\nEmail: {EMAIL}",
  "Fix the grammar: 'Respected sir, i have paid the fees from card {CARD} but it is not reflecting, my ref is {~order_id}'",
  "Mera voter id {VOTER_ID} hai, naam galat print hua hai. Correction ke liye letter likh do.",
  "Help me write a complaint to the bank. My debit card {CARD} was charged twice for {~price}. Account no {BANK_ACCOUNT}.",
  "GST invoice details: GSTIN {GSTIN}, billing email {EMAIL}. Please convert to a table.",
  "Translate to Hindi: 'Please send the payment to {UPI_ID} or call me on {IN_PHONE}.'",
  "Is this a scam? Someone called from {IN_PHONE} asking for my Aadhaar {AADHAAR} and OTP. I gave the OTP {PASSWORD_OTP} already 😟",
  "Summarise my insurance form: policy holder DOB {DOB}, PAN {PAN}, nominee phone {IN_PHONE}.",
  // secrets in dev pastes
  "Why does this fail?\n```python\nimport openai\nclient = openai.OpenAI(api_key=\"{OPENAI_KEY}\")\nprint(client.models.list())\n```",
  "My .env file:\nDATABASE_URL=postgres://admin:{DB_PASSWORD}@db.internal.acme.in:5432/prod\nGEMINI_API_KEY={GOOGLE_KEY}\nDEBUG=true\nIt says connection refused, help.",
  "curl https://api.anthropic.com/v1/messages -H \"x-api-key: {ANTHROPIC_KEY}\" -H \"content-type: application/json\" — getting 401, what am I doing wrong?",
  "aws configure keeps failing. aws_access_key_id = {AWS_ACCESS_KEY}\naws_secret_access_key = {AWS_SECRET}\nregion = ap-south-1",
  "git push asks for a password, I used my token {GITHUB_TOKEN} but it still says authentication failed.",
  "Slack bot not posting. SLACK_BOT_TOKEN={SLACK_TOKEN} and channel is #alerts. Here is my code: ...",
  "Decode this JWT and tell me when it expires: {JWT}",
  "HF download error, I set HF_TOKEN={HF_TOKEN} in my notebook. Commit {~git_sha} broke it.",
  "My wifi router admin password is {PASSWORD} and the public IP is {IP_ADDRESS}. How do I open port 8080?",
  "Login keeps failing. username: kavya.n password: {PASSWORD}. Is the site down?",
  "Server {IP_ADDRESS} returns 502 after deploy {~version}. Logs attached. request id {~uuid}",
  // mixed
  "Make a cover letter. Contact: {EMAIL}, {IN_PHONE}. I worked on payments (cards like 4111…) at Paytm.",
  "Compare these two plans for me. I pay with card {CARD}; my company GSTIN is {GSTIN}.",
];

// pure hard-negative templates (nothing sensitive inside)
const TN = [
  "My order {~order_id} hasn't arrived. Courier says pincode issue: {~pincode}. What should I write to support?",
  "Is {~aadhaar_bad_checksum} a valid Aadhaar format? I saw it on a fake ID sample online.",
  "Test card for Stripe docs is {~card_bad_luhn}? It keeps getting declined in test mode.",
  "AWS docs use {~aws_example} as the access key. Where do I put my own key — in {~key_placeholder}?",
  "Which is bigger, {~ten_digits_low} or {~phone_like_math}? Show working.",
  "Explain this error from commit {~git_sha} on build {~version}: request {~uuid} timed out.",
  "My router is at {~private_ip}. {~password_word} — the steps please.",
  "Book costs {~price}, {~isbn}. Should I buy the hardcover?",
  "The meeting is on {~date_plain}. Draft an agenda for the product review.",
  "Write a Python function that validates Indian PAN numbers using regex.",
  "What is the difference between Aadhaar VID and the Aadhaar number? Which one should I share with my bank?",
  "Generate 5 sample API keys formatted like sk-xxxx for my test fixtures (not real ones).",
  "My PIN code changed after we moved, how do I update it in my bank records?",
  "Explain how UPI handles like name@okaxis work internally.",
];

function fill(tmpl) {
  let text = "", spans = [], i = 0;
  const re = /\{(~?)([A-Za-z_]+)\}/g;
  let m;
  while ((m = re.exec(tmpl)) !== null) {
    text += tmpl.slice(i, m.index);
    i = m.index + m[0].length;
    if (m[1] === "~") { text += N[m[2]](); continue; }
    let kind = m[2], value;
    if (kind === "PASSWORD_OTP") { kind = "PASSWORD"; value = dig(6); }
    else if (kind === "DB_PASSWORD") { kind = "DB_URL"; value = G.DB_PASSWORD(); }
    else value = G[kind]();
    spans.push({ start: text.length, end: text.length + value.length, kind, value });
    text += value;
  }
  text += tmpl.slice(i);
  return { text, spans };
}

if (process.env.HELDOUT) {
  T.length = 0; TN.length = 0;
  T.push(
    "pls help me fill this railway concession form\nAadhaar No. - {AADHAAR}\nMob - {IN_PHONE}\nmail id - {EMAIL}",
    "Can u check why my refund failed? Paid via {UPI_ID}, card ending… actually full card is {CARD}",
    "Rewrite this professionally: hey sir, salary credit nahi hua, acct no {BANK_ACCOUNT} ifsc {IFSC} pls check",
    "I am applying for a home loan. PAN card {PAN}. Aadhaar {AADHAAR}. What CIBIL score do I need?",
    "Translate into Tamil: My passport number is {PASSPORT} and it expires next year.",
    "Draft a reply to the vendor: our GSTIN is {GSTIN}, send the invoice to {EMAIL} by Friday.",
    "Here's my docker-compose:\n  environment:\n    - OPENAI_API_KEY={OPENAI_KEY}\n    - REDIS_URL=redis://default:{DB_PASSWORD}@cache:6379\nwhy does it crash?",
    "Explain this stack trace. (token used: {GITHUB_TOKEN})\nTraceback (most recent call last): ...",
    "export ANTHROPIC_API_KEY={ANTHROPIC_KEY}\npython agent.py\n-> 403 forbidden. ideas?",
    "Set up boto3 for me. key id {AWS_ACCESS_KEY}, aws secret key {AWS_SECRET}",
    "Netflix login: email {EMAIL} password - {PASSWORD}. My brother changed it, how to recover?",
    "Help me write my bio for the matrimony site. DOB {DOB}, contact {IN_PHONE}, voter id {VOTER_ID}",
    "Parse this JSON: {\"user\":\"neha\",\"phone\":\"{IN_PHONE}\",\"aadhaar\":\"{AADHAAR}\"}",
    "The webhook uses Authorization: Bearer {JWT} — is that safe to commit?",
    "Why is my HF space failing? token={HF_TOKEN}",
    "Post this in the team channel: server {IP_ADDRESS} is down, use backup. Slack token for the bot is {SLACK_TOKEN}",
    "Make a table of my cards: HDFC {CARD}, SBI {CARD}",
    "Mummy ka Aadhaar {AADHAAR} aur mera {AADHAAR} — dono link karne hain, process batao",
    "Google Maps key {GOOGLE_KEY} stopped working after billing change",
    "otp is {PASSWORD_OTP}, why is the bank asking again?"
  );
  TN.push(
    "My PNR is {~order_id}, train delayed. Write a complaint to IRCTC.",
    "Compute 4521 7845 1236 9874 mod 97 step by step.",
    "Summarise RFC 1918: what are 10.0.0.0/8 and 192.168.0.0/16 used for?",
    "I got this tracking number {~order_id}, which courier is it?",
    "Write a regex for Indian mobile numbers like 98XXXXXXXX.",
    "What does the error code {~uuid} mean in Azure?",
    "How do I generate a strong password for my wifi?",
    "The invoice total is {~price} for 12 items. Split it among 4 people."
  );
}
const rows = [];
const NP = process.env.HELDOUT ? 400 : 900, NN = process.env.HELDOUT ? 200 : 300;
for (let k = 0; k < NP; k++) {
  const t = T[k % T.length];
  rows.push({ id: `p${k}`, split: "positive", ...fill(t) });
}
for (let k = 0; k < NN; k++) {
  const t = TN[k % TN.length];
  rows.push({ id: `n${k}`, split: "negative", ...fill(t) });
}
for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
