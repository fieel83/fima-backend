export const PLANS = {
  "1day": {
    id: "1day",
    name: "Free 1-Day Trial",
    priceCents: 0,
    compareAtCents: 0,
    currency: "eur",
    durationDays: 1,
    lifetime: false,
    trial: true,
    publicCheckout: false
  },
  "3days": {
    id: "3days",
    name: "3 Days Access",
    priceCents: 99,
    compareAtCents: 99,
    currency: "eur",
    durationDays: 3,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_3DAYS",
    publicCheckout: true
  },
  "monthly": {
    id: "monthly",
    name: "Monthly Subscription",
    priceCents: 499,
    compareAtCents: 499,
    currency: "eur",
    durationDays: 30,
    lifetime: false,
    subscription: true,
    priceEnv: "STRIPE_PRICE_MONTHLY",
    publicCheckout: true
  },
  "2weeks": {
    id: "2weeks",
    name: "Legacy Product - 15 Days",
    priceCents: 399,
    compareAtCents: 399,
    currency: "eur",
    durationDays: 15,
    lifetime: false,
    legacy: true,
    publicCheckout: false
  },
  "1month": {
    id: "1month",
    name: "Legacy Product - 1 Month",
    priceCents: 799,
    compareAtCents: 799,
    currency: "eur",
    durationDays: 30,
    lifetime: false,
    legacy: true,
    publicCheckout: false
  },
  "3months": {
    id: "3months",
    name: "Legacy Product - 3 Months",
    priceCents: 1799,
    compareAtCents: 1799,
    currency: "eur",
    durationDays: 90,
    lifetime: false,
    legacy: true,
    publicCheckout: false
  },
  "lifetime": {
    id: "lifetime",
    name: "Lifetime",
    priceCents: 2999,
    compareAtCents: 3999,
    currency: "eur",
    durationDays: null,
    lifetime: true,
    priceEnv: "STRIPE_PRICE_LIFETIME",
    publicCheckout: true
  }
};

export const FREE_TRIAL_PLAN_ID = "1day";
export const PUBLIC_CHECKOUT_PLAN_IDS = Object.freeze(["3days", "monthly", "lifetime"]);
export const PUBLIC_REQUIRED_PRICE_ENVS = Object.freeze(["STRIPE_PRICE_3DAYS", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_LIFETIME"]);
export const TEST_PRICE_ENVS = Object.freeze(["STRIPE_TEST_PRICE_3DAYS", "STRIPE_TEST_PRICE_MONTHLY", "STRIPE_TEST_PRICE_LIFETIME"]);

export function getPlan(planId) {
  return PLANS[String(planId || "").toLowerCase()] || null;
}

export function planIds() {
  return Object.keys(PLANS);
}

export function publicCheckoutPlanIds() {
  return [...PUBLIC_CHECKOUT_PLAN_IDS];
}

export function requiredPublicPriceEnvs() {
  return [...PUBLIC_REQUIRED_PRICE_ENVS];
}

export function isPublicCheckoutPlan(planId) {
  return PUBLIC_CHECKOUT_PLAN_IDS.includes(String(planId || "").toLowerCase());
}

export function checkoutModeForPlan(plan) {
  return plan?.subscription ? "subscription" : "payment";
}

export function productionInlinePriceDataBlocked(nodeEnv = process.env.NODE_ENV, stripeMode = process.env.STRIPE_MODE) {
  return String(nodeEnv || "development") === "production" || String(stripeMode || "auto") === "live";
}

export function getPlanExpiry(plan, fromDate = new Date()) {
  if (!plan || plan.lifetime) return null;
  return new Date(fromDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
}

export function isPlanSaleActive(plan, now = new Date()) {
  return false;
}

export function getPlanCommerce(plan, now = new Date()) {
  return {
    currency: plan.currency || "eur",
    priceCents: plan.priceCents,
    compareAtCents: plan.compareAtCents || null,
    priceEnv: plan.priceEnv || null,
    saleActive: false
  };
}

export function getPlanPriceOptions(plan) {
  if (!plan?.priceEnv) return [];
  const options = [{
    label: "regular",
    currency: plan.currency || "eur",
    priceCents: plan.priceCents,
    priceEnv: plan.priceEnv
  }];
  return options;
}
