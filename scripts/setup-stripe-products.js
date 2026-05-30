import "dotenv/config";
import Stripe from "stripe";
import { PLANS, getPlanPriceOptions } from "../src/plans.js";
import { assertStripeSecretKeyAllowed } from "../src/stripeSafety.js";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is required in backend/.env");
}

assertStripeSecretKeyAllowed(secretKey, process.env.STRIPE_MODE || "test");

const stripe = new Stripe(secretKey);

for (const plan of Object.values(PLANS)) {
  const product = await findOrCreateProduct(plan);
  for (const option of getPlanPriceOptions(plan)) {
    const price = await findOrCreatePrice(product.id, plan, option);
    console.log(`${option.priceEnv}=${price.id}`);
  }
}

async function findOrCreateProduct(plan) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) => product.metadata?.fima_plan === plan.id);
  if (existing) return existing;

  return stripe.products.create({
    name: plan.name,
    metadata: {
      fima_plan: plan.id,
      app: "Fima Macro"
    }
  });
}

async function findOrCreatePrice(productId, plan, option) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find((price) =>
    price.currency === option.currency &&
    price.unit_amount === option.priceCents &&
    price.type === "one_time"
  );
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    unit_amount: option.priceCents,
    currency: option.currency,
    metadata: {
      fima_plan: plan.id,
      price_kind: option.label,
      duration_days: plan.durationDays === null ? "0" : String(plan.durationDays)
    }
  });
}
