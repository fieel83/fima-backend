export const PLANS = {
  "2weeks": {
    id: "2weeks",
    name: "Fima Macro 2 Weeks",
    priceCents: 899,
    durationDays: 14,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_2WEEKS"
  },
  "1month": {
    id: "1month",
    name: "Fima Macro 1 Month",
    priceCents: 1499,
    durationDays: 30,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_1MONTH"
  },
  "3months": {
    id: "3months",
    name: "Fima Macro 3 Months",
    priceCents: 3299,
    durationDays: 90,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_3MONTHS"
  },
  "lifetime": {
    id: "lifetime",
    name: "Fima Macro Lifetime",
    priceCents: 6999,
    durationDays: null,
    lifetime: true,
    priceEnv: "STRIPE_PRICE_LIFETIME"
  }
};

export function getPlan(planId) {
  return PLANS[String(planId || "").toLowerCase()] || null;
}

export function planIds() {
  return Object.keys(PLANS);
}

export function getPlanExpiry(plan, fromDate = new Date()) {
  if (!plan || plan.lifetime) return null;
  return new Date(fromDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
}
