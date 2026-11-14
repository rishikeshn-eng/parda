// Leak Hunt: round generator. Every value is generated in the browser (checksums valid where the
// real format has one), so nothing real is ever shown. Decoys look sensitive but are not.
import { verhoeffCheckDigit, luhnValid, gstinCheckChar, scan } from "./parda.js";

const R = () => Math.random();
const pick = a => a[Math.floor(R() * a.length)];
const dig = k => Array.from({ length: k }, () => Math.floor(R() * 10)).join("");
const up = k => Array.from({ length: k }, () => String.fromCharCode(65 + Math.floor(R() * 26))).join("");
const al = (k, s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") => Array.from({ length: k }, () => s[Math.floor(R() * s.length)]).join("");

const aadhaar = () => { const b = String(2 + Math.floor(R() * 8)) + dig(10); const d = b + verhoeffCheckDigit(b); return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`; };
const badAadhaar = () => { let d; do { d = String(2 + Math.floor(R() * 8)) + dig(11); } while (verhoeffCheckDigit(d.slice(0, 11)) === +d[11]); return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`; };
const card = () => { let b = pick(["4", "5" + (1 + Math.floor(R() * 5)), "6521"]); b += dig(15 - b.length); for (let c = 0; c < 10; c++) if (luhnValid(b + c)) return (b + c).match(/.{4}/g).join(" "); };
const badCard = () => { let b; do { b = "4" + dig(15); } while (luhnValid(b)); return b.match(/.{4}/g).join(" "); };
const gstin = () => { const f = String(10 + Math.floor(R() * 20)) + up(3) + "P" + up(1) + dig(4) + up(1) + "1Z"; return f + gstinCheckChar(f); };

// value makers: [value, why it matters]
export const V = {
  AADHAAR: () => [aadhaar(), "12 digits that pass Aadhaar's Verhoeff checksum. With your name, it's enough for SIM and loan fraud."],
  PAN: () => [up(3) + "P" + up(1) + dig(4) + up(1), "PAN format: 5 letters, 4 digits, 1 letter, and the 4th letter P means a person."],
  CARD: () => [card(), "Passes the Luhn check every real card number passes."],
  UPI_ID: () => [pick(["rahul.s", "priya" + dig(2), "kiran" + dig(3), "9" + dig(9)]) + "@" + pick(["okaxis", "ybl", "oksbi", "paytm"]), "A UPI handle. With your phone number, it's the first thing payment scammers ask for."],
  IN_PHONE: () => [pick(["+91 ", ""]) + pick(["9", "8", "7"]) + dig(4) + " " + dig(5), "A mobile number. It's your OTP channel and your WhatsApp identity."],
  EMAIL: () => [pick(["meera.iyer", "ravi.t", "anil" + dig(2), "sneha.k"]) + "@" + pick(["gmail.com", "outlook.com", "acme.in"]), "Your email links this chat to you."],
  BANK_ACCOUNT: () => [dig(12), "An account number, introduced by the word 'account'."],
  IFSC: () => [pick(["SBIN", "HDFC", "ICIC", "UTIB"]) + "0" + dig(6), "IFSC: 4-letter bank code, a 0, then the branch."],
  PASSWORD: () => [pick(["Rahul@1992", "qwerty#2024", "Mumbai$123", "Sunshine!77", "Delhi@6"]), "A password. Never paste one, even into a 'safe' chatbot."],
  OTP: () => [dig(6), "An OTP. Anyone with it can finish a login or a payment as you."],
  OPENAI_KEY: () => ["sk-proj-" + al(40), "An OpenAI key (sk-proj-…). Leaked keys are found and abused within minutes."],
  AWS_ACCESS_KEY: () => ["AKIA" + al(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), "AWS access key: AKIA + 16 characters."],
  GITHUB_TOKEN: () => ["ghp_" + al(36), "GitHub token (ghp_…). It can push to every repo you own."],
  GOOGLE_KEY: () => ["AIza" + al(35, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"), "Google / Gemini API key (AIza…)."],
  DB_PASSWORD: () => [pick(["s3cr3tPass9", "Adm1n!2024", "prodpass99"]), "The password inside a database URL (user:PASSWORD@host)."],
  GSTIN: () => [gstin(), "GSTIN: state code + PAN + check character."],
  JWT: () => ["eyJhbGciOiJIUzI1NiJ9.eyJ" + al(24) + "." + al(30, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"), "A login token (JWT). Whoever holds it is logged in as you."],
};
// decoys: [value, why it is fine]
export const D = {
  BAD_AADHAAR: () => [badAadhaar(), "Looks like Aadhaar but fails the Verhoeff checksum. Not a real number."],
  BAD_CARD: () => [badCard(), "16 digits, but it fails the Luhn check. Not a card."],
  ORDER: () => [dig(12), "An order number. 12 digits, but the word 'order' says what it is."],
  PRICE: () => ["₹" + (1000 + Math.floor(R() * 90000)).toLocaleString("en-IN"), "A price. Not personal."],
  PINCODE: () => [String(1 + Math.floor(R() * 8)) + dig(5), "A PIN code is a whole area, not you."],
  SHA: () => [al(12, "0123456789abcdef"), "A git commit hash. Public, not a secret."],
  EXAMPLE_KEY: () => ["AKIAIOSFODNN7EXAMPLE", "AWS's own documentation example key. It even says EXAMPLE."],
  VERSION: () => [`v${1 + Math.floor(R() * 4)}.${Math.floor(R() * 12)}.${Math.floor(R() * 20)}`, "A version number."],
  DATE: () => [`${1 + Math.floor(R() * 28)}/${1 + Math.floor(R() * 12)}/2025`, "A meeting date, not a birth date."],
  PLACEHOLDER: () => ["sk-your-key-here", "A placeholder, not a key."],
};

// templates: {X} = sensitive, {~X} = decoy
const LEVELS = [
  { name: "Rookie", time: 22, rounds: [
    "Hi! Can you write a polite message to my landlord? I paid rent to {UPI_ID}. Call me on {IN_PHONE} if needed.",
    "Fix my grammar: 'my aadhaar is {AADHAAR} and i want to link it with pan {PAN}'",
    "Draft a leave mail. My email is {EMAIL}, the trip is on {~DATE}.",
    "My order {~ORDER} costs {~PRICE}. Write a complaint to the shop. My number: {IN_PHONE}",
    "Bank details for the client: account {BANK_ACCOUNT}, IFSC {IFSC}. Make it sound professional.",
  ] },
  { name: "Analyst", time: 20, rounds: [
    "Is {~BAD_AADHAAR} a valid Aadhaar format? My real one is {AADHAAR}, just checking the pattern.",
    "Card {CARD} got charged twice for {~PRICE}. The test card from the docs is {~BAD_CARD}, ignore that one.",
    "Translate to Hindi: 'Send payment to {UPI_ID}, delivery pincode {~PINCODE}'.",
    "Bhai mera PAN {PAN} hai aur GSTIN {GSTIN}, invoice ka format bana do.",
    "Someone called asking for my OTP. I already told them {OTP} 😟 what now? My number is {IN_PHONE}.",
  ] },
  { name: "Spy", time: 20, rounds: [
    "Why does this fail?\nclient = OpenAI(api_key=\"{OPENAI_KEY}\")\n# commit {~SHA}",
    "My .env:\nDATABASE_URL=postgres://admin:{DB_PASSWORD}@db.acme.in/app\nAWS_KEY={AWS_ACCESS_KEY}\nIt says auth failed.",
    "The AWS docs use {~EXAMPLE_KEY}. Mine is {AWS_ACCESS_KEY}. Why is mine rejected?",
    "git push fails with my token {GITHUB_TOKEN} on {~VERSION}. Help!",
    "Decode this login token and tell me when it expires: {JWT}",
  ] },
  { name: "Boss", time: 18, rounds: [
    "Netflix login: {EMAIL} / password {PASSWORD}. My brother changed it, how do I get it back? Order {~ORDER}.",
    "Format as a table:\nAadhaar {AADHAAR}\nPAN {PAN}\nMobile {IN_PHONE}\nUPI {UPI_ID}\nPIN code {~PINCODE}",
    "GEMINI_API_KEY={GOOGLE_KEY} and placeholder OPENAI_API_KEY={~PLACEHOLDER} — which one is wrong?",
    "Help me fill the KYC form. Aadhaar {AADHAAR}, card {CARD}, decoy sample {~BAD_AADHAAR} from the website.",
    "Rewrite: 'sir pls refund to a/c {BANK_ACCOUNT}, ifsc {IFSC}, my upi {UPI_ID}, ph {IN_PHONE}'",
  ] },
];
export { LEVELS };

/** Build one round: text plus marked spans (sensitive and decoy) with explanations. */
export function makeRound(template) {
  let text = "", spans = [], i = 0;
  const re = /\{(~?)([A-Z_]+)\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    text += template.slice(i, m.index);
    i = m.index + m[0].length;
    const [value, why] = (m[1] ? D : V)[m[2]]();
    spans.push({ start: text.length, end: text.length + value.length, value, kind: m[2], decoy: !!m[1], why });
    text += value;
  }
  text += template.slice(i);
  // what parda itself finds, for the reveal ("the scanner caught this")
  const found = scan(text);
  for (const s of spans) s.parda = found.some(f => f.start < s.end && s.start < f.end);
  return { text, spans };
}
