// parda: find secrets and personal identifiers in text before it is pasted into a chatbot,
// swap them for placeholders, and put the real values back into the chatbot's answer.
// One ES module, used unchanged by the browser demo and the Node benchmark.

// ---------- checksums ----------

const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const VINV = [0,4,3,2,1,5,6,7,8,9];

export function verhoeffValid(digits) {
  let c = 0;
  const a = digits.split("").reverse().map(Number);
  for (let i = 0; i < a.length; i++) c = VD[c][VP[i % 8][a[i]]];
  return c === 0;
}

export function verhoeffCheckDigit(digits) {
  let c = 0;
  const a = digits.split("").reverse().map(Number);
  for (let i = 0; i < a.length; i++) c = VD[c][VP[(i + 1) % 8][a[i]]];
  return VINV[c];
}

export function luhnValid(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

function ibanValid(s) {
  const t = s.replace(/\s/g, "").toUpperCase();
  const r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return m === 1;
}

function entropy(s) {
  const f = {};
  for (const ch of s) f[ch] = (f[ch] || 0) + 1;
  let h = 0;
  for (const k in f) { const p = f[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// Values that are obviously documentation examples or fill-in placeholders, not real secrets.
const PLACEHOLDER = /EXAMPLE|XXXX|xxxx|^x{3,}$|\*{4}|your[_-]?(?:api[_-]?)?key|<[^>]+>|\.\.\.|0123456789|1234567890|abcdefghij|tokentoken|(?<rep>\w{3,})\k<rep>\k<rep>/i;
const FILLER = /^(password|passwd|pass|pwd|secret|changeme|mypassword|yourpassword|your_password|admin|root|user|username|test|dummy|placeholder|token|key)$/i;
function looksPlaceholder(v) {
  if (PLACEHOLDER.test(v) || FILLER.test(v)) return true;
  const core = v.replace(/^[a-z]+[-_]/i, "");
  return core.length >= 8 && new Set(core).size <= 3;
}

const digitsOnly = s => s.replace(/\D/g, "");
// a "password" value that is really code: method calls, attribute access, indexing, type names
const CODEY = /[()[\]{}<>]|^\$\w|^[A-Za-z_]\w*\.[A-Za-z_]|^(?:true|false|null|none|undefined|string|str|int|self|this|new|required|hashed_\w+)$/i;
const PW_WORDS = /^(sha1|sha256|md5|bcrypt|argon2|hash|hashed|generator|reset|validators?|based|policy|field|manager|strength|length|protected|recovery|authentication|login|change|update|expired?|required|incorrect|invalid|null|none|empty|value)$/i;
// a number that is the value of some other named field ("marketCap": 6024...) is not an ID
const OTHER_FIELD = /["']?([A-Za-z_][\w-]*)["']?\s*[:=]\s*["']?$/;
function fieldOk(t, idx, want) { const m = t.slice(Math.max(0, idx - 40), idx).match(OTHER_FIELD); return !m || want.test(m[1]); }
const BANK_CODES = new Set("SBIN HDFC ICIC UTIB PUNB KKBK BARB CNRB UBIN BKID IDIB IOBA UCBA CBIN MAHB PSIB YESB INDB IDFB FDRL KARB KVBL SIBL CIUB DCBL RATN AUBL ESFB UJVN JAKA TMBL CSBK DLXB NKGS ABHY SVCB COSB HSBC SCBL CITI DEUT BOFA PYTM AIRP FINO JSFB SURY UTKS NSPB IPOS".split(" "));
const IBAN_CC = new Set("AD AE AL AT AZ BA BE BG BH BR BY CH CR CY CZ DE DK DO EE EG ES FI FO FR GB GE GI GL GR GT HR HU IE IL IQ IS IT JO KW KZ LB LC LI LT LU LV MC MD ME MK MR MT MU NL NO PK PL PS PT QA RO RS SA SC SE SI SK SM ST SV TL TN TR UA VA VG XK".split(" "));
const NOT_ID_CONTEXT = /(?:\b(?:order|ref|reference|txn|transaction|invoice|tracking|awb|booking|pnr|ticket|request|isbn|serial|imei|msisdn|timestamp|time|start|end|deadline|id|item|sku|product|size|bytes|volume|count|shares|cap|ean|barcode|upc)|_id)\b[^\n]{0,12}$/i;

// ---------- detectors ----------
// kind: what it is; sev: 3 = never paste (secret / government ID / card), 2 = personal, 1 = low.
// group: which capture group holds the value (default 0). validate(value, match, text) -> bool.

const UPI_PSP = "ybl|ibl|axl|upi|paytm|apl|okaxis|oksbi|okhdfcbank|okicici|axisbank|hdfcbank|icici|sbi|kotak|" +
  "yesbank|freecharge|airtel|jupiteraxis|fbl|slice|superyes|waaxis|wahdfcbank|waicici|wasbi|naviaxis|" +
  "pthdfc|ptsbi|ptyes|ptaxis|idfcfirst|federal|indus|aubank|rbl|barodampay|pnb|cnrb|unionbank|boi|ikwik|abfspay";

export const DETECTORS = [
  // --- secrets ---
  { kind: "PRIVATE_KEY", label: "Private key", sev: 3, re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/=]{40,}[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/g },
  { kind: "ANTHROPIC_KEY", label: "Anthropic API key", sev: 3, re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}/g },
  { kind: "OPENAI_KEY", label: "OpenAI API key", sev: 3, re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g,
    validate: v => !v.startsWith("sk-ant-") && /\d/.test(v) && /[A-Za-z]/.test(v.slice(3)) },
  { kind: "GOOGLE_KEY", label: "Google / Gemini API key", sev: 3, re: /\bAIza[0-9A-Za-z_-]{35}(?![\w-])/g },
  { kind: "AWS_ACCESS_KEY", label: "AWS access key", sev: 3, re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "AWS_SECRET", label: "AWS secret key", sev: 3, group: 1,
    re: /aws.{0,24}?(?:secret|sk).{0,24}?[\s"'=:]([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi },
  { kind: "GITHUB_TOKEN", label: "GitHub token", sev: 3, re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { kind: "SLACK_TOKEN", label: "Slack token", sev: 3, re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "STRIPE_KEY", label: "Stripe key", sev: 3, re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
  { kind: "TELEGRAM_TOKEN", label: "Telegram bot token", sev: 3, re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { kind: "HF_TOKEN", label: "Hugging Face token", sev: 3, re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { kind: "JWT", label: "Login token (JWT)", sev: 3, re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "DB_URL", label: "Database URL with password", sev: 3, group: 1,
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|mssql):\/\/[^\s:/@]+:([^\s@/]{3,})@[^\s]+/gi,
    validate: v => !/^[$%{[]|^\\?\$/.test(v) },
  { kind: "BEARER", label: "Bearer token", sev: 3, group: 1, re: /\bBearer\s+([A-Za-z0-9._~+/-]{20,}=*)/g },
  { kind: "PASSWORD", label: "Password / PIN", sev: 3, group: 3,
    re: /\b(password|passwd|pwd|passcode|pin|otp|mpin|upi pin|atm pin)\b(?![-_.\\])((?:\s+(?:is|hai|h|was|=|:|-))*\s*[:=]?)\s*["'`]?([^\s"'`,;]{4,64})/gi,
    validate: (v, m) => !CODEY.test(v) && !/^[-_.\\]/.test(v) && /\s|[:=]$/.test(m[0].slice(m[1].length, m[0].length - v.length) || " ") &&
      (/[:=]|\b(is|hai|h|was)\b/i.test(m[2]) || /\d/.test(v)) && !PW_WORDS.test(v.replace(/[.!?]+$/, "")) &&
      !(/^[A-Za-z_]+$/.test(v) && !/["'`]$/.test(m[0].slice(0, m[0].length - v.length))) && !/^(is|hai|was|the|for|and|reset|change|kya|kaise|hoga|nahi|please|required|incorrect|wrong|forgot|manager|policy|field|protected|strength|length|hash|hashing|reset)$/i.test(v)
      && !/^(\*+|x+|\.+)$/i.test(v) && !(m[1].toLowerCase() === "pin" && !/^\d{4,6}$/.test(v)) && !(/^(otp|mpin)$/i.test(m[1]) && !/^\d{4,8}$/.test(v)) },
  { kind: "API_SECRET", label: "API key / secret", sev: 3, group: 1,
    re: /\b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?token|auth[_-]?token|token)\b\s*["']?\s*[:=]\s*["']?([A-Za-z0-9_\-/+=.]{16,})/gi,
    validate: v => entropy(v) >= 3.3 && /\d/.test(v) && /[A-Za-z]/.test(v) && !/secret|token|password|passwd|[-_]key/i.test(v) && !/=$/.test(v) },

  // --- India ---
  { kind: "AADHAAR", label: "Aadhaar number", sev: 3, re: /(?<![\p{L}\p{N}_+.-]|\d[ -])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![\p{L}\p{N}_-]|[ -]\d|\.\d)/gu,
    validate: (v, m, t) => { const d = digitsOnly(v); return d.length === 12 && verhoeffValid(d) && !/^(\d)\1+$/.test(d) && !/^91[6-9]/.test(d) && !/0{6}/.test(d) && t[m.index - 1] !== "/" && fieldOk(t, m.index, /aadh|adhar|uid|aadhaar/i) && !NOT_ID_CONTEXT.test(t.slice(Math.max(0, m.index - 24), m.index)); } },
  { kind: "VID", label: "Aadhaar virtual ID", sev: 3, re: /(?<![\w-]|\d[ -])\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}(?![\w-]|[ -]\d)/g,
    validate: (v, m, t) => verhoeffValid(digitsOnly(v)) && /\b(vid|virtual id)\b/i.test(t.slice(Math.max(0, m.index - 40), m.index)) },
  { kind: "PAN", label: "PAN", sev: 3, re: /\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/g },
  { kind: "GSTIN", label: "GSTIN", sev: 2, re: /\b(?:0[1-9]|[1-3]\d)[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g,
    validate: v => gstinCheckChar(v.slice(0, 14)) === v[14] },
  { kind: "UPI_ID", label: "UPI ID", sev: 2, re: new RegExp(`\\b[A-Za-z0-9._-]{2,64}@(?:${UPI_PSP})\\b(?!\\.[A-Za-z])`, "gi"),
    validate: v => !/^(name|user|username|yourname|your\.?name|example|abc|xyz|test|handle|id|upiid|mobile|phone|number)@/i.test(v) },
  { kind: "IFSC", label: "IFSC code", sev: 1, re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    validate: (v, m, t) => /\d/.test(v.slice(5)) && (BANK_CODES.has(v.slice(0, 4)) || /ifsc|bank|branch|neft|rtgs|imps/i.test(t.slice(Math.max(0, m.index - 60), m.index + 40))) },
  { kind: "IN_PHONE", label: "Indian mobile number", sev: 2, re: /(?<![\p{L}\p{N}_+.]|\d[ -])(?:\+91[\s-]?|91[\s-]|0)?[6-9]\d{4}[\s-]?\d{5}(?![\p{L}\p{N}_]|[ -]\d|\.\d)/gu,
    validate: (v, m, t) => { const d = digitsOnly(v); const core = d.slice(-10); return !/^(\d)\1+$/.test(core) && !/^(?:9876543210|1234567890)$/.test(core) &&
      fieldOk(t, m.index, /phone|mobile|mob|contact|tel|whatsapp|number|num|msisdn|cell/i) && !NOT_ID_CONTEXT.test(t.slice(Math.max(0, m.index - 24), m.index)) && t[m.index - 1] !== "="; } },
  { kind: "BANK_ACCOUNT", label: "Bank account number", sev: 3, group: 1,
    re: /\b(?:a\/c|acct|account|acc(?:ount)?\s*(?:no|number|num)|khata)\b(?![\s_-]*id\b|[\s_-]*Id)[^\d\n]{0,20}(\d{9,18})(?!\d)/gi,
    validate: (v, m) => !/test-$/i.test(m[0].slice(0, m[0].length - v.length)) },
  { kind: "PASSPORT", label: "Passport number", sev: 3, group: 1, re: /\bpassport\b[^\n]{0,25}?\b([A-PR-WY][1-9]\d\s?\d{4}[1-9])\b/gi },
  { kind: "VOTER_ID", label: "Voter ID (EPIC)", sev: 2, group: 1, re: /\b(?:voter|epic)\b[^\n]{0,25}?\b([A-Z]{3}\d{7})\b/gi },
  { kind: "DRIVING_LICENCE", label: "Driving licence", sev: 2, group: 1,
    re: /\b(?:driving licen[cs]e|\bDL\b)[^\n]{0,20}?\b([A-Z]{2}[ -]?\d{2}[ -]?(?:19|20)\d{2}[ -]?\d{7})\b/gi },

  // --- global ---
  { kind: "CARD", label: "Card number", sev: 3, re: /(?<![\w.-])(?:\d{4}[ -]?){3}\d{1,7}(?![\w-]|\.\d)|(?<![\w.-])\d{4}[ -]\d{6}[ -]\d{5}(?![\w-]|\.\d)/g,
    validate: (v, m, t) => { if (NOT_ID_CONTEXT.test(t.slice(Math.max(0, m.index - 24), m.index))) return false; const d = digitsOnly(v); return [15, 16, 19].includes(d.length) && (d.length !== 15 || /^3[47]/.test(d)) && t[m.index - 1] !== "+" && luhnValid(d) &&
      /^(4|5[0-5]|2[2-7]|3[47]|60|65|64[4-9]|62|67|8[12]|508|35|30[0-5]|36|38)/.test(d) && (!/[ -]/.test(v) || /^\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}$|^\d{4}[ -]\d{6}[ -]\d{5}$/.test(v)) && !/^(\d)\1+$/.test(d); } },
  { kind: "IBAN", label: "IBAN", sev: 3, re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, validate: v => IBAN_CC.has(v.slice(0, 2)) && /\d{6}/.test(v.replace(/\s/g, "")) && ibanValid(v) },
  { kind: "EMAIL", label: "Email address", sev: 2, re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    validate: v => !/@(?:example|test|email|domain|sample|no|abc|xyz|company|mail)\.(?:com|org|net)$/i.test(v) && !/^(?:example|test|user|name|john\.?doe|jane\.?doe|abc|xyz|someone|your\.?email|email)@/i.test(v) },
  { kind: "PHONE", label: "Phone number", sev: 1, re: /(?<![\w+])\+(?!91)\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g,
    validate: v => !/123.?456.?7890|1231234567|0{6}/.test(v.replace(/\D/g, "")) && !/^\+?1?\s?\(?123\)?/.test(v) },
  { kind: "IP_ADDRESS", label: "IP address", sev: 1, re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    validate: (v, m, t) => !/^(?:10|127|0)\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\.|^255\./.test(v) && v.split(".").length === 4 &&
      !/\.0\.0\.0$/.test(v) && !v.split(".").some(o => o.length > 1 && o[0] === "0") && !/[\/v-]$/.test(t[m.index - 1] || "") && !/^\.\d/.test(t.slice(m.index + v.length, m.index + v.length + 2)) &&
      !(v.split(".").every(o => +o <= 20) && !/\b(ip|host|server|addr|address|ping|dns)\b/i.test(t.slice(Math.max(0, m.index - 40), m.index))) },
  { kind: "DOB", label: "Date of birth", sev: 2, group: 1,
    re: /\b(?:dob|d\.o\.b|date of birth|born on|birth ?date|janam tithi)\b[^\d\n]{0,12}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gi,
    validate: v => { const y = +(v.match(/(\d{4})$/) || [0, 2000])[1]; return y === 0 || y >= 1920; } },
];

const KIND_INFO = Object.fromEntries(DETECTORS.map(d => [d.kind, { label: d.label, sev: d.sev }]));
KIND_INFO.CUSTOM = { label: "Your private term", sev: 2 };
export { KIND_INFO };

// ---------- scanning ----------

/**
 * Find sensitive spans. Returns [{start, end, value, kind, label, sev}], non-overlapping,
 * sorted by position. `custom` is a list of extra private terms (names, project code words).
 */
export function scan(text, { custom = [], minSev = 1 } = {}) {
  const found = [];
  for (const d of DETECTORS) {
    if (d.sev < minSev) continue;
    d.re.lastIndex = 0;
    let m;
    while ((m = d.re.exec(text)) !== null) {
      if (m[0].length === 0) { d.re.lastIndex++; continue; }
      const g = d.group || 0;
      const value = m[g];
      if (!value) continue;
      const s = g ? m.index + m[0].lastIndexOf(value) : m.index;
      if (d.validate && !d.validate(value, m, text)) continue;
      if (d.sev === 3 && /KEY|TOKEN|SECRET|PASSWORD|BEARER|JWT|DB_URL/.test(d.kind) && looksPlaceholder(value)) continue;
      found.push({ start: s, end: s + value.length, value, kind: d.kind, label: d.label, sev: d.sev });
    }
  }
  for (const term of custom) {
    const t = term.trim();
    if (t.length < 2) continue;
    const re = new RegExp(`(?<![\\w])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "gi");
    let m;
    while ((m = re.exec(text)) !== null)
      found.push({ start: m.index, end: m.index + m[0].length, value: m[0], kind: "CUSTOM", label: KIND_INFO.CUSTOM.label, sev: 2 });
  }
  // resolve overlaps: higher severity first, then longer span, then detector order
  const order = Object.fromEntries(DETECTORS.map((d, i) => [d.kind, i]));
  order.CUSTOM = -1;
  // keyword-anchored identity numbers beat bare patterns (an "account no" that happens to pass the
  // Aadhaar checksum is an account number); vendor-specific secret formats beat the generic one
  const ctx = { BANK_ACCOUNT: 1, PASSPORT: 1, VOTER_ID: 1, DRIVING_LICENCE: 1, VID: 1, DOB: 1, CUSTOM: 1, API_SECRET: -1 };
  found.sort((a, b) => b.sev - a.sev || (ctx[b.kind] || 0) - (ctx[a.kind] || 0) || (b.end - b.start) - (a.end - a.start) || order[a.kind] - order[b.kind]);
  const kept = [];
  for (const f of found) if (!kept.some(k => f.start < k.end && k.start < f.end)) kept.push(f);
  return kept.sort((a, b) => a.start - b.start);
}

// ---------- redact / restore ----------

/** Fake values in the same format (checksums valid) for "surrogate" redaction. */
function surrogate(kind, value, n, rng) {
  const dig = k => Array.from({ length: k }, () => Math.floor(rng() * 10)).join("");
  const up = k => Array.from({ length: k }, () => String.fromCharCode(65 + Math.floor(rng() * 26))).join("");
  switch (kind) {
    case "AADHAAR": { const b = String(2 + Math.floor(rng() * 8)) + dig(10); const d = b + verhoeffCheckDigit(b); return d.slice(0, 4) + " " + d.slice(4, 8) + " " + d.slice(8); }
    case "PAN": return up(3) + "P" + up(1) + dig(4) + up(1);
    case "IN_PHONE": return "9" + dig(9);
    case "EMAIL": return `person${n}@mail.example`;
    case "CARD": { let b = "4" + dig(14); for (let c = 0; c < 10; c++) if (luhnValid(b + c)) return b + c; return b + "0"; }
    case "UPI_ID": return value.replace(/^[^@]+/, m => fpe(m, rng));
    default: {
      // format-preserving: keep a known vendor prefix and every separator, randomise the rest by class
      const pre = (value.match(/^(?:sk-ant-api\d\d-|sk-proj-|sk-|AKIA|ASIA|AIza|gh[pousr]_|github_pat_|xox[abprs]-|hf_|eyJ)/) || [""])[0];
      return pre + fpe(value.slice(pre.length), rng);
    }
  }
}

function fpe(str, rng) {
  return str.replace(/[0-9]/g, () => String(Math.floor(rng() * 10)))
    .replace(/[A-Z]/g, () => String.fromCharCode(65 + Math.floor(rng() * 26)))
    .replace(/[a-z]/g, () => String.fromCharCode(97 + Math.floor(rng() * 26)));
}

function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/**
 * Replace each finding with a placeholder. style "tag" -> [AADHAAR_1]; "surrogate" -> fake value
 * of the same format. The same real value always maps to the same placeholder.
 * Returns {text, map: [{placeholder, value, kind}], findings}.
 */
export function redact(text, opts = {}) {
  const { style = "tag", seed = 7 } = opts;
  const findings = opts.findings || scan(text, opts);
  const rng = mulberry32(seed);
  const byValue = new Map(), counts = {}, map = [];
  let out = "", pos = 0;
  for (const f of findings) {
    let ph = byValue.get(f.value);
    if (!ph) {
      counts[f.kind] = (counts[f.kind] || 0) + 1;
      ph = style === "surrogate" ? surrogate(f.kind, f.value, counts[f.kind], rng) : `[${f.kind}_${counts[f.kind]}]`;
      byValue.set(f.value, ph);
      map.push({ placeholder: ph, value: f.value, kind: f.kind });
    }
    out += text.slice(pos, f.start) + ph;
    pos = f.end;
  }
  out += text.slice(pos);
  return { text: out, map, findings };
}

/** Put the real values back into a chatbot answer. Tolerates the model dropping brackets or changing case. */
export function restore(answer, map) {
  let out = answer;
  const sorted = [...map].sort((a, b) => b.placeholder.length - a.placeholder.length);
  for (const { placeholder, value } of sorted) {
    if (placeholder.startsWith("[")) {
      const core = placeholder.slice(1, -1).replace(/_/g, "[_ ]?");
      out = out.replace(new RegExp(`\\[?\\b${core}\\b\\]?`, "gi"), value);
    } else {
      out = out.split(placeholder).join(value);
    }
  }
  return out;
}

/** One-number summary for the UI: 0 safe ... 100 do not paste. */
export function riskScore(findings) {
  if (!findings.length) return 0;
  const s = findings.reduce((a, f) => a + (f.sev === 3 ? 45 : f.sev === 2 ? 15 : 5), 0);
  return Math.min(100, s);
}
