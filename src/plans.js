export const PLANS = {
  "1day": {
    id: "1day",
    name: "Fima Macro 1 Day",
    priceCents: 99,
    salePriceCents: 74,
    compareAtCents: 99,
    currency: "eur",
    durationDays: 1,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_1DAY",
    salePriceEnv: "STRIPE_SALE_PRICE_1DAY"
  },
  "2weeks": {
    id: "2weeks",
    name: "Fima Macro 15 Days",
    priceCents: 399,
    salePriceCents: 299,
    compareAtCents: 399,
    currency: "eur",
    durationDays: 15,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_2WEEKS",
    salePriceEnv: "STRIPE_SALE_PRICE_2WEEKS"
  },
  "1month": {
    id: "1month",
    name: "Fima Macro 1 Month",
    priceCents: 799,
    salePriceCents: 599,
    compareAtCents: 799,
    currency: "eur",
    durationDays: 30,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_1MONTH",
    salePriceEnv: "STRIPE_SALE_PRICE_1MONTH"
  },
  "3months": {
    id: "3months",
    name: "Fima Macro 3 Months",
    priceCents: 1799,
    salePriceCents: 1349,
    compareAtCents: 1799,
    currency: "eur",
    durationDays: 90,
    lifetime: false,
    priceEnv: "STRIPE_PRICE_3MONTHS",
    salePriceEnv: "STRIPE_SALE_PRICE_3MONTHS"
  },
  "lifetime": {
    id: "lifetime",
    name: "Fima Macro Lifetime",
    priceCents: 3999,
    currency: "eur",
    durationDays: null,
    lifetime: true,
    priceEnv: "STRIPE_PRICE_LIFETIME"
  }
};

export const SALE_START_AT = new Date("2026-05-31T00:00:00+02:00");
export const SALE_END_AT = new Date("2026-06-03T23:59:59+02:00");

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

export function isPlanSaleActive(plan, now = new Date()) {
  if (!plan || plan.lifetime || !plan.salePriceEnv || !plan.salePriceCents) return false;
  const current = now instanceof Date ? now : new Date(now);
  return current >= SALE_START_AT && current <= SALE_END_AT;
}

export function getPlanCommerce(plan, now = new Date()) {
  const saleActive = isPlanSaleActive(plan, now);
  return {
    currency: plan.currency || "eur",
    priceCents: saleActive ? plan.salePriceCents : plan.priceCents,
    compareAtCents: plan.compareAtCents || null,
    priceEnv: saleActive ? plan.salePriceEnv : plan.priceEnv,
    saleActive,
    saleStartAt: SALE_START_AT.toISOString(),
    saleEndAt: SALE_END_AT.toISOString()
  };
}

export function getPlanPriceOptions(plan) {
  const options = [{
    label: "regular",
    currency: plan.currency || "eur",
    priceCents: plan.priceCents,
    priceEnv: plan.priceEnv
  }];
  if (plan.salePriceEnv && plan.salePriceCents) {
    options.push({
      label: "sale",
      currency: plan.currency || "eur",
      priceCents: plan.salePriceCents,
      priceEnv: plan.salePriceEnv
    });
  }
  return options;
}
