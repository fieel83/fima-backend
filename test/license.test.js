import test from "node:test";
import assert from "node:assert/strict";
import { generateCandidateLicenseKey, normalizeHwid, normalizeLicenseKey } from "../src/license.js";
import {
  checkoutModeForPlan,
  getDirectGiftCommerce,
  getGiftCodeCommerce,
  getPlan,
  getPlanCommerce,
  getPlanExpiry,
  isPublicCheckoutPlan,
  productionInlinePriceDataBlocked,
  publicCheckoutPlanIds,
  requiredDirectGiftPriceEnvs,
  requiredGiftCodePriceEnvs,
  requiredPublicPriceEnvs
} from "../src/plans.js";

test("license keys use the public FIMA format", () => {
  assert.match(generateCandidateLicenseKey(), /^FIMA-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("license key normalization accepts pasted keys", () => {
  const expected = ["FIMA", "ABCD", "EFGH", "IJKL", "MNOP"].join("-");
  assert.equal(normalizeLicenseKey(" fima abcd efgh ijkl mnop "), expected);
});

test("hwid normalization removes unsafe characters", () => {
  assert.equal(normalizeHwid(" abc-123 !! "), "ABC-123");
});

test("plan expiry maps to requested duration", () => {
  const base = new Date("2026-05-26T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("1day"), base).toISOString(), "2026-05-27T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("3days"), base).toISOString(), "2026-05-29T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("monthly"), base).toISOString(), "2026-06-25T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("2weeks"), base).toISOString(), "2026-06-10T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("1month"), base).toISOString(), "2026-06-25T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("3months"), base).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(getPlanExpiry(getPlan("lifetime"), base), null);
});

test("public beta pricing keeps new access products stable", () => {
  const now = new Date("2026-06-11T10:00:00.000Z");

  assert.equal(getPlanCommerce(getPlan("1day"), now).priceCents, 0);
  assert.equal(getPlanCommerce(getPlan("1day"), now).priceEnv, null);
  assert.equal(getPlanCommerce(getPlan("3days"), now).priceCents, 99);
  assert.equal(getPlanCommerce(getPlan("monthly"), now).priceCents, 499);
  assert.equal(getPlanCommerce(getPlan("monthly"), now).currency, "eur");
  assert.equal(getPlan("monthly").subscription, true);
  assert.equal(getPlanCommerce(getPlan("lifetime"), now).priceCents, 2999);
  assert.equal(getPlan("lifetime").compareAtCents, 3999);
});

test("free trial does not require a Stripe price env", () => {
  const trial = getPlan("1day");

  assert.equal(trial.trial, true);
  assert.equal(trial.publicCheckout, false);
  assert.equal(trial.priceEnv, undefined);
  assert.equal(getPlanCommerce(trial).priceEnv, null);
});

test("public checkout and required price envs are the current paid products only", () => {
  assert.deepEqual(publicCheckoutPlanIds(), ["3days", "monthly", "lifetime"]);
  assert.deepEqual(requiredPublicPriceEnvs(), ["STRIPE_PRICE_3DAYS", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_LIFETIME"]);
});

test("gift code checkout uses dedicated products and price envs", () => {
  assert.deepEqual(requiredGiftCodePriceEnvs(), [
    "STRIPE_GIFT_PRICE_3DAYS",
    "STRIPE_GIFT_PRICE_MONTHLY",
    "STRIPE_GIFT_PRICE_LIFETIME"
  ]);
  assert.deepEqual(requiredGiftCodePriceEnvs({ test: true }), [
    "STRIPE_TEST_GIFT_PRICE_3DAYS",
    "STRIPE_TEST_GIFT_PRICE_MONTHLY",
    "STRIPE_TEST_GIFT_PRICE_LIFETIME"
  ]);

  const threeDays = getGiftCodeCommerce(getPlan("3days"));
  const monthly = getGiftCodeCommerce(getPlan("monthly"));
  const lifetime = getGiftCodeCommerce(getPlan("lifetime"));
  assert.equal(threeDays.productName, "FIMA Gift Code — 3 Days");
  assert.equal(monthly.productName, "FIMA Gift Code — Monthly");
  assert.equal(lifetime.productName, "FIMA Gift Code — Lifetime");
  assert.equal(monthly.checkoutType, "gift_code_purchase");
  assert.equal(monthly.priceType, "one_time");
  assert.equal(monthly.interval, null);
  assert.equal(monthly.priceEnv, "STRIPE_GIFT_PRICE_MONTHLY");
  assert.equal(getGiftCodeCommerce(getPlan("monthly"), { test: true }).priceEnv, "STRIPE_TEST_GIFT_PRICE_MONTHLY");
});

test("direct-recipient gifts use dedicated one-time products and price envs", () => {
  assert.deepEqual(requiredDirectGiftPriceEnvs(), [
    "STRIPE_DIRECT_GIFT_PRICE_3DAYS",
    "STRIPE_DIRECT_GIFT_PRICE_MONTHLY",
    "STRIPE_DIRECT_GIFT_PRICE_LIFETIME"
  ]);
  assert.deepEqual(requiredDirectGiftPriceEnvs({ test: true }), [
    "STRIPE_TEST_DIRECT_GIFT_PRICE_3DAYS",
    "STRIPE_TEST_DIRECT_GIFT_PRICE_MONTHLY",
    "STRIPE_TEST_DIRECT_GIFT_PRICE_LIFETIME"
  ]);

  const threeDays = getDirectGiftCommerce(getPlan("3days"));
  const monthly = getDirectGiftCommerce(getPlan("monthly"));
  const lifetime = getDirectGiftCommerce(getPlan("lifetime"));
  assert.equal(threeDays.productName, "FIMA Direct Gift — 3 Days");
  assert.equal(monthly.productName, "FIMA Direct Gift — Monthly");
  assert.equal(lifetime.productName, "FIMA Direct Gift — Lifetime");
  assert.equal(monthly.checkoutType, "direct_gift_purchase");
  assert.equal(monthly.priceType, "one_time");
  assert.equal(monthly.interval, null);
  assert.equal(monthly.priceEnv, "STRIPE_DIRECT_GIFT_PRICE_MONTHLY");
  assert.equal(getDirectGiftCommerce(getPlan("monthly"), { test: true }).priceEnv, "STRIPE_TEST_DIRECT_GIFT_PRICE_MONTHLY");
});

test("legacy packages are readable but cannot be public checkout plans", () => {
  for (const planId of ["1day", "2weeks", "1month", "3months"]) {
    assert.equal(isPublicCheckoutPlan(planId), false);
  }

  assert.equal(getPlan("2weeks").legacy, true);
  assert.equal(getPlan("1month").legacy, true);
  assert.equal(getPlan("3months").legacy, true);
});

test("checkout modes match the current paid products", () => {
  assert.equal(checkoutModeForPlan(getPlan("3days")), "payment");
  assert.equal(checkoutModeForPlan(getPlan("lifetime")), "payment");
  assert.equal(checkoutModeForPlan(getPlan("monthly")), "subscription");
});

test("production and live mode block inline price data fallback", () => {
  assert.equal(productionInlinePriceDataBlocked("production", "auto"), true);
  assert.equal(productionInlinePriceDataBlocked("development", "live"), true);
  assert.equal(productionInlinePriceDataBlocked("development", "test"), false);
});
