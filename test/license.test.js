import test from "node:test";
import assert from "node:assert/strict";
import { generateCandidateLicenseKey, normalizeHwid, normalizeLicenseKey } from "../src/license.js";
import { getPlan, getPlanCommerce, getPlanExpiry } from "../src/plans.js";

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
  assert.equal(getPlanExpiry(getPlan("1day"), base).toISOString(), "2026-05-27T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("2weeks"), base).toISOString(), "2026-06-10T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("1month"), base).toISOString(), "2026-06-25T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("3months"), base).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("lifetime"), base), null);
});

test("launch sale switches license plans to sale EUR prices only during campaign", () => {
  const before = new Date("2026-05-30T21:59:59.000Z");
  const during = new Date("2026-05-31T10:00:00.000Z");
  const after = new Date("2026-06-03T22:00:01.000Z");

  assert.equal(getPlanCommerce(getPlan("1day"), before).priceCents, 99);
  assert.equal(getPlanCommerce(getPlan("1day"), during).priceCents, 74);
  assert.equal(getPlanCommerce(getPlan("2weeks"), during).priceCents, 299);
  assert.equal(getPlanCommerce(getPlan("1month"), during).priceCents, 599);
  assert.equal(getPlanCommerce(getPlan("3months"), during).priceCents, 1349);
  assert.equal(getPlanCommerce(getPlan("3months"), during).currency, "eur");
  assert.equal(getPlanCommerce(getPlan("lifetime"), during).priceCents, 3999);
  assert.equal(getPlanCommerce(getPlan("2weeks"), after).priceCents, 399);
});
