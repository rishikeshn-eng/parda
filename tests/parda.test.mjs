import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, redact, restore, verhoeffValid, verhoeffCheckDigit, luhnValid, gstinCheckChar } from "../parda/parda.js";

const kinds = t => scan(t).map(f => f.kind);

test("checksums", () => {
  assert.equal(verhoeffCheckDigit("236"), 3);
  assert.ok(verhoeffValid("2363"));
  assert.ok(luhnValid("4111111111111111"));
  assert.ok(!luhnValid("4111111111111112"));
  assert.equal(gstinCheckChar("27AAPFU0939F1Z"), "V");
});

test("finds India identifiers only when the checksum holds", () => {
  assert.deepEqual(kinds("Aadhaar: 4991 1866 5246"), ["AADHAAR"]);
  assert.deepEqual(kinds("Aadhaar: 4991 1866 5247"), []);
  assert.deepEqual(kinds("PAN ABCPE1234F"), ["PAN"]);
  assert.deepEqual(kinds("pay rahul.s@okaxis"), ["UPI_ID"]);
});

test("finds secrets", () => {
  assert.deepEqual(kinds('api_key="sk-proj-Q2xKp7nRvB4mT9eLzA6sW1yHdF3gJ8cU5oX0iN"'), ["OPENAI_KEY"]);
  assert.deepEqual(kinds("AWS_ACCESS_KEY_ID=AKIAQWERTY2345ZXCVBN"), ["AWS_ACCESS_KEY"]);
  assert.deepEqual(kinds("postgres://admin:Adm1n!2024@db.acme.in:5432/prod"), ["DB_URL"]);
  assert.deepEqual(kinds("bot = Updater('5512345678:AAFakeTokenForTestsOnly_qwrtzpLmNo7')"), ["TELEGRAM_TOKEN"]);
});

test("real-world false alarms stay quiet", () => {
  for (const t of ["String password = editTextPassword.getText().toString();", "AUTH_PASSWORD_VALIDATORS = [", "Chrome/110.0.0.0 Safari",
    "7.5.2.1. Streifenwimpern", "postgres://user:password@host:port/database", "My order 663938670727 hasn't arrived",
    "AKIAIOSFODNN7EXAMPLE", "'marketCap': 602476314624", "Shelley was born on 4 August 1792", "OO00OO0OOOO00OOO0 = \"\""])
    assert.deepEqual(kinds(t), [], t);
});

test("redact and restore round-trip, same value same placeholder", () => {
  const t = "Mail meera@gmail.com or meera@gmail.com, Aadhaar 4991 1866 5246";
  const r = redact(t);
  assert.equal(r.text, "Mail [EMAIL_1] or [EMAIL_1], Aadhaar [AADHAAR_1]");
  assert.equal(restore("Sure: [EMAIL_1] and AADHAAR_1", r.map), "Sure: meera@gmail.com and 4991 1866 5246");
  const s = redact(t, { style: "surrogate" });
  assert.ok(!s.text.includes("meera@gmail.com"));
  assert.equal(restore(s.text, s.map), t);
});
