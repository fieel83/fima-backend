export function stripeKeyMode(key) {
  const value = String(key || "").trim();
  if (!value) return "missing";
  if (value.startsWith("sk_live_") || value.startsWith("rk_live_") || value.startsWith("pk_live_")) return "live";
  if (value.startsWith("sk_test_") || value.startsWith("rk_test_") || value.startsWith("pk_test_")) return "test";
  return "unknown";
}

export function stripeConfiguredMode(value = process.env.STRIPE_MODE) {
  const mode = String(value || "auto").trim().toLowerCase();
  return ["auto", "test", "live"].includes(mode) ? mode : "auto";
}

export function assertStripeSecretKeyAllowed(key, configuredMode = stripeConfiguredMode()) {
  const mode = stripeKeyMode(key);
  if (mode === "missing") return;
  if (mode === "unknown" || (!String(key).startsWith("sk_") && !String(key).startsWith("rk_"))) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  const expected = stripeConfiguredMode(configuredMode);
  if (expected !== "auto" && mode !== expected) {
    throw new Error(`STRIPE_SECRET_KEY is ${mode}, but STRIPE_MODE=${expected}.`);
  }
}

export function stripeSessionPrefix(sessionId) {
  const value = String(sessionId || "");
  if (value.startsWith("cs_live_")) return "cs_live";
  if (value.startsWith("cs_test_")) return "cs_test";
  if (value.startsWith("cs_")) return "cs";
  return "unknown";
}

export function stripeConfigSummary(priceEnvNames = []) {
  const secretKeyMode = stripeKeyMode(process.env.STRIPE_SECRET_KEY);
  const publishableKeyMode = stripeKeyMode(process.env.STRIPE_PUBLISHABLE_KEY);
  return {
    configuredMode: stripeConfiguredMode(),
    effectiveMode: secretKeyMode === "live" || secretKeyMode === "test" ? secretKeyMode : "unknown",
    secretKeyMode,
    publishableKeyMode,
    priceIds: Object.fromEntries(priceEnvNames.map((name) => [name, process.env[name] ? "set" : "missing"]))
  };
}
