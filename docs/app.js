import { scan, redact, restore, riskScore, KIND_INFO } from "./parda.js";
import { LEVELS, makeRound } from "./game.js";

const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("parda:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("parda:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const pct = (a, b) => b ? `${(100 * a / b).toFixed(a === b ? 0 : 1)}%` : "–";

// ======================= GAME =======================
const G = { level: 0, round: 0, score: 0, combo: 1, hearts: 3, picked: new Set(), r: null, timer: null, left: 0, stats: null, done: false };
const progress = store.get("progress", { unlocked: 1, stars: [0, 0, 0, 0], best: 0 });

function drawMap() {
  $("#map").innerHTML = LEVELS.map((L, i) => {
    const locked = i >= progress.unlocked, s = progress.stars[i] || 0;
    return `<button class="node ${locked ? "locked" : ""} ${i === G.level ? "active" : ""}" data-i="${i}" ${locked ? "disabled" : ""}>
      ${locked ? "🔒" : ["🐣", "🕵️", "🥷", "👹"][i]} ${L.name} <span class="stars">${"★".repeat(s)}${"☆".repeat(3 - s)}</span></button>`;
  }).join("");
  $("#map").querySelectorAll(".node:not(.locked)").forEach(b => b.onclick = () => startLevel(+b.dataset.i));
}

function startLevel(i) {
  $("#start").classList.add("hidden");
  Object.assign(G, { level: i, round: 0, score: 0, combo: 1, hearts: 3, done: false, stats: { caught: 0, missed: 0, traps: 0, sensitive: 0, perfect: 0 } });
  $("#end").classList.add("hidden");
  drawMap();
  newRound();
}

function hud() {
  const L = LEVELS[G.level];
  $("#lvl").textContent = `${L.name} · ${Math.min(G.round + 1, L.rounds.length)}/${L.rounds.length}`;
  $("#score").textContent = `${G.score} pts`;
  $("#combo").textContent = `×${G.combo}`;
  $("#hearts").textContent = "♥".repeat(Math.max(0, G.hearts)) + "♡".repeat(Math.max(0, 3 - G.hearts));
}

function tokens(text, spans) {
  // split into words; a word that overlaps a planted span belongs to that span
  const out = [];
  const re = /\S+|\s+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m.index, e = s + m[0].length;
    const span = /^\s+$/.test(m[0]) ? -1 : spans.findIndex(p => s < p.end && p.start < e);
    out.push({ t: m[0], span, ws: /^\s+$/.test(m[0]) });
  }
  return out;
}

function newRound() {
  const L = LEVELS[G.level];
  G.r = makeRound(L.rounds[G.round]);
  G.picked = new Set();
  G.r.toks = tokens(G.r.text, G.r.spans);
  $("#bubble").innerHTML = G.r.toks.map((k, i) => k.ws ? esc(k.t) : `<span class="tok" data-i="${i}" data-s="${k.span}">${esc(k.t)}</span>`).join("");
  $("#bubble").querySelectorAll(".tok").forEach(el => el.onclick = e => tap(el, e));
  $("#reveal").innerHTML = "";
  $("#send").classList.remove("hidden"); $("#next").classList.add("hidden");
  $("#hint").textContent = "Tap each sensitive item, then press Send.";
  hud();
  clearInterval(G.timer);
  G.left = L.time * 10;
  const bar = $("#timer i");
  G.timer = setInterval(() => {
    G.left--;
    bar.style.width = `${100 * G.left / (L.time * 10)}%`;
    $("#timer").classList.toggle("low", G.left < 50);
    if (G.left <= 0) { clearInterval(G.timer); send(true); }
  }, 100);
}

function floatText(e, text, color) {
  const f = document.createElement("div");
  f.className = "float"; f.textContent = text; f.style.color = color;
  f.style.left = `${e.clientX - 20}px`; f.style.top = `${e.clientY - 30}px`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 900);
}

function tap(el, e) {
  if (G.done) return;
  const s = +el.dataset.s;
  const key = s >= 0 ? `s${s}` : `w${el.dataset.i}`;
  const on = !G.picked.has(key);
  on ? G.picked.add(key) : G.picked.delete(key);
  const group = s >= 0 ? $("#bubble").querySelectorAll(`.tok[data-s="${s}"]`) : [el];
  group.forEach(t => t.classList.toggle("sel", on));
  if (on) floatText(e, "🔍", "#17121f");
}

function send(timeout = false) {
  if (G.done) return;
  G.done = true;
  clearInterval(G.timer);
  const L = LEVELS[G.level];
  let gained = 0, missedSevere = 0, roundPerfect = true;
  const notes = [];
  G.r.spans.forEach((sp, i) => {
    const hit = G.picked.has(`s${i}`);
    const group = $("#bubble").querySelectorAll(`.tok[data-s="${i}"]`);
    if (sp.decoy) {
      if (hit) { gained -= 60; G.combo = 1; G.stats.traps++; roundPerfect = false; group.forEach(t => t.classList.add("trap")); notes.push(["trap", "Decoy −60", sp]); }
      else { group.forEach(t => t.classList.add("calm")); notes.push(["calm", "Fine to send", sp]); }
    } else {
      G.stats.sensitive++;
      if (hit) { const pts = 100 * G.combo; gained += pts; G.combo = Math.min(G.combo + 1, 5); G.stats.caught++; group.forEach(t => t.classList.add("ok")); notes.push(["ok", `Caught +${pts}`, sp]); }
      else { missedSevere++; G.combo = 1; G.stats.missed++; roundPerfect = false; group.forEach(t => t.classList.add("miss")); notes.push(["miss", "Leaked!", sp]); }
    }
  });
  // stray taps on ordinary words
  const stray = [...G.picked].filter(k => k.startsWith("w")).length;
  if (stray) { gained -= 10 * stray; $("#bubble").classList.add("shake"); setTimeout(() => $("#bubble").classList.remove("shake"), 300); }
  if (missedSevere) G.hearts -= 1;
  if (!timeout && roundPerfect) { const bonus = Math.round(G.left / 2); gained += bonus; notes.push(["ok", `Speed bonus +${bonus}`, null]); G.stats.perfect++; }
  G.score = Math.max(0, G.score + gained);
  hud();
  $("#hint").textContent = timeout ? "⏰ Time's up! The message went out." : missedSevere ? `💥 ${missedSevere} item(s) leaked.` : stray ? "Clean, but some taps hit ordinary words (−10 each)." : "🛡️ Clean send!";
  $("#reveal").innerHTML = notes.map(([cls, title, sp]) => sp ? `<div class="why pop"><span class="tag ${cls}">${title}</span><div><code>${esc(sp.value)}</code> · ${esc(sp.why)}${!sp.decoy ? (sp.parda ? " <span class='note'>(parda flags this.)</span>" : ` <span class='note'>(parda misses this one${sp.kind === "OTP" ? ": it only treats a number as an OTP when it comes right after the word" : ""}.)</span>`) : ""}</div></div>` : `<div class="why"><span class="tag ok">${title}</span><div>All found, nothing extra tapped.</div></div>`).join("");
  $("#send").classList.add("hidden"); $("#next").classList.remove("hidden");
  $("#next").textContent = G.hearts <= 0 || G.round + 1 >= L.rounds.length ? "See results →" : "Next message →";
}

function next() {
  const L = LEVELS[G.level];
  G.round++;
  G.done = false;
  if (G.hearts <= 0 || G.round >= L.rounds.length) return finish();
  newRound();
}

function finish() {
  const L = LEVELS[G.level], st = G.stats;
  const acc = st.sensitive ? st.caught / st.sensitive : 0;
  const stars = G.hearts <= 0 ? 0 : acc === 1 && st.traps === 0 ? 3 : acc >= 0.8 ? 2 : 1;
  progress.stars[G.level] = Math.max(progress.stars[G.level] || 0, stars);
  if (stars >= 1 && G.level + 1 >= progress.unlocked) progress.unlocked = Math.min(LEVELS.length, G.level + 2);
  progress.best = Math.max(progress.best || 0, G.score);
  store.set("progress", progress);
  const badges = [];
  if (st.traps === 0 && st.caught) badges.push("🎯 No decoys taken");
  if (acc === 1) badges.push("🛡️ Zero leaks");
  if (st.perfect >= 3) badges.push("⚡ Speed reader");
  if (G.level === 1 && st.traps === 0) badges.push("🔢 Checksum champion");
  if (G.level === 2 && acc === 1) badges.push("🗝️ Key keeper");
  const msg = G.hearts <= 0 ? "Too many leaks! Your data is in someone's training set now." : stars === 3 ? "Flawless. You'd make a good DLP system." : acc === 1 ? `No leaks, but ${st.traps} decoy${st.traps === 1 ? "" : "s"} fooled you.` : "Nice work. A few slipped through.";
  $("#end").innerHTML = `<h3>${L.name} ${G.hearts <= 0 ? "failed" : "complete"}</h3><div class="big">${G.score}</div>
    <div class="stars" style="font-size:34px;color:var(--orange)">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
    <p>${msg} Caught ${st.caught}/${st.sensitive}, decoys tapped ${st.traps}. Best score ${progress.best}.</p>
    <div class="badges">${badges.map(b => `<span class="badge pop">${b}</span>`).join("")}</div>
    <div class="cta" style="justify-content:center">${G.level + 1 < LEVELS.length && progress.unlocked > G.level + 1 ? `<button class="btn pink" id="nextlvl">Next level: ${LEVELS[G.level + 1].name} →</button>` : ""}<button class="btn white" id="retry">Play again</button><a class="btn white" href="#scan">Try the real scanner</a></div>`;
  $("#end").classList.remove("hidden"); $("#end").classList.add("pop");
  $("#reveal").innerHTML = "";
  $("#next").classList.add("hidden");
  drawMap();
  $("#retry").onclick = () => startLevel(G.level);
  if ($("#nextlvl")) $("#nextlvl").onclick = () => startLevel(G.level + 1);
}

$("#send").onclick = () => send(false);
$("#next").onclick = next;
$("#start").onclick = () => { $("#start").classList.add("hidden"); startLevel(Math.max(0, progress.unlocked - 1)); };
drawMap();
// nothing runs until the player presses Start (the timer would otherwise tick while they read the page)
$("#bubble").innerHTML = '<span class="note">Each round is a chat draft about to be sent. You get about 20 seconds per message and three hearts per level. Values are generated in your browser and never real.</span>';
$("#send").classList.add("hidden");
hud();

// ======================= SCANNER =======================
const SAMPLES = {
  "KYC form": "Please format neatly:\nName: Meera Iyer\nAadhaar: 4991 1866 5246\nPAN: ABCPE1234F\nMobile: +91 98765 43211\nUPI: meera.iyer@okaxis\nEmail: meera.iyer@gmail.com",
  ".env file": "My app won't start, here's my .env:\nOPENAI_API_KEY=sk-proj-Q2xKp7nRvB4mT9eLzA6sW1yHdF3gJ8cU5oX0iN\nDATABASE_URL=postgres://admin:Adm1n!2024@db.acme.in:5432/prod\nAWS_ACCESS_KEY_ID=AKIAQWERTY2345ZXCVBN\nDEBUG=true",
  "Bank email": "Rewrite professionally: sir pls transfer advance to a/c 123456789012, IFSC HDFC0001234, my phone 9123456789, card 4111 1111 1111 1111 got declined",
  "Decoys only": "My order 663938670727 hasn't arrived (pincode 247667). The AWS docs use AKIAIOSFODNN7EXAMPLE. Is 4527 0714 7141 a valid Aadhaar format?",
};
let style = "tag", last = null;
$("#samples").innerHTML = Object.keys(SAMPLES).map(k => `<button class="btn small white" data-k="${k}">${k}</button>`).join("");
$("#samples").querySelectorAll("button").forEach(b => b.onclick = () => { $("#input").value = SAMPLES[b.dataset.k]; run(); });
$("#style").querySelectorAll("button").forEach(b => b.onclick = () => {
  style = b.dataset.v; $("#style").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); run();
});

function run() {
  const text = $("#input").value;
  const custom = $("#custom").value.split(",").map(s => s.trim()).filter(Boolean);
  const findings = scan(text, { custom });
  const risk = riskScore(findings);
  $("#needle").style.left = `calc(${risk}% - 3px)`;
  $("#verdict").textContent = !text.trim() ? "Paste something above" : !findings.length ? "✅ Looks safe to paste" : findings.some(f => f.sev === 3) ? "⛔ Don't paste this as-is" : "⚠️ Personal details inside";
  const counts = {};
  findings.forEach(f => counts[f.label] = (counts[f.label] || 0) + 1);
  $("#found").innerHTML = Object.entries(counts).map(([k, v]) => `<span>${esc(k)} × ${v}</span>`).join("");
  let html = "", pos = 0;
  for (const f of findings) { html += esc(text.slice(pos, f.start)) + `<mark class="s${f.sev}" title="${esc(f.label)}">${esc(f.value)}<small>${esc(f.label)}</small></mark>`; pos = f.end; }
  $("#marked").innerHTML = html + esc(text.slice(pos)) || '<span class="note">Highlights appear here.</span>';
  last = redact(text, { findings, style });
  $("#safe").textContent = last.text || "";
  runRestore();
}
function runRestore() {
  const a = $("#answer").value;
  $("#restored").textContent = a && last ? restore(a, last.map) : "";
  if (!a) $("#restored").innerHTML = '<span class="note">Restored answer appears here.</span>';
}
$("#input").addEventListener("input", run);
$("#custom").addEventListener("input", run);
$("#answer").addEventListener("input", runRestore);
$("#copy").onclick = async () => { try { await navigator.clipboard.writeText(last ? last.text : ""); $("#copied").textContent = "Copied ✓"; } catch { $("#copied").textContent = "Select and copy manually"; } setTimeout(() => $("#copied").textContent = "", 1800); };
$("#input").value = SAMPLES["KYC form"]; run();

// ======================= RESULTS =======================
fetch("data/results.json").then(r => r.json()).then(R => {
  const corpusN = R.corpus.reduce((a, c) => a + c.messages, 0), severe = R.corpus.reduce((a, c) => a + c.messages_with_severe, 0);
  const pH = R.presidio.heldout, secretKinds = ["OPENAI_KEY", "ANTHROPIC_KEY", "GITHUB_TOKEN", "AWS_ACCESS_KEY", "AWS_SECRET", "GOOGLE_KEY", "JWT", "HF_TOKEN", "SLACK_TOKEN", "DB_URL", "PASSWORD"];
  const presSecrets = secretKinds.reduce((a, k) => [a[0] + (pH.recall_per_kind[k]?.[0] || 0), a[1] + (pH.recall_per_kind[k]?.[1] || 0)], [0, 0]);
  const v2 = R.precision_v02;
  const sev = v2.by_severity["severe (never paste)"];
  $("#stickers").innerHTML = `
    <div class="sticker"><b>${severe.toLocaleString()}</b><span>real chatbot prompts flagged with a password, API key, token or ID number (out of ${corpusN.toLocaleString()} scanned; ~${pct(sev[0], sev[1])} of such flags are right)</span></div>
    <div class="sticker"><b>${pct(presSecrets[0], presSecrets[1])}</b><span>of API keys, tokens and passwords caught by Microsoft Presidio on the held-out set. parda: ${pct(R.heldout.micro.tp, R.heldout.micro.tp + R.heldout.micro.fn)} of everything.</span></div>
    <div class="sticker"><b>0 bytes</b><span>leave your browser. The scanner is one small file, and you can read it.</span></div>`;
  $("#headline").innerHTML = `
    <div class="card stat"><b>${pct(R.heldout.micro.tp, R.heldout.micro.tp + R.heldout.micro.fn)}</b><span>recall on the held-out synthetic set (${R.heldout.n_gold_spans} items), ${R.heldout.negative_messages_flagged}/${R.heldout.negative_messages} decoy-only messages flagged</span></div>
    <div class="card stat"><b>${pct(sev[0], sev[1])}</b><span>of "never paste" flags were right in the hand check on fresh real prompts (${sev[0]}/${sev[1]}). ${pct(v2.total[0], v2.total[1])} across all kinds.</span></div>
    <div class="card stat"><b>${Math.round(1000 / R.corpus[0].ms_per_message).toLocaleString()}/s</b><span>messages scanned per second in Node on a laptop</span></div>`;
  // gold table
  const kinds = Object.keys(R.heldout.per_kind);
  $("#goldtable").innerHTML = `<table><tr><th>Kind</th><th class="n">Dev recall</th><th class="n">Held-out recall</th></tr>${kinds.map(k => {
    const d = R.gold.per_kind[k], h = R.heldout.per_kind[k];
    return `<tr><td>${esc(KIND_INFO[k]?.label || k)}</td><td class="n">${d ? `${d.tp}/${d.tp + d.fn}` : "–"}</td><td class="n">${h.tp}/${h.tp + h.fn}</td></tr>`;
  }).join("")}<tr><th>False alarms</th><th class="n">${R.gold.micro.fp}</th><th class="n">${R.heldout.micro.fp}</th></tr></table>`;
  // presidio bars
  const groups = [["India IDs", ["AADHAAR", "PAN", "GSTIN", "UPI_ID", "IFSC", "PASSPORT", "VOTER_ID", "BANK_ACCOUNT"]], ["Cards, email, phone, IP", ["CARD", "EMAIL", "IN_PHONE", "IP_ADDRESS", "DOB"]], ["API keys & tokens", ["OPENAI_KEY", "ANTHROPIC_KEY", "GITHUB_TOKEN", "AWS_ACCESS_KEY", "AWS_SECRET", "GOOGLE_KEY", "JWT", "HF_TOKEN", "SLACK_TOKEN"]], ["Passwords", ["PASSWORD", "DB_URL"]]];
  $("#presbars").innerHTML = groups.map(([name, ks]) => {
    const p = ks.reduce((a, k) => [a[0] + (pH.recall_per_kind[k]?.[0] || 0), a[1] + (pH.recall_per_kind[k]?.[1] || 0)], [0, 0]);
    const q = ks.reduce((a, k) => { const v = R.heldout.per_kind[k]; return v ? [a[0] + v.tp, a[1] + v.tp + v.fn] : a; }, [0, 0]);
    return `<div class="bar"><span>${name}</span><div class="track"><i style="width:${100 * q[0] / q[1]}%;background:var(--pink)"></i></div><b>${pct(q[0], q[1])}</b></div>
      <div class="bar"><span></span><div class="track"><i style="width:${100 * p[0] / p[1]}%;background:#9d97a6"></i></div><b>${pct(p[0], p[1])}</b></div>`;
  }).join("") + `<p class="note">Presidio also flagged ${pH.negative_messages_flagged[0]}/${pH.negative_messages_flagged[1]} decoy-only messages (parda: ${R.heldout.negative_messages_flagged}/${R.heldout.negative_messages}).</p>`;
  // corpus
  const allKinds = {};
  R.corpus.forEach(c => Object.entries(c.messages_per_kind).forEach(([k, v]) => allKinds[k] = (allKinds[k] || 0) + v));
  const top = Object.entries(allKinds).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $("#corpus").innerHTML = `<table><tr><th>Messages containing…</th>${R.corpus.map(c => `<th class="n">${c.corpus}</th>`).join("")}</tr>${top.map(([k]) => `<tr><td>${esc(KIND_INFO[k]?.label || k)}</td>${R.corpus.map(c => `<td class="n">${c.messages_per_kind[k] || 0}</td>`).join("")}</tr>`).join("")}
    <tr><th>Any "never paste" item</th>${R.corpus.map(c => `<th class="n">${c.messages_with_severe}</th>`).join("")}</tr><tr><td>Messages scanned</td>${R.corpus.map(c => `<td class="n">${c.messages.toLocaleString()}</td>`).join("")}</tr></table>
    <p class="note">These are flags, not confirmed leaks; see the hand-checked precision. Flagged values are never published, only counts.</p>`;
  // precision
  const v1 = R.precision_v01;
  const rows = Object.keys({ ...v1.per_kind, ...v2.per_kind }).filter(k => (v1.per_kind[k]?.[1] || 0) + (v2.per_kind[k]?.[1] || 0) >= 4);
  $("#precision").innerHTML = `<table><tr><th>Kind</th><th class="n">v0.1</th><th class="n">v0.2 (final)</th></tr>${rows.map(k => {
    const a = v1.per_kind[k], b = v2.per_kind[k];
    return `<tr><td>${esc(KIND_INFO[k]?.label || k)}</td><td class="n">${a ? `${a[0]}/${a[1]}` : "–"}</td><td class="n">${b ? `<b>${b[0]}/${b[1]}</b>` : "–"}</td></tr>`;
  }).join("")}<tr><th>All sampled flags</th><th class="n">${v1.total[0]}/${v1.total[1]}</th><th class="n">${v2.total[0]}/${v2.total[1]}</th></tr></table>
  <p class="note">v0.2 failure modes: ${v2.failure_modes.map(esc).join("; ")}.</p>`;
  // roundtrip
  if (R.roundtrip && R.roundtrip.length) {
    $("#roundtrip").innerHTML = `<table><tr><th>Model</th><th>Style</th><th class="n">Values restored</th><th class="n">Answers fully restored</th><th class="n">Mentions a placeholder</th></tr>${R.roundtrip.map(r => `<tr><td>${esc(r.model)}</td><td>${r.style === "tag" ? "tags [PAN_1]" : "fake look-alikes"}</td><td class="n">${pct(r.restored, r.values)}</td><td class="n">${pct(r.all_restored, r.n)}</td><td class="n">${pct(r.complains, r.n)}</td></tr>`).join("")}</table>`;
  } else $("#roundtrip").innerHTML = '<p class="note">Running…</p>';
}).catch(() => { $("#headline").innerHTML = '<p class="note">Results file not found.</p>'; });
