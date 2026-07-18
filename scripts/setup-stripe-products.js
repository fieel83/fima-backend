import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import {
  checkoutModeForPlan,
  getDirectGiftCommerce,
  getGiftCodeCommerce,
  getPlan,
  getPlanCommerce,
  publicCheckoutPlanIds
} from "../src/plans.js";
import { assertStripeSecretKeyAllowed, stripeKeyMode } from "../src/stripeSafety.js";

const LIVE_ENV_MAP = Object.freeze({
  "3days": "STRIPE_PRICE_3DAYS",
  monthly: "STRIPE_PRICE_MONTHLY",
  lifetime: "STRIPE_PRICE_LIFETIME"
});

const TEST_ENV_MAP = Object.freeze({
  "3days": "STRIPE_TEST_PRICE_3DAYS",
  monthly: "STRIPE_TEST_PRICE_MONTHLY",
  lifetime: "STRIPE_TEST_PRICE_LIFETIME"
});

const LIVE_GIFT_ENV_MAP = Object.freeze({
  "3days": "STRIPE_GIFT_PRICE_3DAYS",
  monthly: "STRIPE_GIFT_PRICE_MONTHLY",
  lifetime: "STRIPE_GIFT_PRICE_LIFETIME"
});

const TEST_GIFT_ENV_MAP = Object.freeze({
  "3days": "STRIPE_TEST_GIFT_PRICE_3DAYS",
  monthly: "STRIPE_TEST_GIFT_PRICE_MONTHLY",
  lifetime: "STRIPE_TEST_GIFT_PRICE_LIFETIME"
});

const LIVE_DIRECT_GIFT_ENV_MAP = Object.freeze({
  "3days": "STRIPE_DIRECT_GIFT_PRICE_3DAYS",
  monthly: "STRIPE_DIRECT_GIFT_PRICE_MONTHLY",
  lifetime: "STRIPE_DIRECT_GIFT_PRICE_LIFETIME"
});

const TEST_DIRECT_GIFT_ENV_MAP = Object.freeze({
  "3days": "STRIPE_TEST_DIRECT_GIFT_PRICE_3DAYS",
  monthly: "STRIPE_TEST_DIRECT_GIFT_PRICE_MONTHLY",
  lifetime: "STRIPE_TEST_DIRECT_GIFT_PRICE_LIFETIME"
});

export function setupEnvScope(value = "", secretKey = process.env.STRIPE_SECRET_KEY) {
  const explicit = String(value || "").trim().toLowerCase();
  if (explicit === "live" || explicit === "test") return explicit;
  return stripeKeyMode(secretKey) === "test" ? "test" : "live";
}

export function stripeSetupTargets({ envScope = "live" } = {}) {
  const scope = setupEnvScope(envScope);
  const envMap = scope === "test" ? TEST_ENV_MAP : LIVE_ENV_MAP;
  const giftEnvMap = scope === "test" ? TEST_GIFT_ENV_MAP : LIVE_GIFT_ENV_MAP;
  const directGiftEnvMap = scope === "test" ? TEST_DIRECT_GIFT_ENV_MAP : LIVE_DIRECT_GIFT_ENV_MAP;
  const plans = publicCheckoutPlanIds().map((planId) => {
    const plan = getPlan(planId);
    const commerce = getPlanCommerce(plan);
    const checkoutMode = checkoutModeForPlan(plan);
    return {
      plan,
      planId,
      productName: plan.name,
      envName: envMap[planId],
      checkoutType: "license_purchase",
      currency: commerce.currency,
      amount: commerce.priceCents,
      checkoutMode,
      priceType: checkoutMode === "subscription" ? "recurring" : "one_time",
      interval: checkoutMode === "subscription" ? "month" : null,
      metadata: {
        app: "fima_macro",
        fima_plan: plan.id,
        fima_checkout_type: "license_purchase",
        product_type: "license",
        managed_by: "fima_standalone_setup"
      }
    };
  });
  const giftCodes = publicCheckoutPlanIds().map((planId) => {
    const plan = getPlan(planId);
    const commerce = getGiftCodeCommerce(plan, { test: scope === "test" });
    return {
      plan,
      planId,
      productName: commerce.productName,
      envName: giftEnvMap[planId],
      checkoutType: "gift_code_purchase",
      currency: commerce.currency,
      amount: commerce.priceCents,
      checkoutMode: "payment",
      priceType: "one_time",
      interval: null,
      metadata: {
        app: "fima_macro",
        fima_plan: plan.id,
        fima_checkout_type: "gift_code_purchase",
        product_type: "gift_code",
        managed_by: "fima_standalone_setup"
      }
    };
  });
  const directGifts = publicCheckoutPlanIds().map((planId) => {
    const plan = getPlan(planId);
    const commerce = getDirectGiftCommerce(plan, { test: scope === "test" });
    return {
      plan,
      planId,
      productName: commerce.productName,
      envName: directGiftEnvMap[planId],
      checkoutType: "direct_gift_purchase",
      currency: commerce.currency,
      amount: commerce.priceCents,
      checkoutMode: "payment",
      priceType: "one_time",
      interval: null,
      metadata: {
        app: "fima_macro",
        fima_plan: plan.id,
        fima_checkout_type: "direct_gift_purchase",
        product_type: "direct_gift",
        managed_by: "fima_standalone_setup"
      }
    };
  });
  return [...plans, ...giftCodes, ...directGifts];
}

export async function runStripeProductSetup({
  secretKey = process.env.STRIPE_SECRET_KEY,
  configuredMode = process.env.STRIPE_MODE || "auto",
  envScope = process.env.STRIPE_SETUP_ENV_SCOPE,
  stripeClient = null,
  log = console.log
} = {}) {
  if (!secretKey && !stripeClient) {
    throw new Error("STRIPE_SECRET_KEY is required in backend/.env");
  }

  const scope = setupEnvScope(envScope, secretKey);
  const keyMode = stripeKeyMode(secretKey);
  if ((keyMode === "live" || keyMode === "test") && keyMode !== scope) {
    throw new Error(`STRIPE_SETUP_ENV_SCOPE=${scope} does not match the provided ${keyMode} Stripe key.`);
  }
  if (!stripeClient) assertStripeSecretKeyAllowed(secretKey, configuredMode);
  const stripe = stripeClient || new Stripe(secretKey);
  const rows = [];

  for (const target of stripeSetupTargets({ envScope: scope })) {
    const product = await findOrCreateProduct(stripe, target);
    const price = await findOrCreatePrice(stripe, product.product.id, target);
    log(`${target.envName}=${price.price.id}`);
    rows.push({
      plan: target.planId,
      checkoutType: target.checkoutType,
      productId: product.product.id,
      priceId: price.price.id,
      productCreated: product.created,
      priceCreated: price.created,
      envName: target.envName,
      amount: target.amount,
      currency: target.currency,
      priceType: target.priceType,
      interval: target.interval
    });
  }

  return { envScope: scope, products: rows };
}

async function findOrCreateProduct(stripe, target) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) => productMatchesTarget(product, target));
  if (existing) return { product: existing, created: false };

  const product = await stripe.products.create({
    name: target.productName,
    active: true,
    metadata: target.metadata
  });
  return { product, created: true };
}

function productMatchesTarget(product, target) {
  const metadata = product.metadata || {};
  const samePlan = metadata.fima_plan === target.planId;
  const sameApp = !metadata.app || metadata.app === "fima_macro";
  const productCheckoutType = String(metadata.fima_checkout_type || "").trim().toLowerCase();
  if (target.checkoutType === "gift_code_purchase" || target.checkoutType === "direct_gift_purchase") {
    return samePlan && sameApp && productCheckoutType === target.checkoutType;
  }
  const isSpecialProduct = ["gift_code_purchase", "direct_gift_purchase"].includes(productCheckoutType) ||
    ["gift_code", "direct_gift"].includes(metadata.product_type);
  return !isSpecialProduct && sameApp && (
    samePlan || normalizeName(product.name) === normalizeName(target.productName)
  );
}

async function findOrCreatePrice(stripe, productId, target) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find((price) => priceMatchesTarget(price, target));
  if (existing) return { price: existing, created: false };

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: target.amount,
    currency: target.currency,
    ...(target.priceType === "recurring" ? { recurring: { interval: target.interval } } : {}),
    metadata: target.metadata
  });
  return { price, created: true };
}

function priceMatchesTarget(price, target) {
  if (String(price.currency || "").toLowerCase() !== target.currency) return false;
  if (price.unit_amount !== target.amount) return false;
  if (target.priceType === "recurring") return price.type === "recurring" && price.recurring?.interval === target.interval;
  return price.type === "one_time";
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runStripeProductSetup().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
