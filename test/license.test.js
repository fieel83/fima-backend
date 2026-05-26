import test from "node:test";
import assert from "node:assert/strict";
import { generateCandidateLicenseKey, normalizeHwid, normalizeLicenseKey } from "../src/license.js";
import { getPlan, getPlanExpiry } from "../src/plans.js";

test("license keys use the public FIMA format", () => {
  assert.match(generateCandidateLicenseKey(), /^FIMA-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("license key normalization accepts pasted keys", () => {
  assert.equal(normalizeLicenseKey(" fima abcd efgh ijkl mnop "), "FIMA-ABCD-EFGH-IJKL-MNOP");
});

test("hwid normalization removes unsafe characters", () => {
  assert.equal(normalizeHwid(" abc-123 !! "), "ABC-123");
});

test("plan expiry maps to requested duration", () => {
  const base = new Date("2026-05-26T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("2weeks"), base).toISOString(), "2026-06-09T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("1month"), base).toISOString(), "2026-06-25T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("3months"), base).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("lifetime"), base), null);
});
