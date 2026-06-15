import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("Stripe webhook route verifies signature before JSON body middleware", () => {
  const webhookIndex = serverSource.indexOf('app.post("/api/webhooks/stripe"');
  const jsonIndex = serverSource.indexOf("app.use(express.json");
  assert.ok(webhookIndex > -1, "webhook route should exist");
  assert.ok(jsonIndex > -1, "JSON middleware should exist");
  assert.ok(webhookIndex < jsonIndex, "Stripe webhook raw body route must run before express.json");
  assert.match(serverSource, /stripe\(\)\.webhooks\.constructEvent\(req\.body,\s*signature,\s*requiredEnv\("STRIPE_WEBHOOK_SECRET"\)\)/);
});

test("Stripe webhook idempotency is keyed by Stripe event id", () => {
  assert.match(serverSource, /prisma\.webhookEvent\.upsert\(\{\s*where:\s*\{\s*stripeEventId:\s*event\.id\s*\}/s);
  assert.match(serverSource, /if\s*\(webhookRecord\.processed\)\s*\{\s*return res\.json\(\{\s*received:\s*true,\s*duplicate:\s*true\s*\}\);/s);
});

test("Checkout fulfillment refuses unpaid sessions and reuses existing orders", () => {
  assert.match(serverSource, /if\s*\(session\.payment_status\s*&&\s*session\.payment_status\s*!==\s*"paid"\)\s*throw new Error\("Session is not paid"\);/);
  assert.match(serverSource, /const existing = await findOrderBySession\(session\.id\);/);
  assert.match(serverSource, /if\s*\(existing\?\.license\)\s*return existing;/);
  assert.match(serverSource, /where:\s*\{\s*stripeSessionId:\s*session\.id\s*\}/);
});
