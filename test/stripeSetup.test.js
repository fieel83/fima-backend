import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setupEnvScope, stripeSetupTargets } from "../scripts/setup-stripe-products.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

function fakeStripeKey(mode) {
  return ["sk", mode, "example"].join("_");
}

test("standalone Stripe setup targets nine distinct license and gift products", () => {
  const targets = stripeSetupTargets({ envScope: "live" });

  assert.deepEqual(targets.map((target) => target.planId), [
    "3days", "monthly", "lifetime",
    "3days", "monthly", "lifetime",
    "3days", "monthly", "lifetime"
  ]);
  assert.deepEqual(targets.map((target) => target.productName), [
    "3 Days Access",
    "Monthly Subscription",
    "Lifetime",
    "FIMA Gift Code — 3 Days",
    "FIMA Gift Code — Monthly",
    "FIMA Gift Code — Lifetime",
    "FIMA Direct Gift — 3 Days",
    "FIMA Direct Gift — Monthly",
    "FIMA Direct Gift — Lifetime"
  ]);
  assert.deepEqual(targets.map((target) => target.checkoutType), [
    "license_purchase",
    "license_purchase",
    "license_purchase",
    "gift_code_purchase",
    "gift_code_purchase",
    "gift_code_purchase",
    "direct_gift_purchase",
    "direct_gift_purchase",
    "direct_gift_purchase"
  ]);
  assert.equal(targets.some((target) => target.planId === "1day"), false);
  assert.equal(targets.some((target) => ["2weeks", "1month", "3months"].includes(target.planId)), false);
});

test("standalone Stripe setup product amounts and price types are correct", () => {
  const byPlan = Object.fromEntries(stripeSetupTargets({ envScope: "live" }).map((target) => [`${target.checkoutType}:${target.planId}`, target]));

  assert.equal(byPlan["license_purchase:3days"].amount, 99);
  assert.equal(byPlan["license_purchase:3days"].currency, "eur");
  assert.equal(byPlan["license_purchase:3days"].priceType, "one_time");
  assert.equal(byPlan["license_purchase:3days"].interval, null);

  assert.equal(byPlan["license_purchase:monthly"].amount, 499);
  assert.equal(byPlan["license_purchase:monthly"].currency, "eur");
  assert.equal(byPlan["license_purchase:monthly"].priceType, "recurring");
  assert.equal(byPlan["license_purchase:monthly"].interval, "month");

  assert.equal(byPlan["license_purchase:lifetime"].amount, 2999);
  assert.equal(byPlan["license_purchase:lifetime"].currency, "eur");
  assert.equal(byPlan["license_purchase:lifetime"].priceType, "one_time");
  assert.equal(byPlan["license_purchase:lifetime"].interval, null);

  assert.equal(byPlan["gift_code_purchase:monthly"].amount, 499);
  assert.equal(byPlan["gift_code_purchase:monthly"].priceType, "one_time");
  assert.equal(byPlan["gift_code_purchase:monthly"].interval, null);
  assert.equal(byPlan["gift_code_purchase:monthly"].metadata.product_type, "gift_code");
  assert.equal(byPlan["direct_gift_purchase:monthly"].amount, 499);
  assert.equal(byPlan["direct_gift_purchase:monthly"].priceType, "one_time");
  assert.equal(byPlan["direct_gift_purchase:monthly"].interval, null);
  assert.equal(byPlan["direct_gift_purchase:monthly"].metadata.product_type, "direct_gift");
  assert.equal(byPlan["license_purchase:monthly"].metadata.product_type, "license");
});

test("standalone Stripe setup keeps live and test env names separate", () => {
  assert.deepEqual(stripeSetupTargets({ envScope: "live" }).map((target) => target.envName), [
    "STRIPE_PRICE_3DAYS",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_LIFETIME",
    "STRIPE_GIFT_PRICE_3DAYS",
    "STRIPE_GIFT_PRICE_MONTHLY",
    "STRIPE_GIFT_PRICE_LIFETIME",
    "STRIPE_DIRECT_GIFT_PRICE_3DAYS",
    "STRIPE_DIRECT_GIFT_PRICE_MONTHLY",
    "STRIPE_DIRECT_GIFT_PRICE_LIFETIME"
  ]);
  assert.deepEqual(stripeSetupTargets({ envScope: "test" }).map((target) => target.envName), [
    "STRIPE_TEST_PRICE_3DAYS",
    "STRIPE_TEST_PRICE_MONTHLY",
    "STRIPE_TEST_PRICE_LIFETIME",
    "STRIPE_TEST_GIFT_PRICE_3DAYS",
    "STRIPE_TEST_GIFT_PRICE_MONTHLY",
    "STRIPE_TEST_GIFT_PRICE_LIFETIME",
    "STRIPE_TEST_DIRECT_GIFT_PRICE_3DAYS",
    "STRIPE_TEST_DIRECT_GIFT_PRICE_MONTHLY",
    "STRIPE_TEST_DIRECT_GIFT_PRICE_LIFETIME"
  ]);
});

test("gift purchases are fail-closed and cannot bootstrap a normal Stripe product", () => {
  assert.match(serverSource, /allowBootstrap:\s*\(commerce\.checkoutType\s*\|\|\s*["']license_purchase["']\)\s*===\s*["']license_purchase["']/);
  assert.match(serverSource, /stripeRuntimeCollectionForCommerce\(commerce\)/);
  assert.match(serverSource, /giftCodePrices/);
  assert.match(serverSource, /directGiftPrices/);
  assert.match(serverSource, /fima-product-\$\{checkoutType\}-\$\{plan\.id\}/);
  assert.match(serverSource, /commerce\.productName\s*\|\|\s*plan\.name/);
});

test("standalone Stripe setup infers env scope from key mode", () => {
  assert.equal(setupEnvScope("", fakeStripeKey("test")), "test");
  assert.equal(setupEnvScope("", fakeStripeKey("live")), "live");
  assert.equal(setupEnvScope("test", fakeStripeKey("live")), "test");
  assert.equal(setupEnvScope("live", fakeStripeKey("test")), "live");
});
