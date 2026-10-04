import test from "node:test";
import assert from "node:assert/strict";
import {
  PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION,
  PARADISE_APPLICATION_DRAFT_TTL_MS,
  buildParadiseApplicationDraftRecord,
  normalizeParadiseApplicationDraftAnswers,
  normalizeParadiseApplicationDraftRecord,
  normalizeParadiseApplicationDraftScope,
  paradiseApplicationDraftSettingKey
} from "../src/paradiseApplicationDraft.js";

const scope = {
  userId: "site-user-42",
  guildId: "1520519015661961257",
  workflow: "staff",
  type: "helper"
};
const questions = [
  { key: "motivation", max: 500 },
  { key: "experience", max: 700 }
];

function build(overrides = {}) {
  return buildParadiseApplicationDraftRecord({
    scope,
    questions,
    answers: { motivation: "Topluluğa güvenli biçimde yardım etmek istiyorum." },
    expectedRevision: 0,
    now: new Date("2026-07-21T12:00:00.000Z"),
    ...overrides
  });
}

test("application draft Setting keys are stable, scoped, and reveal no account or guild identifier", () => {
  const key = paradiseApplicationDraftSettingKey(scope);
  assert.match(key, /^paradise_application_draft_v1_[a-f0-9]{64}$/);
  assert.equal(key, paradiseApplicationDraftSettingKey({ ...scope }));
  assert.notEqual(key, paradiseApplicationDraftSettingKey({ ...scope, userId: "site-user-43" }));
  assert.notEqual(key, paradiseApplicationDraftSettingKey({ ...scope, guildId: "1419335632324657306" }));
  assert.notEqual(key, paradiseApplicationDraftSettingKey({ ...scope, workflow: "business", type: "partnership" }));
  assert.doesNotMatch(key, /site-user-42|1520519015661961257/);
});

test("application draft scope supports bounded staff and business types", () => {
  assert.deepEqual(normalizeParadiseApplicationDraftScope(scope), scope);
  assert.deepEqual(normalizeParadiseApplicationDraftScope({ ...scope, workflow: "business", type: "partnership" }), {
    ...scope, workflow: "business", type: "partnership"
  });
  assert.deepEqual(normalizeParadiseApplicationDraftScope({ ...scope, type: "moderator" }), {
    ...scope, type: "moderator"
  });
  for (const invalid of [
    { ...scope, userId: "" },
    { ...scope, guildId: "not-a-guild" },
    { ...scope, workflow: "unknown" },
    { ...scope, type: "" },
    { ...scope, type: "not-valid!" },
    { ...scope, type: `a${"b".repeat(48)}` }
  ]) {
    assert.throws(() => normalizeParadiseApplicationDraftScope(invalid), { code: "invalid_application_draft_scope" });
  }
});

test("application draft answers reject unknown keys, non-strings, per-question overflow, and total overflow", () => {
  assert.deepEqual(
    normalizeParadiseApplicationDraftAnswers({ motivation: "yardım" }, questions),
    { motivation: "yardım" }
  );
  assert.throws(
    () => normalizeParadiseApplicationDraftAnswers({ unknown: "value" }, questions),
    { code: "invalid_application_draft_answer", question: "unknown" }
  );
  assert.throws(
    () => normalizeParadiseApplicationDraftAnswers({ motivation: 42 }, questions),
    { code: "invalid_application_draft_answer", question: "motivation" }
  );
  assert.throws(
    () => normalizeParadiseApplicationDraftAnswers({ motivation: "x".repeat(501) }, questions),
    { code: "invalid_application_draft_answer", question: "motivation" }
  );

  const manyQuestions = Array.from({ length: 9 }, (_, index) => ({ key: `q${index}`, max: 4_000 }));
  const manyAnswers = Object.fromEntries(manyQuestions.map(question => [question.key, "x".repeat(4_000)]));
  assert.throws(
    () => normalizeParadiseApplicationDraftAnswers(manyAnswers, manyQuestions),
    { code: "application_draft_too_large", statusCode: 413 }
  );
});

test("application draft records persist answers only and expire after thirty days", () => {
  const record = build({
    evidence: [{ name: "must-never-persist.png", data: "secret" }],
    files: [{ name: "also-never-persist.png" }]
  });
  assert.equal(record.schemaVersion, PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION);
  assert.deepEqual(record.answers, { motivation: "Topluluğa güvenli biçimde yardım etmek istiyorum." });
  assert.equal("evidence" in record, false);
  assert.equal("files" in record, false);
  assert.equal("userId" in record, false);
  assert.equal(
    Date.parse(record.expiresAt) - Date.parse(record.updatedAt),
    PARADISE_APPLICATION_DRAFT_TTL_MS
  );
  assert.deepEqual(normalizeParadiseApplicationDraftRecord(record, {
    scope,
    questions,
    now: new Date("2026-08-20T11:59:59.999Z")
  }), record);
  assert.equal(normalizeParadiseApplicationDraftRecord(record, {
    scope,
    questions,
    now: new Date(record.expiresAt)
  }), null);
});

test("application draft revisions detect conflicts and return the current safe draft", () => {
  const current = build();
  assert.throws(
    () => buildParadiseApplicationDraftRecord({
      scope,
      questions,
      answers: { motivation: "daha yeni cevap" },
      current,
      expectedRevision: 0,
      now: new Date("2026-07-21T12:01:00.000Z")
    }),
    error => error?.code === "application_draft_conflict"
      && error?.statusCode === 409
      && error?.currentDraft?.revision === 1
  );
  const next = buildParadiseApplicationDraftRecord({
    scope,
    questions,
    answers: { motivation: "daha yeni cevap" },
    current,
    expectedRevision: 1,
    now: new Date("2026-07-21T12:01:00.000Z")
  });
  assert.equal(next.revision, 2);
  assert.equal(next.answers.motivation, "daha yeni cevap");
});

test("corrupt, mismatched, and expired application draft records are ignored", () => {
  const record = build();
  const options = { scope, questions, now: new Date("2026-07-21T12:01:00.000Z") };
  for (const invalid of [
    null,
    [],
    { ...record, schemaVersion: 999 },
    { ...record, guildId: "1419335632324657306" },
    { ...record, revision: 0 },
    { ...record, updatedAt: "invalid" },
    { ...record, answers: { unknown: "value" } }
  ]) {
    assert.equal(normalizeParadiseApplicationDraftRecord(invalid, options), null);
  }
});
