import test from "node:test";
import assert from "node:assert/strict";
import { assertStripeSecretKeyAllowed, stripeKeyMode, stripeSessionPrefix } from "../src/stripeSafety.js";

test("Stripe safety accepts test keys", () => {
  assert.doesNotThrow(() => assertStripeSecretKeyAllowed("sk_test_example"));
  assert.doesNotThrow(() => assertStripeSecretKeyAllowed("rk_test_example"));
});

test("Stripe safety allows live keys when live mode is explicit or automatic", () => {
  assert.doesNotThrow(() => assertStripeSecretKeyAllowed("sk_live_example", "live"));
  assert.doesNotThrow(() => assertStripeSecretKeyAllowed("rk_live_example", "auto"));
});

test("Stripe safety refuses key and configured mode mismatch", () => {
  assert.throws(() => assertStripeSecretKeyAllowed("sk_live_example", "test"), /STRIPE_MODE=test/);
  assert.throws(() => assertStripeSecretKeyAllowed("sk_test_example", "live"), /STRIPE_MODE=live/);
});

test("Stripe mode helpers expose only mode and prefix data", () => {
  assert.equal(stripeKeyMode("pk_live_example"), "live");
  assert.equal(stripeKeyMode("pk_test_example"), "test");
  assert.equal(stripeSessionPrefix("cs_live_example"), "cs_live");
  assert.equal(stripeSessionPrefix("cs_test_example"), "cs_test");
});
