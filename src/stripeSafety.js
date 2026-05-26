export function assertStripeTestKey(key) {
  if (!key) return;
  if (key.includes("_live_") || key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error("Live Stripe key refused. Use test mode only until live mode is explicitly approved.");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test secret key, such as sk_test_...");
  }
}
