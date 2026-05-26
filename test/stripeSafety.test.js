import test from "node:test";
import assert from "node:assert/strict";
import { assertStripeTestKey } from "../src/stripeSafety.js";

test("Stripe safety accepts test keys", () => {
  assert.doesNotThrow(() => assertStripeTestKey("sk_test_example"));
  assert.doesNotThrow(() => assertStripeTestKey("rk_test_example"));
});

test("Stripe safety refuses live keys", () => {
  assert.throws(() => assertStripeTestKey("sk_live_example"), /Live Stripe key refused/);
  assert.throws(() => assertStripeTestKey("rk_live_example"), /Live Stripe key refused/);
});
