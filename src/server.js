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
let lastStripePriceValidation = {
  checkedAt: null,
  results: Object.fromEntries(stripePriceEnvNames.map((name) => [name, { status: "unchecked" }]))
};

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const validateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const defaultSiteSettings = {
  discordInviteUrl: env("DISCORD_INVITE_URL", ""),
  supportEmail: env("SUPPORT_EMAIL", "support@fimamacro.com"),
  brandName: env("APP_NAME", "Fima Macro"),
  maintenanceMode: false,
  announcementBannerText: "",
  announcementBannerEnabled: false,
  pricingVisible: true,
  checkoutEnabled: true,
  downloadEnabled: true
};

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
  let webhookRecord;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe().webhooks.constructEvent(req.body, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    webhookRecord = await prisma.webhookEvent.upsert({
      where: { stripeEventId: event.id },
      create: {
        stripeEventId: event.id,
        type: event.type,
        processed: false,
        metadata: {
          livemode: Boolean(event.livemode),
          object: event.data?.object?.object,
          sessionId: event.data?.object?.id,
          paymentStatus: event.data?.object?.payment_status
        }
      },
      update: {}
    });

    if (webhookRecord.processed) {
      return res.json({ received: true, duplicate: true });
    }

    let fulfillment = null;
    if (event.type === "checkout.session.completed") {
      fulfillment = await fulfillCheckoutSession(event.data.object);
    }
    await prisma.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        processed: true,
        errorMessage: null,
        relatedOrderId: fulfillment?.id || null,
        relatedLicenseId: fulfillment?.license?.id || fulfillment?.licenseId || null
      }
    });
    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook fulfillment failed", { type: event.type, message: error.message });
    if (event?.id) {
      await prisma.webhookEvent.update({
        where: { stripeEventId: event.id },
        data: { processed: false, errorMessage: error.message }
      }).catch(() => {});
    }
    return res.status(500).json({ error: "webhook_fulfillment_failed" });
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/public/site-settings", async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({ success: true, settings: publicSiteSettings(settings) });
});

app.post("/api/checkout/create-session", checkoutLimiter, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode || settings.checkoutEnabled === false) {
      return res.status(503).json({ error: "checkout_disabled" });
    }

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
    await createAnalyticsEvent("checkout_created", {
      plan: plan.id,
      amount: plan.priceCents,
      currency: "usd",
      mode: session.livemode ? "live" : "test",
      metadata: { priceSource: checkout.priceSource }
    });

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
    await createAnalyticsEvent("checkout_failed", {
      metadata: { code: error.code, type: error.type }
    });
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

app.get("/api/download", downloadLimiter, async (req, res) => {
  const licenseKey = normalizeLicenseKey(req.query?.licenseKey);
  const settings = await getSiteSettings();

  if (settings.downloadEnabled === false) {
    await logDownload(null, licenseKey || "-", "failed", "download_disabled");
    return res.status(403).json({ success: false, reason: "download_disabled", message: "Downloads are currently disabled." });
  }

  if (!licenseKey) {
    await logDownload(null, "-", "failed", "invalid_license");
    return res.status(400).json({ success: false, reason: "invalid_license", message: "Invalid or expired license." });
  }

  const license = await prisma.license.findUnique({ where: { licenseKey } });
  const access = licenseAccessState(license);
  if (!access.valid) {
    await logDownload(license, licenseKey, "failed", access.reason);
    return res.status(403).json({ success: false, reason: access.reason, message: "Invalid or expired license." });
  }

  const downloadInfo = await resolveDownloadInfo();
  await prisma.$transaction([
    prisma.license.update({
      where: { id: license.id },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: new Date()
      }
    }),
    prisma.downloadLog.create({
      data: {
        licenseId: license.id,
        licenseKey,
        result: "success",
        version: downloadInfo.version || null
      }
    }),
    prisma.auditLog.create({
      data: {
        action: "download_accessed",
        targetType: "license",
        targetId: license.id,
        metadata: { version: downloadInfo.version || null }
      }
    })
  ]);

  return res.json({
    success: true,
    downloadUrl: downloadInfo.downloadUrl,
    version: downloadInfo.version || null
  });
});

app.post("/api/license/validate", validateLimiter, async (req, res) => {
  const licenseKey = normalizeLicenseKey(req.body?.licenseKey);
  const hwid = normalizeHwid(req.body?.hwid);
  const appVersion = String(req.body?.appVersion || "").trim().slice(0, 80) || null;

  try {
    if (!licenseKey || !hwid) {
      await logValidation(null, licenseKey || "-", "failed", "invalid", hwid, appVersion);
      return res.status(400).json({ valid: false, reason: "invalid", message: "Invalid license key" });
    }

    let license = await prisma.license.findUnique({ where: { licenseKey } });
    if (!license) {
      await logValidation(null, licenseKey, "failed", "invalid", hwid, appVersion);
      return invalid(res, "invalid", "Invalid license key");
    }
    if (license.status === "banned") {
      await incrementValidationFailure(license, licenseKey, "banned", hwid, appVersion);
      return invalid(res, "banned", "This license has been banned");
    }
    if (license.status !== "active") {
      await incrementValidationFailure(license, licenseKey, "inactive", hwid, appVersion);
      return invalid(res, "inactive", "This license is inactive");
    }
    if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      await incrementValidationFailure(license, licenseKey, "expired", hwid, appVersion);
      return invalid(res, "expired", "Your license has expired.");
    }

    if (!license.hwid) {
      await prisma.license.updateMany({
        where: { id: license.id, hwid: null },
        data: { hwid }
      });
      license = await prisma.license.findUnique({ where: { id: license.id } });
    }

    if (normalizeHwid(license.hwid) !== hwid) {
      await incrementValidationFailure(license, licenseKey, "hwid_mismatch", hwid, appVersion);
      return invalid(res, "hwid_mismatch", "This license is already used on another device");
    }

    await prisma.$transaction([
      prisma.license.update({
        where: { id: license.id },
        data: {
          validationCount: { increment: 1 },
          lastValidatedAt: new Date()
        }
      }),
      prisma.validationLog.create({
        data: {
          licenseId: license.id,
          licenseKey,
          result: "success",
          reason: "valid",
          hwidHash: hashHwid(hwid),
          appVersion
        }
      }),
      prisma.analyticsEvent.create({
        data: {
          type: "license_validation",
          plan: license.plan,
          metadata: { result: "success", appVersion }
        }
      })
    ]);

    return res.json({
      valid: true,
      licenseKey,
      plan: license.plan,
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
      lifetime: license.lifetime,
      message: "License valid"
    });
  } catch (error) {
    console.error("License validation failed", publicError(error));
    await logValidation(null, licenseKey || "-", "failed", "server_error", hwid, appVersion);
    return res.status(500).json({ valid: false, reason: "server_error", message: "License validation failed" });
  }
});

app.get("/admin/login", (_req, res) => res.type("html").send(loginPage()));

app.post("/admin/login", adminLoginLimiter, async (req, res) => {
  try {
    const submitted = String(req.body?.password || "");
    const expected = requiredEnv("ADMIN_PASSWORD");
    if (!timingSafeTextEqual(submitted, expected)) {
      await createAuditLog("admin_login_failed", "admin", null, { reason: "invalid_password" });
      return res.status(401).type("html").send(loginPage("Invalid password"));
    }

    await createAuditLog("admin_login_success", "admin", null, {});
    setAdminCookie(res, createAdminToken());
    return sendAdminPage(res);
  } catch (error) {
    console.error("Admin login route failed", publicError(error));
    return res.status(500).type("html").send(loginPage("Admin login failed. Check backend environment variables and Render logs."));
  }
});

app.post("/admin/logout", requireAdmin, (_req, res) => {
  createAuditLog("admin_logout", "admin", null, {});
  clearAdminCookie(res);
  res.redirect("/admin/login");
});

app.get("/admin", requireAdmin, (_req, res) => sendAdminPage(res));

app.get("/admin/api/dashboard", requireAdmin, async (_req, res) => {
  const now = new Date();
  const startToday = startOfDay(now);
  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - 6);
  startWeek.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    orders,
    totalOrders,
    totalLicenses,
    activeLicenses,
    bannedLicenses,
    lifetimeLicenses,
    recentPurchases,
    recentValidations,
    failedWebhookCount,
    failedCheckoutCount,
    downloadCount,
    failedValidationCount,
    hwidMismatchCount,
    activeValidationUsers
  ] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: "asc" }, take: 2000 }),
    prisma.order.count(),
    prisma.license.count(),
    prisma.license.count({ where: { status: "active", OR: [{ lifetime: true }, { expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.license.count({ where: { status: "banned" } }),
    prisma.license.count({ where: { lifetime: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { license: true } }),
    prisma.validationLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.webhookEvent.count({ where: { OR: [{ processed: false }, { errorMessage: { not: null } }] } }),
    prisma.analyticsEvent.count({ where: { type: "checkout_failed" } }),
    prisma.downloadLog.count({ where: { result: "success" } }),
    prisma.validationLog.count({ where: { result: "failed" } }),
    prisma.validationLog.count({ where: { reason: "hwid_mismatch" } }),
    prisma.validationLog.findMany({ where: { result: "success", createdAt: { gte: last24h } }, distinct: ["licenseId"], select: { licenseId: true } })
  ]);

  const revenue = (from) => orders.filter((order) => !from || order.createdAt >= from).reduce((sum, order) => sum + order.amount, 0);
  const expiredLicenses = await prisma.license.count({
    where: { lifetime: false, expiresAt: { lt: now }, status: { not: "banned" } }
  });
  const mostSoldPlan = topGroup(orders.map((order) => order.plan));
  const revenueByDay = groupRevenueByDay(orders, 14);
  const ordersByPlan = countBy(orders.map((order) => order.plan));
  const statusRows = await prisma.license.groupBy({ by: ["status"], _count: { _all: true } });

  res.json({
    cards: {
      totalRevenue: revenue(null),
      todayRevenue: revenue(startToday),
      weekRevenue: revenue(startWeek),
      monthRevenue: revenue(startMonth),
      totalOrders,
      totalLicenses,
      activeLicenses,
      expiredLicenses,
      bannedLicenses,
      lifetimeLicenses,
      mostSoldPlan: mostSoldPlan || "-",
      failedWebhookCount,
      failedCheckoutCount,
      downloadCount,
      activeUsersLast24h: activeValidationUsers.filter((row) => row.licenseId).length,
      failedValidationCount,
      hwidMismatchCount
    },
    charts: {
      revenueByDay,
      ordersByPlan,
      licenseStatus: Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]))
    },
    recentPurchases,
    recentValidations
  });
});

app.get("/admin/api/licenses", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const plan = String(req.query.plan || "").trim();
  const status = String(req.query.status || "").trim();
  const hwid = String(req.query.hwid || "").trim();
  const lifetime = String(req.query.lifetime || "").trim();
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
      status ? { status } : {},
      hwid ? { hwid: { contains: hwid } } : {},
      lifetime === "true" ? { lifetime: true } : {},
      lifetime === "false" ? { lifetime: false } : {}
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
    include: {
      orders: { orderBy: { createdAt: "desc" } },
      validationLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      downloadLogs: { orderBy: { createdAt: "desc" }, take: 50 }
    }
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
  await ensureCustomer(customerEmail);
  await createAuditLog("manual_license_created", "license", license.id, { plan: plan.id, customerEmail });
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
  await createAuditLog("license_extended", "license", license.id, { plan: plan.id });
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/status", requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["active", "inactive", "banned"].includes(status)) return res.status(400).json({ error: "invalid_status" });
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { status } });
  await createAuditLog(status === "banned" ? "license_banned" : "license_status_changed", "license", license.id, { status });
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/reset-hwid", requireAdmin, async (req, res) => {
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { hwid: null } });
  await createAuditLog("license_hwid_reset", "license", license.id, {});
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/notes", requireAdmin, async (req, res) => {
  const notes = String(req.body?.notes || "").slice(0, 5000);
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { notes } });
  await createAuditLog("license_notes_updated", "license", license.id, {});
  return res.json({ license });
});

app.post("/admin/api/licenses/:id/lifetime", requireAdmin, async (req, res) => {
  const lifetime = Boolean(req.body?.lifetime);
  const license = await prisma.license.update({
    where: { id: req.params.id },
    data: { lifetime, expiresAt: lifetime ? null : undefined }
  });
  await createAuditLog(lifetime ? "license_marked_lifetime" : "license_lifetime_removed", "license", license.id, {});
  return res.json({ license });
});

app.get("/admin/api/orders", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const plan = String(req.query.plan || "").trim();
  const status = String(req.query.status || "").trim();
  const currency = String(req.query.currency || "").trim().toLowerCase();
  const mode = String(req.query.mode || "").trim().toLowerCase();
  const where = {
    AND: [
      search
        ? {
            OR: [
              { customerEmail: { contains: search, mode: "insensitive" } },
              { stripeSessionId: { contains: search } },
              { stripePaymentIntentId: { contains: search } }
            ]
          }
        : {},
      plan ? { plan } : {},
      status ? { status } : {},
      currency ? { currency } : {},
      mode ? { mode } : {}
    ]
  };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { license: true }
  });
  res.json({ orders });
});

app.get("/admin/api/orders/:id", requireAdmin, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { license: true }
  });
  if (!order) return res.status(404).json({ error: "not_found" });
  const webhooks = await prisma.webhookEvent.findMany({
    where: {
      OR: [
        { relatedOrderId: order.id },
        { metadata: { path: ["sessionId"], equals: order.stripeSessionId } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return res.json({ order, webhooks });
});

app.post("/admin/api/orders/:id/notes", requireAdmin, async (req, res) => {
  const notes = String(req.body?.notes || "").slice(0, 5000);
  const order = await prisma.order.update({ where: { id: req.params.id }, data: { notes } });
  await createAuditLog("order_notes_updated", "order", order.id, {});
  return res.json({ order });
});

app.get("/admin/api/customers", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const customers = await prisma.customer.findMany({
    where: search ? { email: { contains: search, mode: "insensitive" } } : {},
    orderBy: { lastPurchaseAt: "desc" },
    take: 200
  });
  res.json({ customers });
});

app.get("/admin/api/customers/:email", requireAdmin, async (req, res) => {
  const email = String(req.params.email || "").trim().toLowerCase();
  const [customer, orders, licenses] = await Promise.all([
    prisma.customer.findUnique({ where: { email } }),
    prisma.order.findMany({ where: { customerEmail: email }, orderBy: { createdAt: "desc" }, include: { license: true } }),
    prisma.license.findMany({ where: { customerEmail: email }, orderBy: { createdAt: "desc" } })
  ]);
  if (!customer && !orders.length && !licenses.length) return res.status(404).json({ error: "not_found" });
  res.json({ customer, orders, licenses });
});

app.post("/admin/api/customers/:email/notes", requireAdmin, async (req, res) => {
  const email = String(req.params.email || "").trim().toLowerCase();
  const notes = String(req.body?.notes || "").slice(0, 5000);
  const customer = await prisma.customer.upsert({
    where: { email },
    create: { email, notes },
    update: { notes }
  });
  await createAuditLog("customer_notes_updated", "customer", customer.id, { email });
  res.json({ customer });
});

app.get("/admin/api/downloads", requireAdmin, async (_req, res) => {
  const info = await resolveDownloadInfo();
  const recent = await prisma.downloadLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { license: true } });
  res.json({ current: info, recent });
});

app.get("/admin/api/settings", requireAdmin, async (_req, res) => {
  res.json({ settings: await getSiteSettings() });
});

app.post("/admin/api/settings", requireAdmin, async (req, res) => {
  const current = await getSiteSettings();
  const next = sanitizeSettings({ ...current, ...(req.body || {}) });
  await prisma.setting.upsert({
    where: { key: "site" },
    create: { key: "site", value: next },
    update: { value: next }
  });
  await createAuditLog("settings_changed", "settings", "site", { changedKeys: Object.keys(req.body || {}) });
  res.json({ settings: next });
});

app.get("/admin/api/coupons", requireAdmin, async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ coupons });
});

app.post("/admin/api/coupons", requireAdmin, async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "invalid_code" });
  const coupon = await prisma.coupon.upsert({
    where: { code },
    create: {
      code,
      stripePromotionCodeId: String(req.body?.stripePromotionCodeId || "").trim() || null,
      percentOff: toOptionalInt(req.body?.percentOff),
      amountOff: toOptionalInt(req.body?.amountOff),
      currency: String(req.body?.currency || "").trim().toLowerCase() || null,
      active: req.body?.active !== false,
      maxRedemptions: toOptionalInt(req.body?.maxRedemptions),
      notes: String(req.body?.notes || "").slice(0, 1000) || null
    },
    update: {
      stripePromotionCodeId: String(req.body?.stripePromotionCodeId || "").trim() || null,
      percentOff: toOptionalInt(req.body?.percentOff),
      amountOff: toOptionalInt(req.body?.amountOff),
      currency: String(req.body?.currency || "").trim().toLowerCase() || null,
      active: req.body?.active !== false,
      maxRedemptions: toOptionalInt(req.body?.maxRedemptions),
      notes: String(req.body?.notes || "").slice(0, 1000) || null
    }
  });
  await createAuditLog("coupon_saved", "coupon", coupon.id, { code });
  res.json({ coupon });
});

app.get("/admin/api/analytics", requireAdmin, async (_req, res) => {
  const events = await prisma.analyticsEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  res.json({
    events,
    byType: countBy(events.map((event) => event.type)),
    byPlan: countBy(events.map((event) => event.plan || "none"))
  });
});

app.get("/admin/api/webhooks", requireAdmin, async (_req, res) => {
  const events = await prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ events });
});

app.get("/admin/api/audit", requireAdmin, async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ logs });
});

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(port, () => {
  console.log(`Fima payments API listening on ${port}`);
  console.info("Stripe configuration", stripeStatus());
  validateConfiguredStripePrices().catch((error) => {
    console.warn("Stripe price env validation failed", publicError(error));
  });
});

function stripe() {
  const key = requiredEnv("STRIPE_SECRET_KEY").trim();
  assertStripeSecretKeyAllowed(key, env("STRIPE_MODE", "auto"));
  return new Stripe(key);
}

function stripeStatus() {
  return {
    ...stripeConfigSummary(stripePriceEnvNames),
    priceValidation: lastStripePriceValidation
  };
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
    const priceCheck = await validateStripePriceForPlan(stripeClient, plan, priceId);
    recordStripePriceCheck(priceCheck);
    if (priceCheck.ok) {
      const session = await stripeClient.checkout.sessions.create({
        ...baseSession,
        line_items: [{ price: priceId, quantity: 1 }]
      });
      return { session, priceSource: "price_id" };
    }

    console.warn("Stripe price env invalid, using inline price data", sanitizePriceCheck(priceCheck));
  } else {
    const priceCheck = {
      ok: false,
      plan: plan.id,
      priceEnv: plan.priceEnv,
      status: "missing_env",
      expected: expectedPriceForPlan(plan)
    };
    recordStripePriceCheck(priceCheck);
    console.warn("Stripe price env missing, using inline price data", sanitizePriceCheck(priceCheck));
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

async function validateConfiguredStripePrices() {
  let stripeClient;
  try {
    stripeClient = stripe();
  } catch (error) {
    console.warn("Stripe price env validation skipped", {
      reason: error.code || "stripe_not_configured",
      message: error.message,
      stripe: stripeStatus()
    });
    return;
  }

  const results = [];
  for (const plan of Object.values(PLANS)) {
    const check = await validateStripePriceForPlan(stripeClient, plan, env(plan.priceEnv));
    recordStripePriceCheck(check);
    results.push(sanitizePriceCheck(check));
    if (check.ok) {
      console.info("Stripe price env valid", sanitizePriceCheck(check));
    } else {
      console.warn("Stripe price env invalid", sanitizePriceCheck(check));
    }
  }
  console.info("Stripe price env validation complete", {
    stripeMode: stripeStatus().effectiveMode,
    results
  });
}

async function validateStripePriceForPlan(stripeClient, plan, priceId) {
  const base = {
    plan: plan.id,
    priceEnv: plan.priceEnv,
    expected: expectedPriceForPlan(plan)
  };

  if (!priceId) {
    return { ...base, ok: false, status: "missing_env" };
  }

  try {
    const price = await stripeClient.prices.retrieve(priceId);
    const actual = {
      active: price.active,
      currency: String(price.currency || "").toLowerCase(),
      unitAmount: price.unit_amount,
      type: price.type
    };

    if (actual.active === false) return { ...base, ok: false, status: "inactive_price", actual };
    if (actual.type !== "one_time") return { ...base, ok: false, status: "not_one_time_price", actual };
    if (actual.currency !== "usd") return { ...base, ok: false, status: "currency_mismatch", actual };
    if (actual.unitAmount !== plan.priceCents) return { ...base, ok: false, status: "amount_mismatch", actual };

    return { ...base, ok: true, status: "valid", actual };
  } catch (error) {
    if (error?.code === "resource_missing") {
      return {
        ...base,
        ok: false,
        status: "not_found_for_current_stripe_mode",
        stripeErrorCode: error.code,
        stripeErrorType: error.type
      };
    }
    return {
      ...base,
      ok: false,
      status: "stripe_price_check_failed",
      stripeErrorCode: error?.code,
      stripeErrorType: error?.type
    };
  }
}

function expectedPriceForPlan(plan) {
  return {
    currency: "usd",
    unitAmount: plan.priceCents,
    type: "one_time"
  };
}

function recordStripePriceCheck(check) {
  lastStripePriceValidation = {
    checkedAt: new Date().toISOString(),
    results: {
      ...lastStripePriceValidation.results,
      [check.priceEnv]: sanitizePriceCheck(check)
    }
  };
}

function sanitizePriceCheck(check) {
  return {
    ok: Boolean(check.ok),
    status: check.status,
    plan: check.plan,
    priceEnv: check.priceEnv,
    expected: check.expected,
    actual: check.actual,
    stripeErrorCode: check.stripeErrorCode,
    stripeErrorType: check.stripeErrorType,
    stripeMode: stripeConfigSummary().effectiveMode
  };
}

async function getSiteSettings() {
  const row = await prisma.setting.findUnique({ where: { key: "site" } }).catch(() => null);
  return sanitizeSettings({ ...defaultSiteSettings, ...(row?.value || {}) });
}

function sanitizeSettings(input) {
  return {
    discordInviteUrl: safeUrl(input.discordInviteUrl),
    supportEmail: String(input.supportEmail || defaultSiteSettings.supportEmail).trim().slice(0, 160),
    brandName: String(input.brandName || defaultSiteSettings.brandName).trim().slice(0, 80),
    maintenanceMode: Boolean(input.maintenanceMode),
    announcementBannerText: String(input.announcementBannerText || "").slice(0, 240),
    announcementBannerEnabled: Boolean(input.announcementBannerEnabled),
    pricingVisible: input.pricingVisible !== false,
    checkoutEnabled: input.checkoutEnabled !== false,
    downloadEnabled: input.downloadEnabled !== false
  };
}

function publicSiteSettings(settings) {
  return {
    discordInviteUrl: settings.discordInviteUrl,
    supportEmail: settings.supportEmail,
    brandName: settings.brandName,
    maintenanceMode: settings.maintenanceMode,
    announcementBannerText: settings.announcementBannerText,
    announcementBannerEnabled: settings.announcementBannerEnabled,
    pricingVisible: settings.pricingVisible,
    checkoutEnabled: settings.checkoutEnabled,
    downloadEnabled: settings.downloadEnabled
  };
}

function safeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function resolveDownloadInfo() {
  const fallbackUrl = absoluteFrontendUrl(env("DOWNLOAD_FALLBACK_URL", `${frontendUrl()}/downloads/`));
  const manifestUrl = env("DOWNLOAD_MANIFEST_URL", `${frontendUrl()}/latest.json`);
  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("manifest_not_found");
    const manifest = await response.json();
    const selected = pickDownloadUrl(manifest);
    return {
      source: "latest_json",
      manifestUrl,
      downloadUrl: selected ? absoluteFrontendUrl(selected) : fallbackUrl,
      version: manifest.version || manifest.latest || manifest.latestVersion || manifest.tag || manifest.name || null,
      fileName: manifest.fileName || manifest.filename || manifest.file || null,
      fileSize: manifest.fileSize || manifest.size || null,
      releaseNotes: manifest.releaseNotes || manifest.notes || manifest.changelog || null,
      manifest
    };
  } catch (error) {
    return {
      source: "fallback",
      manifestUrl,
      downloadUrl: fallbackUrl,
      version: null,
      fileName: null,
      fileSize: null,
      releaseNotes: null,
      manifest: null
    };
  }
}

function pickDownloadUrl(manifest) {
  if (!manifest || typeof manifest !== "object") return "";
  const keys = ["download", "downloadUrl", "download_url", "url", "installer", "file"];
  for (const key of keys) {
    const value = manifest[key];
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const nested = value.url || value.href || value.file || value.path || value.download;
      if (nested) return nested;
    }
  }
  for (const key of ["windows", "win", "latestDownload", "asset", "assets", "files", "downloads"]) {
    const value = manifest[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const item = value.find((entry) => typeof entry === "string" || entry?.url || entry?.href || entry?.file || entry?.path);
      if (typeof item === "string") return item;
      if (item) return item.url || item.href || item.file || item.path;
    }
    if (value && typeof value === "object") {
      const nested = value.url || value.href || value.file || value.path || value.download;
      if (nested) return nested;
    }
  }
  return "";
}

function absoluteFrontendUrl(value) {
  const text = String(value || "").trim();
  if (!text) return `${frontendUrl()}/downloads/`;
  try {
    return new URL(text, `${frontendUrl()}/`).toString();
  } catch {
    return `${frontendUrl()}/downloads/`;
  }
}

function licenseAccessState(license) {
  if (!license) return { valid: false, reason: "invalid_license" };
  if (license.status === "banned") return { valid: false, reason: "banned" };
  if (license.status !== "active") return { valid: false, reason: "inactive" };
  if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, reason: "valid" };
}

async function logDownload(license, licenseKey, result, reason, version = null) {
  await prisma.downloadLog.create({
    data: {
      licenseId: license?.id || null,
      licenseKey,
      result,
      reason,
      version
    }
  }).catch(() => {});
}

async function incrementValidationFailure(license, licenseKey, reason, hwid, appVersion) {
  await prisma.$transaction([
    prisma.license.update({
      where: { id: license.id },
      data: {
        validationCount: { increment: 1 },
        lastValidatedAt: new Date()
      }
    }),
    prisma.validationLog.create({
      data: {
        licenseId: license.id,
        licenseKey,
        result: "failed",
        reason,
        hwidHash: hashHwid(hwid),
        appVersion
      }
    }),
    prisma.analyticsEvent.create({
      data: {
        type: "license_validation_failed",
        plan: license.plan,
        metadata: { reason, appVersion }
      }
    })
  ]);
}

async function logValidation(license, licenseKey, result, reason, hwid, appVersion) {
  await prisma.validationLog.create({
    data: {
      licenseId: license?.id || null,
      licenseKey,
      result,
      reason,
      hwidHash: hashHwid(hwid),
      appVersion
    }
  }).catch(() => {});
}

function hashHwid(hwid) {
  const value = normalizeHwid(hwid);
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function ensureCustomer(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!isValidEmail(normalized)) return null;
  return prisma.customer.upsert({
    where: { email: normalized },
    create: { email: normalized },
    update: {}
  });
}

async function createAnalyticsEvent(type, data = {}) {
  await prisma.analyticsEvent.create({
    data: {
      type,
      plan: data.plan || null,
      amount: data.amount ?? null,
      currency: data.currency || null,
      mode: data.mode || null,
      metadata: data.metadata || null
    }
  }).catch(() => {});
}

async function createAuditLog(action, targetType = null, targetId = null, metadata = null) {
  await prisma.auditLog.create({
    data: { action, targetType, targetId, metadata }
  }).catch(() => {});
}

function sendAdminPage(res) {
  try {
    return res
      .type("html")
      .set("Cache-Control", "no-store")
      .send(adminPage());
  } catch (error) {
    console.error("Admin page render failed", publicError(error));
    return res
      .status(500)
      .type("html")
      .send(loginPage("Admin panel could not render. Check Render logs."));
  }
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function countBy(values) {
  return values.reduce((acc, value) => {
    const key = String(value || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topGroup(values) {
  const counts = countBy(values);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function groupRevenueByDay(orders, days) {
  const today = startOfDay(new Date());
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    buckets.set(day.toISOString().slice(0, 10), { date: day.toISOString().slice(0, 10), revenue: 0, orders: 0 });
  }
  orders.forEach((order) => {
    const key = order.createdAt.toISOString().slice(0, 10);
    const row = buckets.get(key);
    if (!row) return;
    row.revenue += order.amount;
    row.orders += 1;
  });
  return Array.from(buckets.values());
}

function toOptionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
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
          mode: session.livemode ? "live" : "test",
          locale: session.locale || null,
          licenseId: license.id
        },
        update: {
          stripePaymentIntentId: paymentIntentId,
          customerEmail: email,
          status: session.payment_status || "paid",
          mode: session.livemode ? "live" : "test",
          locale: session.locale || null,
          licenseId: license.id
        },
        include: { license: true }
      });

      if (!again) {
        await tx.customer.upsert({
          where: { email },
          create: {
            email,
            totalSpent: order.amount,
            totalOrders: 1,
            firstPurchaseAt: new Date(),
            lastPurchaseAt: new Date()
          },
          update: {
            totalSpent: { increment: order.amount },
            totalOrders: { increment: 1 },
            lastPurchaseAt: new Date()
          }
        });
        await tx.analyticsEvent.create({
          data: {
            type: "checkout_completed",
            plan: plan.id,
            amount: order.amount,
            currency: order.currency,
            mode: order.mode,
            metadata: { priceSource: "stripe_webhook" }
          }
        });
      }

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
