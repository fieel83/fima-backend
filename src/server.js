import "dotenv/config";
import crypto from "node:crypto";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { apiBaseUrl, env, frontendUrl, listEnv, requiredEnv } from "./env.js";
import { PLANS, getPlan, getPlanExpiry, planIds } from "./plans.js";
import {
  buildLicenseData,
  generateUniqueLicenseKey,
  licensePayload,
  normalizeHwid,
  normalizeLicenseKey
} from "./license.js";
import { adminPage, loginPage } from "./adminHtml.js";
import { clearAdminCookie, createAdminToken, requireAdmin, setAdminCookie } from "./adminAuth.js";
import { assertStripeSecretKeyAllowed, stripeConfigSummary, stripeSessionPrefix } from "./stripeSafety.js";

const app = express();
const port = Number(env("PORT", "8080"));
const stripePriceEnvNames = Object.values(PLANS).map((plan) => plan.priceEnv);

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const validateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(cors({
  origin(origin, callback) {
    const allowed = listEnv("CORS_ORIGINS", `${frontendUrl()},https://www.fimamacro.com`);
    if (!origin || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: env("APP_NAME", "Fima Macro"),
    mode: env("NODE_ENV", "development"),
    apiBaseUrl: apiBaseUrl(),
    stripe: stripeStatus()
  });
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe().webhooks.constructEvent(req.body, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await fulfillCheckoutSession(event.data.object);
    }
    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook fulfillment failed", { type: event.type, message: error.message });
    return res.status(500).json({ error: "webhook_fulfillment_failed" });
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.post("/api/checkout/create-session", checkoutLimiter, async (req, res) => {
  try {
    const plan = getPlan(req.body?.plan);
    if (!plan) return res.status(400).json({ error: "invalid_plan", plans: planIds() });

    const customerEmail = String(req.body?.customerEmail || "").trim().toLowerCase();
    if (!isValidEmail(customerEmail)) return res.status(400).json({ error: "invalid_email" });

    const priceId = env(plan.priceEnv);
    const checkout = await createCheckoutSession({
      plan,
      customerEmail,
      priceId,
      selectedCurrency: String(req.body?.currency || "USD").toUpperCase(),
      language: String(req.body?.language || "en").slice(0, 8)
    });
    const session = checkout.session;

    const checkoutMode = session.livemode ? "live" : "test";
    const checkoutSessionPrefix = stripeSessionPrefix(session.id);
    console.info("Stripe checkout session created", {
      plan: plan.id,
      stripeMode: checkoutMode,
      checkoutSessionPrefix,
      priceEnv: plan.priceEnv,
      priceSource: checkout.priceSource,
      stripe: stripeStatus()
    });

    return res.json({ url: session.url, mode: checkoutMode, checkoutSessionPrefix, priceSource: checkout.priceSource });
  } catch (error) {
    console.error("Checkout session creation failed", { ...publicError(error), stripe: stripeStatus() });
    return res.status(error.code === "missing_env" ? 503 : 500).json({ error: "checkout_failed" });
  }
});

app.get("/api/checkout/result", async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId.startsWith("cs_")) return res.status(400).json({ success: false, status: "invalid_session" });

    let order = await findOrderBySession(sessionId);
    if (!order) {
      order = await tryFulfillFromStripeSession(sessionId);
    }

    if (!order?.license) {
      return res.json({ success: false, status: "processing" });
    }

    return res.json({
      success: true,
      ...licensePayload(order.license)
    });
  } catch (error) {
    console.error("Checkout result failed", publicError(error));
    return res.status(500).json({ success: false, status: "error" });
  }
});

app.post("/api/license/validate", validateLimiter, async (req, res) => {
  try {
    const licenseKey = normalizeLicenseKey(req.body?.licenseKey);
    const hwid = normalizeHwid(req.body?.hwid);

    if (!licenseKey || !hwid) {
      return res.status(400).json({ valid: false, reason: "invalid", message: "Invalid license key" });
    }

    let license = await prisma.license.findUnique({ where: { licenseKey } });
    if (!license) return invalid(res, "invalid", "Invalid license key");
    if (license.status === "banned") return invalid(res, "banned", "This license has been banned");
    if (license.status !== "active") return invalid(res, "inactive", "This license is inactive");
    if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      return invalid(res, "expired", "Your license has expired");
    }

    if (!license.hwid) {
      await prisma.license.updateMany({
        where: { id: license.id, hwid: null },
        data: { hwid }
      });
      license = await prisma.license.findUnique({ where: { id: license.id } });
    }

    if (normalizeHwid(license.hwid) !== hwid) {
      return invalid(res, "hwid_mismatch", "This license is already used on another device");
    }

    return res.json({
      valid: true,
      plan: license.plan,
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
      lifetime: license.lifetime,
      message: "License valid"
    });
  } catch (error) {
    console.error("License validation failed", publicError(error));
    return res.status(500).json({ valid: false, reason: "server_error", message: "License validation failed" });
  }
});

app.get("/admin/login", (_req, res) => res.type("html").send(loginPage()));

app.post("/admin/login", adminLoginLimiter, (req, res) => {
  const submitted = String(req.body?.password || "");
  const expected = requiredEnv("ADMIN_PASSWORD");
  if (!timingSafeTextEqual(submitted, expected)) {
    return res.status(401).type("html").send(loginPage("Invalid password"));
  }
  setAdminCookie(res, createAdminToken());
  return res.redirect("/admin");
});

app.post("/admin/logout", requireAdmin, (_req, res) => {
  clearAdminCookie(res);
  res.redirect("/admin/login");
});

app.get("/admin", requireAdmin, (_req, res) => res.type("html").send(adminPage()));

app.get("/admin/api/licenses", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const plan = String(req.query.plan || "").trim();
  const status = String(req.query.status || "").trim();
  const where = {
    AND: [
      search
        ? {
            OR: [
              { customerEmail: { contains: search, mode: "insensitive" } },
              { licenseKey: { contains: search.toUpperCase() } }
            ]
          }
        : {},
      plan ? { plan } : {},
      status ? { status } : {}
    ]
  };

  const licenses = await prisma.license.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ licenses });
});

app.get("/admin/api/licenses/:id", requireAdmin, async (req, res) => {
  const license = await prisma.license.findUnique({
    where: { id: req.params.id },
    include: { orders: { orderBy: { createdAt: "desc" } } }
  });
  if (!license) return res.status(404).json({ error: "not_found" });
  return res.json({ license });
});

app.post("/admin/api/licenses/manual", requireAdmin, async (req, res) => {
  const plan = getPlan(req.body?.plan);
  const customerEmail = String(req.body?.customerEmail || "").trim().toLowerCase();
  if (!plan) return res.status(400).json({ error: "invalid_plan" });
  if (!isValidEmail(customerEmail)) return res.status(400).json({ error: "invalid_email" });

  const license = await prisma.license.create({
    data: buildLicenseData({
      licenseKey: await generateUniqueLicenseKey(),
      email: customerEmail,
      plan
    })
  });
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/extend", requireAdmin, async (req, res) => {
  const plan = getPlan(req.body?.plan);
  if (!plan) return res.status(400).json({ error: "invalid_plan" });

  const current = await prisma.license.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "not_found" });

  const baseDate = current.expiresAt && current.expiresAt > new Date() ? current.expiresAt : new Date();
  const license = await prisma.license.update({
    where: { id: current.id },
    data: {
      plan: plan.id,
      lifetime: plan.lifetime,
      expiresAt: plan.lifetime ? null : getPlanExpiry(plan, baseDate),
      status: "active"
    }
  });
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/status", requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["active", "inactive", "banned"].includes(status)) return res.status(400).json({ error: "invalid_status" });
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { status } });
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/reset-hwid", requireAdmin, async (req, res) => {
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { hwid: null } });
  return res.json({ license });
});

app.get("/admin/api/orders", requireAdmin, async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { license: true }
  });
  res.json({ orders });
});

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(port, () => {
  console.log(`Fima payments API listening on ${port}`);
  console.info("Stripe configuration", stripeStatus());
});

function stripe() {
  const key = requiredEnv("STRIPE_SECRET_KEY").trim();
  assertStripeSecretKeyAllowed(key, env("STRIPE_MODE", "auto"));
  return new Stripe(key);
}

function stripeStatus() {
  return stripeConfigSummary(stripePriceEnvNames);
}

async function createCheckoutSession({ plan, customerEmail, priceId, selectedCurrency, language }) {
  const stripeClient = stripe();
  const baseSession = {
    mode: "payment",
    customer_email: customerEmail,
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/#pricing`,
    metadata: checkoutMetadata(plan, selectedCurrency, language)
  };

  if (priceId) {
    try {
      const session = await stripeClient.checkout.sessions.create({
        ...baseSession,
        line_items: [{ price: priceId, quantity: 1 }]
      });
      return { session, priceSource: "price_id" };
    } catch (error) {
      if (!isMissingStripePrice(error)) throw error;
      console.warn("Stripe price ID unavailable for current mode, using inline price data", {
        plan: plan.id,
        priceEnv: plan.priceEnv,
        stripe: stripeStatus(),
        stripeErrorCode: error.code,
        stripeErrorType: error.type
      });
    }
  }

  const session = await stripeClient.checkout.sessions.create({
    ...baseSession,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: plan.priceCents,
        product_data: {
          name: plan.name,
          metadata: {
            fima_plan: plan.id,
            app: env("APP_NAME", "Fima Macro")
          }
        }
      }
    }]
  });
  return { session, priceSource: "inline_price_data" };
}

function checkoutMetadata(plan, selectedCurrency, language) {
  return {
    plan: plan.id,
    durationDays: plan.durationDays === null ? "0" : String(plan.durationDays),
    productName: env("APP_NAME", "Fima Macro"),
    selectedCurrency,
    language
  };
}

function isMissingStripePrice(error) {
  return error?.code === "resource_missing" && String(error?.message || "").toLowerCase().includes("price");
}

async function fulfillCheckoutSession(session) {
  const plan = getPlan(session.metadata?.plan);
  if (!plan) throw new Error("Invalid or missing session metadata plan");
  if (session.payment_status && session.payment_status !== "paid") throw new Error("Session is not paid");

  const existing = await findOrderBySession(session.id);
  if (existing?.license) return existing;

  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Checkout session missing customer email");

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const again = await tx.order.findUnique({
        where: { stripeSessionId: session.id },
        include: { license: true }
      });
      if (again?.license) return again;

      const license = await tx.license.create({
        data: buildLicenseData({
          licenseKey: await generateUniqueLicenseKey(tx),
          email,
          plan,
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId
        })
      });

      const order = await tx.order.upsert({
        where: { stripeSessionId: session.id },
        create: {
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          customerEmail: email,
          plan: plan.id,
          amount: session.amount_total ?? plan.priceCents,
          currency: String(session.currency || "usd").toLowerCase(),
          status: session.payment_status || "paid",
          licenseId: license.id
        },
        update: {
          stripePaymentIntentId: paymentIntentId,
          customerEmail: email,
          status: session.payment_status || "paid",
          licenseId: license.id
        },
        include: { license: true }
      });

      return order;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const order = await findOrderBySession(session.id);
      if (order?.license) return order;
    }
    throw error;
  }
}

async function tryFulfillFromStripeSession(sessionId) {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") return fulfillCheckoutSession(session);
  } catch (error) {
    console.error("Session retrieve failed", publicError(error));
  }
  return null;
}

function findOrderBySession(sessionId) {
  return prisma.order.findUnique({
    where: { stripeSessionId: sessionId },
    include: { license: true }
  });
}

function invalid(res, reason, message) {
  return res.json({ valid: false, reason, message });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicError(error) {
  return { message: error.message, code: error.code, type: error.type };
}

function timingSafeTextEqual(left, right) {
  const a = crypto.createHash("sha256").update(left).digest();
  const b = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(a, b);
}
