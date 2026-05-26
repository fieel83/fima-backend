import "dotenv/config";
import Stripe from "stripe";
import { PLANS } from "../src/plans.js";
import { assertStripeTestKey } from "../src/stripeSafety.js";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is required in backend/.env");
}

assertStripeTestKey(secretKey);

const stripe = new Stripe(secretKey);

const envNames = {
  "2weeks": "STRIPE_PRICE_2WEEKS",
  "1month": "STRIPE_PRICE_1MONTH",
  "3months": "STRIPE_PRICE_3MONTHS",
  "lifetime": "STRIPE_PRICE_LIFETIME"
};

for (const plan of Object.values(PLANS)) {
  const product = await findOrCreateProduct(plan);
  const price = await findOrCreatePrice(product.id, plan);
  console.log(`${envNames[plan.id]}=${price.id}`);
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

async function findOrCreatePrice(productId, plan) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find((price) =>
    price.currency === "usd" &&
    price.unit_amount === plan.priceCents &&
    price.type === "one_time"
  );
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    unit_amount: plan.priceCents,
    currency: "usd",
    metadata: {
      fima_plan: plan.id,
      duration_days: plan.durationDays === null ? "0" : String(plan.durationDays)
    }
  });
}
