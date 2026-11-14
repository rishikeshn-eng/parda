# parda: check before you paste into a chatbot

**parda** ("veil" in Hindi) finds secrets and personal identifiers in text before you paste it into ChatGPT, Gemini or Claude. It swaps each one for a placeholder, and puts the real values back into the chatbot's answer. It also includes **Leak Hunt**, a game that trains you to spot them, decoys included.

**Live: https://rishikeshn-eng.github.io/parda/** · the scanner and the game run entirely in your browser, and nothing is uploaded.

## The problem

Pasting a draft into a chatbot is now the most common way sensitive data leaves a person or a company:

- Samsung engineers pasted proprietary source code and meeting notes into ChatGPT in 2023, and Samsung then banned the tool ([Bloomberg](https://www.bloomberg.com/news/articles/2023-05-02/samsung-bans-chatgpt-and-other-generative-ai-use-by-staff-after-leak)).
- In LayerX's 2025 enterprise telemetry, 77% of employees who use generative AI paste data into it, and 22% of them have pasted PII or payment data ([LayerX report](https://go.layerxsecurity.com/hubfs/LayerX_Enterprise_AI_and_SaaS_Data_Security_Report.pdf)).
- In India, the data people paste includes Aadhaar, PAN, UPI handles and bank details: the identifiers behind SIM-swap and loan fraud.

Enterprise data-loss-prevention tools exist, but nothing simple, free and local does this for an individual: check the draft, show what's risky, redact it, and restore the values in the answer.

## What's here

| | |
|---|---|
| `parda/parda.js` | The scanner (one dependency-free ES module): 30 detectors, `scan()`, `redact()` (tags or format-preserving fakes), `restore()` |
| `docs/` | The site: Leak Hunt (4 levels, decoys, combos, badges), the scanner/redactor, and the results |
| `bench/` | Gold-set generator, evaluation, real-corpus scan, Presidio baseline, round-trip experiment |
| `tests/` | `node --test tests/` |

**Detectors.**
- **India:** Aadhaar (Verhoeff checksum), Aadhaar VID, PAN, GSTIN (check character), UPI handles (40+ PSP suffixes), IFSC, bank account numbers, passport, voter ID, driving licence, Indian mobile numbers.
- **Global:** cards (Luhn and issuer prefix), IBAN (mod-97), email, phone, public IP, date of birth.
- **Secrets:** OpenAI, Anthropic, Google/Gemini, AWS access and secret keys, GitHub, Slack, Stripe, Hugging Face, Telegram bot tokens, JWTs, private keys, database URLs with passwords, bearer tokens, `password: …`, and generic `api_key = …` with an entropy check.

Context decides as much as format. The 12 digits after "order" or "PNR" are not an Aadhaar, nor is the value of a JSON field called `marketCap`. Code like `password = getText()` isn't a password, and `postgres://user:password@host` is a template.

## Results

### 1. Synthetic gold sets (coverage)

1,200 chat drafts (English, Hinglish, `.env` files, curl commands, KYC forms) carry 1,631 planted values, with hard negatives: invalid checksums, order IDs, git hashes, AWS's documentation key. These were used during development. A further 600 drafts, built from new templates and a new seed, were run once as a held-out set.

| Set | Items | Recall | Precision | Decoy-only messages flagged |
|---|---|---|---|---|
| Development | 1,631 | 100% | 100% | 0 / 300 |
| Held out | 700 | 100% | 100% | 0 / 200 |

These sets confirm every format is covered. They are easy by construction, so the real-text numbers below matter more.

### 2. vs Microsoft Presidio (the standard open-source PII detector)

Presidio got every predefined recognizer, including its India ones (Aadhaar, PAN, passport, voter ID). Any Presidio entity overlapping a gold value counted as a catch. Held-out set:

| | parda | Presidio |
|---|---|---|
| India IDs | 100% | 79.6% |
| Cards, email, phone, IP, DOB | 100% | 94.5% |
| API keys and tokens | 100% | **10.6%** (0/20 OpenAI, 0/20 Anthropic, 0/20 GitHub, 1/20 AWS) |
| Passwords | 100% | 31.7% |
| Decoy-only messages flagged | 0 / 200 | 45 / 200 |

### 3. Real chatbot prompts

parda scanned every user turn in two shards of **WildChat-1M** (331,924 turns; its authors had already scrubbed PII with Presidio) and in **ShareGPT** (333,489 turns, not scrubbed). It flags 201 and 126 messages respectively with a "never paste" item: a password, key, token, card or ID number. The most common finds are live-format OpenAI keys, Telegram bot tokens, Facebook access tokens, database passwords and résumés with dates of birth. The Presidio scrub left them in. Only counts are published, never values.

**Hand-checked precision.** A flag isn't a leak, so random samples of flags were read one by one:

1. v0.1 was tuned on a WildChat sample, then checked on a fresh ShareGPT sample: **158/219 (72%)**. Passwords were the worst at 2/20, because `password-validators` and `PASSWORD_RESET` were read as passwords.
2. Those failure modes were fixed, then v0.2 was checked on a second fresh sample from both corpora, excluding every message seen before: **104/143 overall**.

| v0.2 on fresh real flags | Correct |
|---|---|
| Never-paste kinds (API secrets, passwords, Telegram tokens) | **52/59 (88%)** |
| Email, Indian mobile | 25/48 (52%) |
| IP address, international phone | 27/36 (75%) |

Indian mobile numbers are the weakest at 9/24. Ten-digit codes that start with 6 to 9 are everywhere: tariff codes, SAP IDs, transaction references.

### 4. Do chatbots keep the placeholders?

Redact → ask → restore only works if the model repeats the placeholder. 160 tasks whose answers must repeat the sensitive values (a table, a WhatsApp message, a JSON object, an `.env` file) were redacted two ways and answered by three local models and Gemini:

<!-- ROUNDTRIP -->

## Reproduce

```bash
npm test                                   # unit tests
node bench/make_gold.mjs > data/gold.jsonl && node bench/eval.mjs data/gold.jsonl
HELDOUT=1 SEED=777 node bench/make_gold.mjs > data/heldout.jsonl && node bench/eval.mjs data/heldout.jsonl
# real corpora (downloads ~1 GB): WildChat-1M shards 0-1 and ShareGPT_V3_unfiltered_cleaned_split.json into data/raw/
python bench/export_corpus.py && node bench/scan_corpus.mjs data/corpus_wildchat.jsonl wildchat
python bench/presidio_baseline.py data/gold.jsonl data/heldout.jsonl   # needs presidio-analyzer + en_core_web_lg
node bench/roundtrip.mjs make > data/roundtrip_prompts.jsonl            # then bench/run_llm.py (MLX) / bench/run_gemini.py
node bench/roundtrip.mjs score data/roundtrip_prompts.jsonl data/roundtrip_out/*.jsonl
node bench/site_data.mjs
```

## Limitations

- **Formats, not meaning.** Names, addresses and free-text secrets ("the merger closes Friday") need a language model, and parda doesn't try. Add them as private words in the scanner instead.
- **It can't tell a real key from a well-formed fake.** A format match is reported either way.
- **The real-text precision comes from small hand samples** (143 flags for v0.2), labelled by one person.
- **Indian mobile numbers and emails in code** (Kotlin's `this@Label`, `git@host`) are the main sources of noise.
- **Synthetic gold sets were written by the same person who wrote the detectors.** They show coverage, not real-world accuracy.
- Hugging Face uploads were skipped: no token.

MIT licensed. Built by [Rishikesh](https://rishikeshn-eng.github.io/).
