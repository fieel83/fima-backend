import test from "node:test";
import assert from "node:assert/strict";
import { setupEnvScope, stripeSetupTargets } from "../scripts/setup-stripe-products.js";

function fakeStripeKey(mode) {
  return ["sk", mode, "example"].join("_");
}

test("standalone Stripe setup targets only current paid checkout products", () => {
  const targets = stripeSetupTargets({ envScope: "live" });

  assert.deepEqual(targets.map((target) => target.planId), ["3days", "monthly", "lifetime"]);
  assert.deepEqual(targets.map((target) => target.productName), ["3 Days Access", "Monthly Subscription", "Lifetime"]);
  assert.equal(targets.some((target) => target.planId === "1day"), false);
  assert.equal(targets.some((target) => ["2weeks", "1month", "3months"].includes(target.planId)), false);
});

test("standalone Stripe setup product amounts and price types are correct", () => {
  const byPlan = Object.fromEntries(stripeSetupTargets({ envScope: "live" }).map((target) => [target.planId, target]));

  assert.equal(byPlan["3days"].amount, 99);
  assert.equal(byPlan["3days"].currency, "eur");
  assert.equal(byPlan["3days"].priceType, "one_time");
  assert.equal(byPlan["3days"].interval, null);

  assert.equal(byPlan.monthly.amount, 499);
  assert.equal(byPlan.monthly.currency, "eur");
  assert.equal(byPlan.monthly.priceType, "recurring");
  assert.equal(byPlan.monthly.interval, "month");

  assert.equal(byPlan.lifetime.amount, 2999);
  assert.equal(byPlan.lifetime.currency, "eur");
  assert.equal(byPlan.lifetime.priceType, "one_time");
  assert.equal(byPlan.lifetime.interval, null);
});

test("standalone Stripe setup keeps live and test env names separate", () => {
  assert.deepEqual(stripeSetupTargets({ envScope: "live" }).map((target) => target.envName), [
    "STRIPE_PRICE_3DAYS",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_LIFETIME"
  ]);
  assert.deepEqual(stripeSetupTargets({ envScope: "test" }).map((target) => target.envName), [
    "STRIPE_TEST_PRICE_3DAYS",
    "STRIPE_TEST_PRICE_MONTHLY",
    "STRIPE_TEST_PRICE_LIFETIME"
  ]);
});

test("standalone Stripe setup infers env scope from key mode", () => {
  assert.equal(setupEnvScope("", fakeStripeKey("test")), "test");
  assert.equal(setupEnvScope("", fakeStripeKey("live")), "live");
  assert.equal(setupEnvScope("test", fakeStripeKey("live")), "test");
  assert.equal(setupEnvScope("live", fakeStripeKey("test")), "live");
});
