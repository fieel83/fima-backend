import "dotenv/config";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { apiBaseUrl, env, frontendUrl, listEnv, requiredEnv } from "./env.js";
import {
  PLANS,
  PUBLIC_REQUIRED_PRICE_ENVS,
  checkoutModeForPlan,
  getPlan,
  getPlanCommerce,
  getPlanExpiry,
  getPlanPriceOptions,
  isPublicCheckoutPlan,
  planIds,
  productionInlinePriceDataBlocked,
  publicCheckoutPlanIds
} from "./plans.js";
import {
  buildLicenseData,
  generateUniqueLicenseKey,
  licensePayload,
  normalizeHwid,
  normalizeLicenseKey
} from "./license.js";
import { adminPage, loginPage } from "./adminHtml.js";
import { ADMIN_COOKIE_NAME, clearAdminCookie, createAdminToken, isAdminAuthenticated, requireAdmin, setAdminCookie } from "./adminAuth.js";
import { csrfTokenPayload, requireCsrfForCookieMutations } from "./csrf.js";
import { minimumAppVersionStatus } from "./appVersionPolicy.js";
import { runOwnerLifetimeGrantJobOnce } from "./ownerGrantJob.js";
import { runSecurityE2EJobOnce } from "./securityE2EJob.js";
import { buildTrialNotes, getTrialPromoConfig, isPromoTrialLicense, isTrialLicense } from "./trialPromo.js";
import {
  discordBotHealth,
  giveDiscordRole,
  removeDiscordRole,
  sendPasswordResetDm,
  sendPaymentSubmissionLog,
  startDiscordBot
} from "./discordBot.js";
import { assertStripeSecretKeyAllowed, stripeConfigSummary, stripeKeyMode, stripePriceEnvState, stripeSessionPrefix } from "./stripeSafety.js";
import {
  downloadSecretStatus,
  entitlementSecretStatus,
  hashDeviceId,
  issueAppEntitlement,
  productionSecurityReadiness,
  publicEntitlementPayload,
  updateManifestSecretStatus,
  verifyAppEntitlement
} from "./entitlements.js";

const app = express();
const port = Number(env("PORT", "8080"));
const publicDir = path.resolve("public");
const DEFAULT_MIN_SUPPORTED_APP_VERSION = "1.0.128";
const PUBLIC_SETUP_DOWNLOAD_URL = "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.130/FIMA.MACRO.Setup.exe";
const PUBLIC_APP_PACKAGE_URL = "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.130/FIMA.MACRO.App.zip";
const publicProductPlanIds = new Set(publicCheckoutPlanIds());
const stripePriceEnvNames = [
  ...new Set(
    Object.values(PLANS)
      .filter((plan) => publicProductPlanIds.has(plan.id))
      .flatMap((plan) => getPlanPriceOptions(plan).map((option) => option.priceEnv))
  )
];
let lastStripePriceValidation = {
  checkedAt: null,
  results: Object.fromEntries(stripePriceEnvNames.map((name) => [name, { status: "unchecked" }]))
};
const STRIPE_RUNTIME_PRICE_SETTING_KEY = "payment_stripe_prices";
const stripePriceBootstrapLocks = new Map();
let lastEmailDeliveryState = {
  checkedAt: null,
  provider: "none",
  configured: false,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null
};

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const validateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const entitlementRefreshLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const passwordResetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const emailVerificationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const storeCheckoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false });
const oauthLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const manualPaymentLimiter = rateLimit({ windowMs: 30 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const trialLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const giftRecipientSearchLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
const giftRedeemLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const adminGiftLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const adminRuntimeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const referralLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 35, standardHeaders: true, legacyHeaders: false });
const adminFailedLoginState = new Map();
const USER_SESSION_COOKIE = "fima_user_session";
const OAUTH_STATE_COOKIE = "fima_oauth_state";
const OAUTH_PKCE_COOKIE = "fima_oauth_pkce";
const ROBLOX_OAUTH_COOLDOWN_COOKIE = "fima_roblox_oauth_cooldown";
const usedRobloxOAuthStates = new Map();
const MONTHLY_TRIAL_CLEANUP_MS = 15 * 60 * 1000;
const REFERRAL_REWARD_VALID_INVITES = 3;
const REFERRAL_REWARD_DAYS = 15;

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
const DEFAULT_BACKEND_VERSION = "1.0.128";
const backendVersion = env("BACKEND_VERSION", DEFAULT_BACKEND_VERSION);
const legacyAppVersionEnv = env("APP_VERSION", "");
const buildTime = env("BUILD_TIME", new Date().toISOString());
const backendCommit = env("RENDER_GIT_COMMIT", env("GIT_COMMIT", safeGitCommit()));
const runtimeEnvCatalog = [
  ["STRIPE_AGENT_API_KEY", "stripe"],
  ["STRIPE_AGENT_TEST_API_KEY", "stripe"],
  ["STRIPE_TEST_SECRET_KEY", "stripe"],
  ["STRIPE_TEST_PUBLISHABLE_KEY", "stripe"],
  ["STRIPE_SECRET_KEY", "stripe"],
  ["STRIPE_PUBLISHABLE_KEY", "stripe"],
  ["STRIPE_WEBHOOK_SECRET", "stripe"],
  ["STRIPE_PRICE_3DAYS", "stripe"],
  ["STRIPE_PRICE_MONTHLY", "stripe"],
  ["STRIPE_PRICE_LIFETIME", "stripe"],
  ["STRIPE_TEST_PRICE_3DAYS", "stripe"],
  ["STRIPE_TEST_PRICE_MONTHLY", "stripe"],
  ["STRIPE_TEST_PRICE_LIFETIME", "stripe"],
  ["TRIAL_PROMO_ENABLED", "trial"],
  ["TRIAL_PROMO_DAYS", "trial"],
  ["NORMAL_TRIAL_DAYS", "trial"],
  ["TRIAL_PROMO_END_AT", "trial"],
  ["ENTITLEMENT_SIGNING_SECRET", "security"],
  ["DOWNLOAD_SIGNING_SECRET", "security"],
  ["UPDATE_MANIFEST_SIGNING_SECRET", "security"],
  ["ADMIN_SESSION_VERSION", "security"],
  ["ADMIN_SESSION_REVOKED_BEFORE", "security"],
  ["RENDER_API_KEY", "render"],
  ["RENDER_SERVICE_ID", "render"],
  ["RENDER_DEPLOY_HOOK_URL", "render"],
  ["FIMA_RENDER_DEPLOY_HOOK", "render"],
  ["DISCORD_BOT_TOKEN", "discord"],
  ["DISCORD_CLIENT_ID", "discord"],
  ["DISCORD_GUILD_ID", "discord"],
  ["FIMA_ADMIN_API_KEY", "app"],
  ["ADMIN_API_KEY", "app"],
  ["RESEND_API_KEY", "mail"],
  ["SMTP_PASS", "mail"]
];
const requiredRuntimeEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "FIMA_ADMIN_API_KEY",
  "ENTITLEMENT_SIGNING_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID"
];

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "data:"],
      "connect-src": [
        "'self'",
        "https://fimamacro.com",
        "https://www.fimamacro.com",
        "https://api.fimamacro.com",
        "https://github.com",
        "https://api.github.com",
        "https://api.frankfurter.app",
        "https://open.er-api.com",
        "https://get.geojs.io",
        "https://ipapi.co"
      ],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": []
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});
app.use(compression());
app.use(cookieParser());
app.use(cors({
  origin(origin, callback) {
    const allowed = new Set([
      ...listEnv("CORS_ORIGINS", `${frontendUrl()},https://www.fimamacro.com`),
      apiBaseUrl()
    ].filter(Boolean).map((value) => value.replace(/\/+$/, "")));
    const normalizedOrigin = origin ? origin.replace(/\/+$/, "") : "";

    if (!origin || normalizedOrigin === "null" || normalizedOrigin.startsWith("file://") || allowed.has(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    app: env("APP_NAME", "Fima Macro"),
    version: backendVersion,
    commit: backendCommit,
    buildTime,
    mode: env("NODE_ENV", "development"),
    apiBaseUrl: apiBaseUrl(),
    stripe: stripeStatus()
  });
});

app.get("/healthz", (_req, res) => {
  res.status(200).json(versionPayload());
});

app.get("/api/version", (_req, res) => {
  res.status(200).json(versionPayload());
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
      const session = event.data.object;
      fulfillment = isProductCheckoutSession(session)
        ? await fulfillProductCheckoutSession(session)
        : await fulfillCheckoutSession(session);
    } else if (event.type === "invoice.payment_succeeded") {
      fulfillment = await handleSubscriptionInvoicePaid(event.data.object, event.id);
    } else if (event.type === "invoice.payment_failed") {
      fulfillment = await handleSubscriptionInvoiceFailed(event.data.object, event.id);
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      fulfillment = await syncStripeSubscriptionState(event.data.object, event.type);
    }
    await prisma.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        processed: true,
        errorMessage: null,
        relatedOrderId: fulfillment?.order?.id || fulfillment?.id || null,
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
app.use(emergencyAdminSecurityGate);

app.get(["/api/admin/system/env-status", "/admin/api/system/env-status"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  await auditRuntimeAdmin(req, "runtime_env_status");
  const paymentSetup = await buildPaymentSetupStatus();
  return res.json({
    success: true,
    version: versionPayload(),
    trialPromo: runtimeTrialPromoEnvStatus(),
    entitlement: runtimeEntitlementEnvStatus(),
    paymentSetup,
    env: runtimeEnvCatalog.map(([envName, category]) => ({
      envName,
      category,
      set: Boolean(env(envName))
    }))
  });
});

app.post(["/api/admin/backup/export-trial-license-data", "/admin/api/backup/export-trial-license-data"], adminRuntimeLimiter, requireRuntimeAdminKey, async (_req, res) => {
  try {
    const backup = await buildTrialLicenseBackupExport();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="fima-trial-license-backup-${backup.createdAt.replace(/[:.]/g, "-")}.json"`);
    return res.json(backup);
  } catch (error) {
    console.error("Trial/license backup export failed", publicError(error));
    return res.status(500).json({ success: false, error: "backup_export_failed", message: "Trial/license backup export failed." });
  }
});

app.post(["/api/admin/deploy/verify-env", "/admin/api/deploy/verify-env"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  await auditRuntimeAdmin(req, "runtime_verify_env");
  const status = runtimeEnvCatalog.map(([envName, category]) => ({
    envName,
    category,
    set: Boolean(env(envName))
  }));
  const missing = requiredRuntimeEnv.filter((name) => !env(name));
  return res.json({
    success: missing.length === 0,
    version: versionPayload(),
    missing,
    env: status
  });
});

app.get(["/api/admin/stripe/payment-setup-status", "/admin/api/stripe/payment-setup-status"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  await auditRuntimeAdmin(req, "stripe_payment_setup_status");
  const validate = req.query?.validate === "1" || req.query?.validate === "true";
  return res.json(await buildPaymentSetupStatus({ validate }));
});

app.post(["/api/admin/stripe/repair-prices", "/admin/api/stripe/repair-prices"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  try {
    await auditRuntimeAdmin(req, "stripe_price_repair_started");
    const result = await bootstrapRuntimeStripePrices({ source: "runtime_admin_repair" });
    await createAuditLog("stripe_price_repair_completed", "stripe", null, safeStripeBootstrapAudit(result));
    return res.json(publicStripeBootstrapResult(result));
  } catch (error) {
    const details = publicStripeResolverError(error);
    console.error("Stripe price repair failed", details);
    await createAuditLog("stripe_price_repair_failed", "stripe", null, details);
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.code || "stripe_price_repair_failed",
      message: "Stripe price repair could not run.",
      reason: details.code || "stripe_price_repair_failed"
    });
  }
});

app.post(["/api/admin/stripe/setup-products", "/admin/api/stripe/setup-products"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  try {
    await auditRuntimeAdmin(req, "stripe_setup_products_started");
    const result = await setupStripeProducts({
      mode: "live",
      keyNames: ["STRIPE_AGENT_API_KEY", "STRIPE_SECRET_KEY"],
      envMap: {
        "3days": "STRIPE_PRICE_3DAYS",
        monthly: "STRIPE_PRICE_MONTHLY",
        lifetime: "STRIPE_PRICE_LIFETIME"
      },
      updateRenderEnv: req.body?.updateRenderEnv === true,
      persistRuntimeConfig: true
    });
    await createAuditLog("stripe_setup_products_completed", "stripe", null, safeStripeSetupAudit(result));
    return res.json(publicStripeSetupProductsResult(result));
  } catch (error) {
    console.error("Stripe live setup failed", publicError(error));
    await createAuditLog("stripe_setup_products_failed", "stripe", null, publicError(error));
    return res.status(error.statusCode || 500).json({ success: false, error: error.code || "stripe_setup_failed", message: error.message });
  }
});

app.post(["/api/admin/stripe/setup-test-products", "/admin/api/stripe/setup-test-products"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  try {
    await auditRuntimeAdmin(req, "stripe_setup_test_products_started");
    const result = await setupStripeProducts({
      mode: "test",
      keyNames: ["STRIPE_AGENT_TEST_API_KEY", "STRIPE_TEST_SECRET_KEY"],
      envMap: {
        "3days": "STRIPE_TEST_PRICE_3DAYS",
        monthly: "STRIPE_TEST_PRICE_MONTHLY",
        lifetime: "STRIPE_TEST_PRICE_LIFETIME"
      },
      updateRenderEnv: req.body?.updateRenderEnv === true,
      persistRuntimeConfig: false
    });
    await createAuditLog("stripe_setup_test_products_completed", "stripe", null, safeStripeSetupAudit(result));
    return res.json(publicStripeSetupProductsResult(result));
  } catch (error) {
    console.error("Stripe test setup failed", publicError(error));
    await createAuditLog("stripe_setup_test_products_failed", "stripe", null, publicError(error));
    return res.status(error.statusCode || 500).json({ success: false, error: error.code || "stripe_test_setup_failed", message: error.message });
  }
});

app.post(["/api/admin/stripe/test-clock-e2e", "/admin/api/stripe/test-clock-e2e"], adminRuntimeLimiter, requireRuntimeAdminKey, async (req, res) => {
  try {
    await auditRuntimeAdmin(req, "stripe_test_clock_e2e_started");
    const result = await runStripeTestClockE2E();
    await createAuditLog("stripe_test_clock_e2e_completed", "stripe", null, {
      testClockId: result.testClockId,
      customerId: result.customerId,
      subscriptionId: result.subscriptionId,
      statuses: result.statuses
    });
    return res.json(result);
  } catch (error) {
    console.error("Stripe Test Clock E2E failed", publicError(error));
    await createAuditLog("stripe_test_clock_e2e_failed", "stripe", null, publicError(error));
    return res.status(error.statusCode || 500).json({ success: false, error: error.code || "stripe_test_clock_failed", message: error.message });
  }
});

app.get("/admin/api/csrf-token", requireAdmin, (req, res) => {
  const session = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!session) return res.status(400).json({ success: false, error: "csrf_cookie_session_required" });
  res.setHeader("Cache-Control", "no-store");
  return res.json(csrfTokenPayload("admin", session));
});

app.get("/api/csrf-token", async (req, res) => {
  const session = req.cookies?.[USER_SESSION_COOKIE];
  if (!session) return res.status(401).json({ success: false, error: "csrf_session_required" });
  res.setHeader("Cache-Control", "no-store");
  return res.json(csrfTokenPayload("user", session));
});

app.use(requireCsrfForCookieMutations({
  adminCookieName: ADMIN_COOKIE_NAME,
  userCookieName: USER_SESSION_COOKIE
}));

app.get("/api/public/site-settings", async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({ success: true, settings: publicSiteSettings(settings) });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const usernameOnly = Boolean(req.body?.usernameOnly || req.body?.mode === "username" || req.body?.registerMode === "username");
    const requestedUsername = normalizeUsername(req.body?.username);
    const email = usernameOnly ? syntheticEmailForUsername(requestedUsername) : normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const referralCode = normalizeReferralCode(req.body?.referralCode);
    if (usernameOnly && !requestedUsername) return res.status(400).json({ error: "invalid_username" });
    const emailCheck = usernameOnly ? { valid: true, mxVerified: false } : await validateSignupEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });
    if (!isStrongPassword(password)) return res.status(400).json({ error: "weak_password" });

    const emailNormalized = normalizeAccountEmail(email);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { emailNormalized }] }
    });
    if (existing) return res.status(409).json({ error: "email_already_registered" });

    const wantsRobloxProfile = String(req.body?.robloxUsername || "").trim().length > 0;
    const robloxUsername = normalizeRobloxUsername(req.body?.robloxUsername);
    if (wantsRobloxProfile && !robloxUsername) return res.status(400).json({ error: "invalid_roblox_username" });
    const stripeCustomerId = await createStripeCustomerIfPossible(email);
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized,
        passwordHash: await hashPassword(password),
        stripeCustomerId,
        robloxUsername: robloxUsername || null,
        robloxUserId: null,
        robloxAvatarUrl: null,
        emailVerifiedAt: null
      }
    });
    const createdReferralCode = await ensureReferralCodeForUser(user);
    if (!usernameOnly) {
      await createAndSendEmailVerification(user).catch((error) => {
        console.warn("Email verification send failed", { email: maskEmail(user.email), ...publicError(error) });
      });
    }
    let referral = null;
    if (referralCode) {
      referral = await applyReferralCodeToUser({
        code: referralCode,
        referredUserId: user.id,
        req,
        softFail: true
      });
    }
    await ensureCustomer(email);
    await createAuditLog("user_registered", "user", user.id, {
      email,
      emailDomainChecked: emailCheck.mxVerified,
      robloxLinked: false,
      usernameOnly,
      username: usernameOnly ? requestedUsername : null,
      referralCode: referralCode || null,
      ownReferralCode: createdReferralCode.code
    });
    await issueUserSession(res, user.id);
    return res.status(201).json({
      success: true,
      user: publicUser(user),
      referral,
      warning: usernameOnly ? "Without a linked email, password recovery is not possible. Link an email later in Account Settings." : null
    });
  } catch (error) {
    console.error("User registration failed", publicError(error));
    return res.status(500).json({ error: "registration_failed" });
  }
});

app.post("/api/auth/roblox-preview", authLimiter, async (req, res) => {
  return res.status(410).json({
    success: false,
    error: "roblox_lookup_removed",
    message: "Roblox username is optional profile metadata only."
  });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const login = String(req.body?.email || req.body?.login || req.body?.username || "").trim();
    const email = login.includes("@") ? normalizeEmail(login) : syntheticEmailForUsername(login);
    const password = String(req.body?.password || "");
    const emailNormalized = normalizeAccountEmail(email);
    const user = await prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized }] } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await createAuditLog("user_login_failed", "user", null, { email });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const hydrated = await ensureUserStripeCustomer(user);
    await issueUserSession(res, hydrated.id);
    await createAuditLog("user_login_success", "user", hydrated.id, {});
    return res.json({ success: true, user: publicUser(hydrated) });
  } catch (error) {
    console.error("User login failed", publicError(error));
    return res.status(500).json({ error: "login_failed" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const tokenHash = hashToken(req.cookies?.[USER_SESSION_COOKIE]);
  if (tokenHash) {
    await prisma.userSession.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  clearUserCookie(res);
  return res.json({ success: true });
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  return res.json({ success: true, user: publicUser(req.user) });
});

app.get("/auth/discord/start", oauthLimiter, async (req, res) => {
  try {
    const currentUser = await getOptionalUser(req, res);
    const state = createOAuthState("discord", {
      userId: currentUser?.id || null,
      returnTo: safeFrontendPath(req.query?.returnTo, "/dashboard/overview")
    });
    setOAuthCookie(res, OAUTH_STATE_COOKIE, state);

    const redirectUri = env("DISCORD_REDIRECT_URI", `${apiBaseUrl()}/auth/discord/callback`);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", requiredEnv("DISCORD_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify email");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  } catch (error) {
    console.error("Discord OAuth start failed", publicError(error));
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}/login?error=discord_oauth_unavailable`);
  }
});

app.get("/auth/discord/callback", oauthLimiter, async (req, res) => {
  try {
    const state = verifyOAuthState(req.query?.state, req.cookies?.[OAUTH_STATE_COOKIE], "discord");
    const code = String(req.query?.code || "").trim();
    if (!code) throw new Error("missing_discord_code");

    const token = await exchangeDiscordCode(code);
    const profile = await fetchDiscordProfile(token.access_token);
    const linked = await loginOrLinkDiscordAccount(profile, token, state.userId);
    await evaluateReferralForUser(linked.user.id).catch((error) => {
      console.warn("Referral evaluation after Discord link failed", { userId: linked.user.id, ...publicError(error) });
    });
    await issueUserSession(res, linked.user.id);
    await createAuditLog(state.userId ? "discord_account_linked" : "discord_login_success", "user", linked.user.id, {
      discordUserId: profile.id,
      created: linked.created
    });
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}${state.returnTo || "/dashboard/overview"}?discord=connected`);
  } catch (error) {
    console.error("Discord OAuth callback failed", publicError(error));
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}/login?error=discord_oauth_failed`);
  }
});

app.get("/auth/roblox/start", oauthLimiter, requireUser, async (req, res) => {
  clearOAuthCookies(res);
  return res.redirect(`${frontendUrl()}/dashboard/security?error=roblox_oauth_removed`);
});

app.get("/auth/roblox/callback", oauthLimiter, async (req, res) => {
  clearOAuthCookies(res);
  return res.redirect(`${frontendUrl()}/dashboard/security?error=roblox_oauth_removed`);
});

app.post("/auth/roblox/finish", oauthLimiter, async (req, res) => {
  clearOAuthCookies(res);
  return res.status(410).json({
    success: false,
    error: "roblox_oauth_removed",
    redirectUrl: `${frontendUrl()}/dashboard/security?error=roblox_oauth_removed`
  });
});

app.post("/payments/robux/manual/submit", manualPaymentLimiter, requireUser, async (req, res) => {
  try {
    const submission = await createManualRobuxSubmission(req.user, req.body || {});
    await sendPaymentSubmissionLog(submission).catch((error) => {
      console.warn("Discord payment log send failed", publicError(error));
    });
    return res.status(201).json({ success: true, submission: publicPaymentSubmission(submission) });
  } catch (error) {
    console.error("Manual Robux submission failed", publicError(error));
    return res.status(error.statusCode || 500).json({ error: error.code || "manual_payment_submit_failed" });
  }
});

app.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  const login = String(req.body?.login || req.body?.username || req.body?.email || "").trim();
  try {
    if (!login) return res.status(400).json({ error: "invalid_recovery_login" });
    const loginEmail = login.includes("@") ? normalizeEmail(login) : syntheticEmailForUsername(login);
    const loginEmailNormalized = normalizeAccountEmail(loginEmail);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginEmail },
          { emailNormalized: loginEmailNormalized }
        ]
      }
    });

    if (!user) {
      return res.json({
        success: true,
        method: "discord",
        message: "If that Fima account has linked Discord recovery, the bot will DM a reset code."
      });
    }

    if (!user.discordUserId) {
      await createAuditLog("password_reset_discord_unavailable", "user", user.id, {
        requestedBy: "forgot_password_page",
        reason: "discord_not_linked"
      });
      return res.status(400).json({
        error: "discord_not_linked",
        message: "This account has no linked Discord recovery. Contact support so an admin can verify ownership."
      });
    }

    const result = await createDiscordPasswordResetForUser(user, "password_reset_discord_sent", {
      requestedBy: "forgot_password_page"
    });
    const response = {
      success: true,
      method: "discord",
      message: "A reset code was sent to your linked Discord DM."
    };
    if (env("NODE_ENV", "development") !== "production") {
      response.resetUrl = result.resetUrl;
    }
    return res.json(response);
  } catch (error) {
    console.error("Discord password reset request failed", publicError(error));
    const code = ["discord_dm_blocked", "discord_bot_not_ready", "discord_user_not_found", "discord_user_not_linked"].includes(error.code)
      ? error.code
      : "discord_recovery_failed";
    const messages = {
      discord_dm_blocked: "The Fima bot could not DM you. Enable DMs from server members or use the Discord server recovery command.",
      discord_bot_not_ready: "Discord recovery is temporarily unavailable because the Fima bot is not online.",
      discord_user_not_found: "The linked Discord user could not be found. Re-link Discord or contact support.",
      discord_user_not_linked: "This account has no linked Discord recovery. Contact support so an admin can verify ownership.",
      discord_recovery_failed: "Discord recovery could not be prepared right now."
    };
    return res.status(code === "discord_dm_blocked" ? 403 : 503).json({
      error: code,
      message: messages[code] || messages.discord_recovery_failed,
      bot: await discordBotHealth().catch(() => undefined)
    });
  }
});

app.post("/api/auth/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token || !isStrongPassword(password)) return res.status(400).json({ error: "invalid_reset_request" });

    const tokenHash = hashToken(token);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hashPassword(password) }
      }),
      prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() }
      }),
      prisma.userSession.deleteMany({ where: { userId: reset.userId } })
    ]);
    await createAuditLog("password_reset_completed", "user", reset.userId, {});
    clearUserCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error("Password reset failed", publicError(error));
    return res.status(500).json({ error: "password_reset_failed" });
  }
});

app.post("/api/auth/email-verification/send", emailVerificationLimiter, requireUser, async (req, res) => {
  try {
    if (req.user.emailVerifiedAt) return res.json({ success: true, verified: true });
    await createAndSendEmailVerification(req.user);
    await createAuditLog("email_verification_requested", "user", req.user.id, {});
    return res.json({ success: true, message: "If email delivery is configured, a verification code has been sent." });
  } catch (error) {
    console.error("Email verification send failed", publicError(error));
    return res.status(500).json({ error: "email_verification_send_failed" });
  }
});

app.post("/api/auth/email-link/start", emailVerificationLimiter, requireUser, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const emailCheck = await validateSignupEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });
    const emailNormalized = normalizeAccountEmail(email);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { emailNormalized }],
        NOT: { id: req.user.id }
      }
    });
    if (existing) return res.status(409).json({ error: "email_already_registered" });

    await createAndSendEmailVerification(req.user, email);
    await createAuditLog("email_link_requested", "user", req.user.id, { email: maskEmail(email) });
    return res.json({
      success: true,
      pendingEmail: maskEmail(email),
      message: "Verification code sent. Enter the code to link this email."
    });
  } catch (error) {
    console.error("Email link start failed", publicError(error));
    return res.status(error.code === "email_delivery_failed" || error.code === "email_not_configured" ? 503 : 500).json({
      error: error.code === "email_delivery_failed" || error.code === "email_not_configured" ? "email_delivery_failed" : "email_link_failed",
      message: "Email could not be sent. Please try again later or contact support.",
      lastEmailDelivery: lastEmailDeliveryState
    });
  }
});

app.post("/api/auth/email-verification/confirm", emailVerificationLimiter, requireUser, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "invalid_verification_code" });
    const tokenHash = hashToken(code);
    const token = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.userId !== req.user.id || token.usedAt || token.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "invalid_or_expired_verification_code" });
    }
    const user = await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      const pendingEmail = token.email;
      const data = { emailVerifiedAt: new Date() };
      if (pendingEmail && isValidEmail(pendingEmail)) {
        data.email = normalizeEmail(pendingEmail);
        data.emailNormalized = normalizeAccountEmail(pendingEmail);
      }
      return tx.user.update({ where: { id: req.user.id }, data });
    });
    await evaluateReferralForUser(user.id).catch((error) => {
      console.warn("Referral evaluation after email verification failed", { userId: user.id, ...publicError(error) });
    });
    await createAuditLog("email_verified", "user", user.id, {});
    return res.json({
      success: true,
      user: publicUser(user),
      referrals: await buildReferralSummary(user.id, { evaluate: true })
    });
  } catch (error) {
    console.error("Email verification confirm failed", publicError(error));
    return res.status(500).json({ error: "email_verification_failed" });
  }
});

app.get("/api/store/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    include: { prices: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 } }
  });
  return res.json({ success: true, products: products.map(publicProduct) });
});

app.post("/api/store/checkout", storeCheckoutLimiter, requireUser, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode || settings.checkoutEnabled === false) {
      return res.status(503).json({ error: "checkout_disabled" });
    }

    const productId = String(req.body?.productId || "").trim();
    const product = await prisma.product.findFirst({
      where: { id: productId, active: true },
      include: { prices: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!product || !product.prices[0]) return res.status(404).json({ error: "product_not_available" });

    const user = await ensureUserStripeCustomer(req.user);
    const session = await createProductCheckoutSession({ user, product, price: product.prices[0] });
    await createAnalyticsEvent("product_checkout_created", {
      amount: product.prices[0].amount,
      currency: product.prices[0].currency,
      mode: session.livemode ? "live" : "test",
      metadata: { productId: product.id }
    });
    return res.json({ success: true, url: session.url, mode: session.livemode ? "live" : "test", checkoutSessionPrefix: stripeSessionPrefix(session.id) });
  } catch (error) {
    console.error("Product checkout failed", publicError(error));
    await createAnalyticsEvent("product_checkout_failed", { metadata: publicError(error) });
    return res.status(500).json({ error: "checkout_failed" });
  }
});

app.get(["/api/me/products", "/api/account/products"], requireUser, async (req, res) => {
  const [[purchases, licenses], pendingGifts, purchasedGiftCodes] = await Promise.all([
    getAccountAccess(req.user),
    getPendingGiftPackagesForUser(req.user),
    getPurchasedGiftCodesForUser(req.user)
  ]);
  return res.json({
    success: true,
    user: publicUser(req.user),
    integrations: await buildIntegrationSummary(req.user),
    purchases: purchases.map(publicPurchase),
    licenses: licenses.map(publicLicense),
    pendingGifts: pendingGifts.map(publicDirectGiftPackage),
    purchasedGiftCodes: purchasedGiftCodes.map((row) => publicPurchasedGiftCode(row, true)),
    giftHistory: purchasedGiftCodes
      .filter((row) => row.usedCount > 0 || row.status === "redeemed")
      .map((row) => publicPurchasedGiftCode(row, false)),
    products: buildAccountProducts(purchases, licenses)
  });
});

app.get("/api/store/result", requireUser, async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId.startsWith("cs_")) return res.status(400).json({ success: false, status: "invalid_session" });

    let purchase = await prisma.purchase.findFirst({
      where: { stripeCheckoutSessionId: sessionId, userId: req.user.id },
      include: { product: { include: { prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } } } } }
    });

    if (!purchase) {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" && String(session.metadata?.user_id) === req.user.id) {
        await fulfillProductCheckoutSession(session);
        purchase = await prisma.purchase.findFirst({
          where: { stripeCheckoutSessionId: sessionId, userId: req.user.id },
          include: { product: { include: { prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } } } } }
        });
      }
    }

    if (!purchase) return res.json({ success: false, status: "processing" });
    return res.json({ success: true, status: purchase.status, purchase: publicPurchase(purchase) });
  } catch (error) {
    console.error("Store result failed", publicError(error));
    return res.status(500).json({ success: false, status: "error" });
  }
});

app.get("/api/me/dashboard", requireUser, async (req, res) => {
  const integrations = await buildIntegrationSummary(req.user);
  const [access, trial, referrals, pendingGifts, purchasedGiftCodes] = await Promise.all([
    getAccountAccess(req.user),
    buildMonthlyTrialSummary(req.user, new Date(), integrations),
    buildReferralSummary(req.user.id, { evaluate: true }),
    getPendingGiftPackagesForUser(req.user),
    getPurchasedGiftCodesForUser(req.user)
  ]);
  const [purchases, licenses] = access;
  return res.json({
    success: true,
    user: publicUser(req.user),
    integrations,
    trial,
    referrals,
    purchases: purchases.map(publicPurchase),
    licenses: licenses.map(publicLicense),
    pendingGifts: pendingGifts.map(publicDirectGiftPackage),
    purchasedGiftCodes: purchasedGiftCodes.map((row) => publicPurchasedGiftCode(row, true)),
    giftHistory: purchasedGiftCodes
      .flatMap((row) => (row.redemptions || []).map((redemption) => ({
        type: "gift_code_redeemed",
        giftCode: publicPurchasedGiftCode(row, false),
        license: redemption.license ? publicLicense(redemption.license) : null,
        redeemedAt: redemption.createdAt ? redemption.createdAt.toISOString() : null
      }))),
    products: buildAccountProducts(purchases, licenses)
  });
});

app.get("/api/me/integrations", requireUser, async (req, res) => {
  const integrations = await buildIntegrationSummary(req.user);
  return res.json({
    success: true,
    integrations,
    trial: await buildMonthlyTrialSummary(req.user, new Date(), integrations)
  });
});

app.post("/api/me/profile", requireUser, async (req, res) => {
  try {
    const rawRobloxUsername = String(req.body?.robloxUsername || "").trim();
    const robloxUsername = normalizeRobloxUsername(rawRobloxUsername);
    if (rawRobloxUsername && !robloxUsername) {
      return res.status(400).json({ success: false, error: "invalid_roblox_username" });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        robloxUsername: robloxUsername || null,
        robloxUserId: null,
        robloxAvatarUrl: null
      }
    });
    await createAuditLog("profile_roblox_username_updated", "user", user.id, {
      hasRobloxUsername: Boolean(robloxUsername),
      proof: "manual_profile_only"
    });
    const integrations = await buildIntegrationSummary(user);
    return res.json({ success: true, user: publicUser(user), integrations });
  } catch (error) {
    console.error("Profile update failed", publicError(error));
    return res.status(500).json({ success: false, error: "profile_update_failed" });
  }
});

app.get("/api/trial-promo", async (req, res) => {
  const promo = getTrialPromoConfig(process.env, new Date());
  return res.json({
    success: true,
    promo: {
      active: promo.active,
      enabled: promo.enabled,
      campaign: promo.campaign,
      source: promo.source,
      days: promo.currentTrialDays,
      promoDays: promo.promoDays,
      normalDays: promo.normalDays,
      endAt: promo.endAtIso,
      label: promo.active ? `${promo.promoDays}-Day Free Trial` : `${promo.normalDays}-Day Free Trial`
    }
  });
});

app.get(["/users/search-gift-recipient", "/api/users/search-gift-recipient"], giftRecipientSearchLimiter, requireUser, async (req, res) => {
  try {
    const query = String(req.query?.q || "").trim();
    const results = await searchGiftRecipients(query, req.user.id);
    return res.json({ success: true, results });
  } catch (error) {
    console.error("Gift recipient search failed", publicError(error));
    return res.status(500).json({ error: "gift_recipient_search_failed" });
  }
});

app.get("/api/gifts/pending", requireUser, async (req, res) => {
  try {
    const packages = await getPendingGiftPackagesForUser(req.user);
    return res.json({ success: true, packages: packages.map(publicDirectGiftPackage) });
  } catch (error) {
    console.error("Pending gifts failed", publicError(error));
    return res.status(500).json({ error: "pending_gifts_failed" });
  }
});

app.get("/api/gifts/purchased", requireUser, async (req, res) => {
  try {
    const giftCodes = await getPurchasedGiftCodesForUser(req.user);
    return res.json({ success: true, giftCodes: giftCodes.map((row) => publicPurchasedGiftCode(row, true)) });
  } catch (error) {
    console.error("Purchased gift codes failed", publicError(error));
    return res.status(500).json({ error: "purchased_gift_codes_failed" });
  }
});

app.post("/api/gifts/redeem", giftRedeemLimiter, requireUser, async (req, res) => {
  try {
    const result = await redeemGiftCodeForUser({
      user: req.user,
      code: req.body?.code,
      hwid: req.body?.hwid
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.warn("Gift code redeem failed", { userId: req.user?.id, code: error.code || "redeem_failed", message: error.message });
    return res.status(error.statusCode || 400).json({
      success: false,
      error: error.code || "gift_redeem_failed",
      message: giftErrorMessage(error.code || "gift_redeem_failed")
    });
  }
});

app.post("/api/gifts/claim-direct", giftRedeemLimiter, requireUser, async (req, res) => {
  try {
    const result = await claimDirectGiftPackageForUser({
      user: req.user,
      packageId: req.body?.packageId || req.body?.id,
      hwid: req.body?.hwid
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.warn("Direct gift claim failed", { userId: req.user?.id, code: error.code || "direct_claim_failed", message: error.message });
    return res.status(error.statusCode || 400).json({
      success: false,
      error: error.code || "direct_gift_claim_failed",
      message: giftErrorMessage(error.code || "direct_gift_claim_failed")
    });
  }
});

app.get("/api/referrals/me", referralLimiter, requireUser, async (req, res) => {
  try {
    return res.json({ success: true, referrals: await buildReferralSummary(req.user.id, { evaluate: true }) });
  } catch (error) {
    console.error("Referral summary failed", publicError(error));
    return res.status(500).json({ error: "referral_summary_failed" });
  }
});

app.post("/api/referrals/apply", referralLimiter, requireUser, async (req, res) => {
  try {
    const result = await applyReferralCodeToUser({
      code: req.body?.code,
      referredUserId: req.user.id,
      req,
      softFail: false
    });
    return res.status(result.applied ? 201 : 200).json({
      success: Boolean(result.applied),
      referral: result,
      referrals: await buildReferralSummary(req.user.id, { evaluate: true })
    });
  } catch (error) {
    console.error("Referral apply failed", publicError(error));
    return res.status(error.statusCode || 500).json({ error: error.code || "referral_apply_failed" });
  }
});

app.post(["/auth/discord/disconnect", "/api/auth/discord/disconnect"], requireUser, async (req, res) => {
  const previousDiscordUserId = req.user.discordUserId;
  try {
    const activeTrial = await findActiveMonthlyTrial(req.user);
    if (previousDiscordUserId && activeTrial) {
      removeDiscordRole(previousDiscordUserId, "trial").catch((error) => {
        console.warn("Discord trial role removal after disconnect failed", publicError(error));
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.oAuthLink.deleteMany({ where: { userId: req.user.id, provider: "discord" } });
      return tx.user.update({
        where: { id: req.user.id },
        data: {
          discordUserId: null,
          discordUsername: null,
          discordEmail: null,
          discordAvatarUrl: null
        }
      });
    });
    await createAuditLog("discord_account_disconnected", "user", user.id, { previousDiscordUserId });
    return res.json({
      success: true,
      user: publicUser(user),
      integrations: await buildIntegrationSummary(user),
      trial: await buildMonthlyTrialSummary(user)
    });
  } catch (error) {
    console.error("Discord disconnect failed", publicError(error));
    return res.status(500).json({ error: "discord_disconnect_failed" });
  }
});

app.post(["/auth/roblox/disconnect", "/api/auth/roblox/disconnect"], requireUser, async (req, res) => {
  const previousRobloxUserId = req.user.robloxUserId;
  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.oAuthLink.deleteMany({ where: { userId: req.user.id, provider: "roblox" } });
      return tx.user.update({
        where: { id: req.user.id },
        data: {
          robloxUserId: null,
          robloxUsername: null,
          robloxAvatarUrl: null
        }
      });
    });
    await createAuditLog("roblox_account_disconnected", "user", user.id, { previousRobloxUserId });
    return res.json({
      success: true,
      user: publicUser(user),
      integrations: await buildIntegrationSummary(user),
      trial: await buildMonthlyTrialSummary(user)
    });
  } catch (error) {
    console.error("Roblox disconnect failed", publicError(error));
    return res.status(500).json({ error: "roblox_disconnect_failed" });
  }
});

app.post(["/trial/monthly/claim", "/api/trial/monthly/claim"], trialLimiter, async (req, res) => {
  const user = await getOptionalUser(req, res);
  if (!user) return res.status(401).json({ error: "not_logged_in" });

  try {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!freshUser) return res.status(401).json({ error: "not_logged_in" });
    const integrations = await buildIntegrationSummary(freshUser);
    if (!integrations.discord.connected) return res.status(403).json({ error: "discord_not_connected" });

    const now = new Date();
    const promo = getTrialPromoConfig(process.env, now);
    const activeTrial = await findActiveMonthlyTrial(freshUser, now);
    if (activeTrial) {
      if (promo.active && !isPromoTrialLicense(activeTrial)) {
        const promotedExpiresAt = new Date(now.getTime() + promo.ms);
        const updated = await prisma.license.update({
          where: { id: activeTrial.id },
          data: {
            expiresAt: activeTrial.expiresAt && activeTrial.expiresAt > promotedExpiresAt ? activeTrial.expiresAt : promotedExpiresAt,
            notes: `${activeTrial.notes || "monthly_trial"} ${promo.source} campaign:${promo.campaign} resetReason:Beta trial/HWID/download issue compensation`
          }
        });
        await prisma.auditLog.create({
          data: {
            action: "trial_promo_existing_trial_extended",
            targetType: "license",
            targetId: updated.id,
            metadata: { userId: freshUser.id, campaign: promo.campaign, expiresAt: updated.expiresAt?.toISOString?.() || null }
          }
        }).catch(() => {});
        return res.status(201).json({
          success: true,
          license: publicLicense(updated),
          trial: await buildMonthlyTrialSummary(freshUser, now, integrations),
          promo: publicTrialPromo(promo),
          extendedExistingTrial: true
        });
      }
      return res.status(409).json({
        error: "trial_already_active",
        trial: await buildMonthlyTrialSummary(freshUser, now, integrations),
        promo: publicTrialPromo(promo)
      });
    }
    const promoAlreadyClaimed = promo.active ? await findPromoTrial(freshUser) : null;
    if (promoAlreadyClaimed) {
      return res.status(409).json({
        error: "trial_already_claimed",
        trial: await buildMonthlyTrialSummary(freshUser, now, integrations),
        promo: publicTrialPromo(promo)
      });
    }
    if (!promo.active && freshUser.nextTrialAvailableAt && freshUser.nextTrialAvailableAt > now) {
      return res.status(429).json({
        error: "trial_cooldown_active",
        nextTrialAvailableAt: freshUser.nextTrialAvailableAt.toISOString(),
        trial: await buildMonthlyTrialSummary(freshUser, now, integrations)
      });
    }

    const plan = getPlan("1day");
    if (!plan) return res.status(500).json({ error: "trial_plan_missing" });
    const expiresAt = new Date(now.getTime() + promo.ms);
    const nextTrialAvailableAt = addCalendarMonth(now);
    const { license, updatedUser } = await prisma.$transaction(async (tx) => {
      const licenseKey = await generateUniqueLicenseKey(tx);
      const createdLicense = await tx.license.create({
        data: {
          licenseKey,
          customerEmail: freshUser.email,
          plan: plan.id,
          status: "active",
          hwid: null,
          expiresAt,
          lifetime: false,
          notes: buildTrialNotes({ user: freshUser, promoConfig: promo })
        }
      });
      const nextUser = await tx.user.update({
        where: { id: freshUser.id },
        data: {
          trialUsedAt: now,
          trialExpiresAt: expiresAt,
          nextTrialAvailableAt: promo.active ? null : nextTrialAvailableAt,
          trialStatus: promo.active ? "promo_active" : "active",
          monthlyTrialClaimCount: { increment: 1 }
        }
      });
      await tx.analyticsEvent.create({
        data: {
          type: promo.active ? "trial_promo_claimed" : "monthly_trial_claimed",
          plan: plan.id,
          amount: 0,
          currency: "eur",
          mode: "trial",
          metadata: { userId: freshUser.id, discordUserId: freshUser.discordUserId, robloxUserId: freshUser.robloxUserId, campaign: promo.active ? promo.campaign : null, trialDays: promo.currentTrialDays }
        }
      });
      await tx.auditLog.create({
        data: {
          action: promo.active ? "trial_promo_claimed" : "monthly_trial_claimed",
          targetType: "license",
          targetId: createdLicense.id,
          metadata: { userId: freshUser.id, expiresAt: expiresAt.toISOString(), nextTrialAvailableAt: promo.active ? null : nextTrialAvailableAt.toISOString(), campaign: promo.active ? promo.campaign : null, source: promo.active ? promo.source : "monthly_trial" }
        }
      });
      return { license: createdLicense, updatedUser: nextUser };
    });

    const discordRole = await giveDiscordRole(freshUser.discordUserId, "trial").catch((error) => ({
      success: false,
      error: error.code || error.message
    }));
    if (discordRole?.success === false) {
      console.warn("Discord Trial role grant failed after monthly trial claim", { userId: freshUser.id, error: discordRole.error });
    }

    return res.status(201).json({
      success: true,
      license: publicLicense(license),
      trial: await buildMonthlyTrialSummary(updatedUser, new Date(), integrations),
      promo: publicTrialPromo(promo),
      discordRole
    });
  } catch (error) {
    console.error("Monthly trial claim failed", publicError(error));
    return res.status(500).json({ error: "trial_claim_failed" });
  }
});

app.post("/api/me/license-records/:licenseId/extend-checkout", storeCheckoutLimiter, requireUser, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode || settings.checkoutEnabled === false) {
      return res.status(503).json({ error: "checkout_disabled" });
    }

    const license = await findOwnedLicenseById(req.user, req.params.licenseId);
    if (!license) return res.status(404).json({ error: "license_not_found" });
    if (license.status === "banned") return res.status(403).json({ error: "license_banned" });

    const plan = getPlan(req.body?.plan || license.plan);
    if (!plan) return res.status(400).json({ error: "invalid_plan" });

    const commerce = getPlanCommerce(plan);
    const checkout = await createCheckoutSession({
      plan,
      commerce,
      customerEmail: req.user.email,
      priceId: env(commerce.priceEnv),
      selectedCurrency: String(req.body?.currency || commerce.currency).toUpperCase(),
      language: String(req.body?.language || "en").slice(0, 8),
      extraMetadata: {
        checkoutType: "license_extension",
        extendLicenseKey: license.licenseKey,
        userId: req.user.id
      }
    });

    await createAnalyticsEvent("license_extension_checkout_created", {
      plan: plan.id,
      amount: commerce.priceCents,
      currency: commerce.currency,
      mode: checkout.session.livemode ? "live" : "test",
      metadata: { licenseKeyMasked: maskCode(license.licenseKey), priceSource: checkout.priceSource }
    });

    return res.json({
      success: true,
      url: checkout.session.url,
      mode: checkout.session.livemode ? "live" : "test",
      checkoutSessionPrefix: stripeSessionPrefix(checkout.session.id),
      priceSource: checkout.priceSource
    });
  } catch (error) {
    console.error("License extension checkout failed", publicError(error));
    return res.status(500).json({ error: "checkout_failed" });
  }
});

app.post("/api/me/licenses/:licenseKey/extend-checkout", storeCheckoutLimiter, requireUser, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode || settings.checkoutEnabled === false) {
      return res.status(503).json({ error: "checkout_disabled" });
    }

    const licenseKey = normalizeLicenseKey(req.params.licenseKey || req.body?.licenseKey);
    const license = await prisma.license.findFirst({
      where: { licenseKey, customerEmail: req.user.email }
    });
    if (!license) return res.status(404).json({ error: "license_not_found" });
    if (license.status === "banned") return res.status(403).json({ error: "license_banned" });

    const plan = getPlan(req.body?.plan || license.plan);
    if (!plan) return res.status(400).json({ error: "invalid_plan" });

    const commerce = getPlanCommerce(plan);
    const checkout = await createCheckoutSession({
      plan,
      commerce,
      customerEmail: req.user.email,
      priceId: env(commerce.priceEnv),
      selectedCurrency: String(req.body?.currency || commerce.currency).toUpperCase(),
      language: String(req.body?.language || "en").slice(0, 8),
      extraMetadata: {
        checkoutType: "license_extension",
        extendLicenseKey: license.licenseKey,
        userId: req.user.id
      }
    });

    await createAnalyticsEvent("license_extension_checkout_created", {
      plan: plan.id,
      amount: commerce.priceCents,
      currency: commerce.currency,
      mode: checkout.session.livemode ? "live" : "test",
      metadata: { licenseKeyMasked: maskCode(license.licenseKey), priceSource: checkout.priceSource }
    });

    return res.json({
      success: true,
      url: checkout.session.url,
      mode: checkout.session.livemode ? "live" : "test",
      checkoutSessionPrefix: stripeSessionPrefix(checkout.session.id),
      priceSource: checkout.priceSource
    });
  } catch (error) {
    console.error("License extension checkout failed", publicError(error));
    return res.status(500).json({ error: "checkout_failed" });
  }
});

app.post("/api/checkout/create-session", checkoutLimiter, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode || settings.checkoutEnabled === false) {
      return res.status(503).json({ error: "checkout_disabled" });
    }

    const user = await getOptionalUser(req, res);
    if (!user) return res.status(401).json({ error: "account_required" });

    const plan = getPlan(req.body?.plan);
    if (!plan) return res.status(400).json({ error: "invalid_plan", plans: planIds() });
    if (!isPublicCheckoutPlan(plan.id)) return res.status(400).json({ error: "legacy_plan_unavailable", plans: publicCheckoutPlanIds() });

    const account = await ensureUserStripeCustomer(user);
    const customerEmail = String(account.email || "").trim().toLowerCase();
    if (!isValidEmail(customerEmail)) return res.status(400).json({ error: "invalid_email" });

    const checkoutType = String(req.body?.checkoutType || "").trim().toLowerCase();
    const isGiftCodePurchase = checkoutType === "gift_code_purchase";
    const giftRecipientUserId = String(req.body?.giftRecipientUserId || "").trim();
    let giftRecipient = null;
    if (giftRecipientUserId) {
      if (isGiftCodePurchase) return res.status(400).json({ error: "gift_code_cannot_have_direct_recipient" });
      if (giftRecipientUserId === account.id) return res.status(400).json({ error: "gift_recipient_self" });
      giftRecipient = await prisma.user.findUnique({ where: { id: giftRecipientUserId } });
      if (!giftRecipient) return res.status(404).json({ error: "gift_recipient_not_found" });
    }

    const commerce = getPlanCommerce(plan);
    const priceId = env(commerce.priceEnv);
    const checkout = await createCheckoutSession({
      plan,
      commerce,
      customerEmail,
      customerId: account.stripeCustomerId,
      priceId,
      selectedCurrency: String(req.body?.currency || commerce.currency).toUpperCase(),
      language: String(req.body?.language || "en").slice(0, 8),
      extraMetadata: {
        userId: account.id,
        accountEmail: account.email,
        checkoutType: isGiftCodePurchase ? "gift_code_purchase" : giftRecipient ? "direct_gift_purchase" : "license_purchase",
        giftCodePurchase: isGiftCodePurchase ? "true" : "false",
        giftRecipientUserId: giftRecipient?.id || "",
        giftRecipientEmail: giftRecipient?.email || ""
      }
    });
    const session = checkout.session;
    await createAnalyticsEvent("checkout_created", {
      plan: plan.id,
      amount: commerce.priceCents,
      currency: commerce.currency,
      mode: session.livemode ? "live" : "test",
      metadata: { priceSource: checkout.priceSource }
    });

    const checkoutMode = session.livemode ? "live" : "test";
    const checkoutSessionPrefix = stripeSessionPrefix(session.id);
    console.info("Stripe checkout session created", {
      plan: plan.id,
      stripeMode: checkoutMode,
      checkoutSessionPrefix,
      priceEnv: commerce.priceEnv,
      saleActive: commerce.saleActive,
      priceSource: checkout.priceSource,
      gift: Boolean(giftRecipient),
      giftCodePurchase: isGiftCodePurchase,
      stripe: stripeStatus()
    });

    return res.json({
      url: session.url,
      mode: checkoutMode,
      checkoutSessionPrefix,
      priceSource: checkout.priceSource,
      giftCodePurchase: isGiftCodePurchase,
      giftRecipient: giftRecipient ? publicGiftRecipient(giftRecipient) : null
    });
  } catch (error) {
    console.error("Checkout session creation failed", { ...publicError(error), stripe: stripeStatus() });
    await createAnalyticsEvent("checkout_failed", {
      metadata: {
        code: error.code,
        type: error.type,
        priceEnv: error.priceEnv || null,
        priceStatus: error.priceStatus || null
      }
    });
    const missingStripePrice = error.code === "missing_env" && Boolean(error.priceEnv);
    const missingStripeSecret = error.code === "missing_env" && String(error.message || "").includes("STRIPE_SECRET_KEY");
    const checkoutUnavailable = missingStripePrice || missingStripeSecret || error.code === "stripe_price_unavailable" || error.code === "stripe_bootstrap_unavailable";
    return res.status(error.statusCode || (checkoutUnavailable ? 503 : 500)).json({
      error: "checkout_failed",
      reason: missingStripeSecret
        ? "stripe_secret_unavailable"
        : missingStripePrice || error.code === "stripe_price_unavailable" || error.code === "stripe_bootstrap_unavailable"
          ? "stripe_price_unavailable"
          : "stripe_checkout_unavailable",
      message: "Checkout could not start. Try again or open a ticket.",
      missingEnv: missingStripePrice ? error.priceEnv || null : null,
      priceStatus: missingStripePrice || error.code === "stripe_price_unavailable" ? error.priceStatus || null : null
    });
  }
});

app.get("/api/checkout/result", async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId.startsWith("cs_")) return res.status(400).json({ success: false, status: "invalid_session" });

    let order = await findOrderBySession(sessionId);
    let giftCode = await findGiftCodeBySession(sessionId);
    if (!order) {
      const fulfillment = await tryFulfillFromStripeSession(sessionId);
      order = fulfillment?.order || fulfillment || null;
      giftCode = fulfillment?.giftCode || giftCode;
    }

    if (giftCode) {
      return res.json({
        success: true,
        status: "gift_code_created",
        giftCodePurchase: true,
        giftCode: publicPurchasedGiftCode(giftCode, true)
      });
    }

    if (!order?.license) {
      return res.json({ success: false, status: "processing" });
    }

    return res.json({
      success: true,
      license: publicLicense(order.license)
    });
  } catch (error) {
    console.error("Checkout result failed", publicError(error));
    return res.status(500).json({ success: false, status: "error" });
  }
});

app.post("/api/billing/portal", storeCheckoutLimiter, requireUser, async (req, res) => {
  try {
    const user = await ensureUserStripeCustomer(req.user);
    if (!user.stripeCustomerId) return res.status(400).json({ error: "stripe_customer_missing" });
    const session = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${frontendUrl()}/dashboard/billing`
    });
    await createAnalyticsEvent("billing_portal_created", {
      mode: stripeStatus().effectiveMode,
      metadata: { userId: user.id, customer: "set" }
    });
    return res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Billing portal creation failed", publicError(error));
    return res.status(500).json({ error: "billing_portal_failed" });
  }
});

async function findOwnedLicenseById(user, licenseId) {
  const id = String(licenseId || "").trim();
  if (!id || !user?.email) return null;
  return prisma.license.findFirst({
    where: { id, customerEmail: user.email }
  });
}

app.get("/api/me/license-records/:licenseId/key", downloadLimiter, requireUser, async (req, res) => {
  try {
    const license = await findOwnedLicenseById(req.user, req.params.licenseId);
    if (!license) return res.status(404).json({ error: "license_not_found" });
    const access = licenseAccessState(license);
    if (!access.valid) return res.status(403).json({ error: access.reason || "license_unavailable" });
    await createAuditLog("license_key_copied", "license", license.id, {
      userId: req.user.id,
      licenseKeyMasked: maskCode(license.licenseKey)
    });
    return res.json({
      success: true,
      licenseKey: license.licenseKey,
      licenseKeyMasked: maskCode(license.licenseKey)
    });
  } catch (error) {
    console.error("License key copy failed", publicError(error));
    return res.status(500).json({ error: "license_key_copy_failed" });
  }
});

app.post("/api/me/license-records/:licenseId/download", downloadLimiter, requireUser, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    const license = await findOwnedLicenseById(req.user, req.params.licenseId);
    const licenseKey = license?.licenseKey || "-";

    if (env("NODE_ENV", "development") === "production" && !downloadSecretStatus().configured) {
      await logDownload(license, licenseKey, "failed", "protected_download_signing_unavailable");
      return res.status(503).json({
        success: false,
        reason: "protected_download_signing_unavailable",
        message: "Protected downloads are temporarily unavailable. Please contact support."
      });
    }

    if (settings.downloadEnabled === false) {
      await logDownload(license, licenseKey, "failed", "download_disabled");
      return res.status(403).json({ success: false, reason: "download_disabled", message: "Downloads are currently disabled." });
    }

    if (!license) {
      await logDownload(null, "-", "failed", "license_not_found");
      return res.status(404).json({ success: false, reason: "license_not_found", message: "Invalid or expired license." });
    }

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
          metadata: { version: downloadInfo.version || null, userId: req.user.id }
        }
      })
    ]);

    return res.json({
      success: true,
      downloadUrl: downloadInfo.downloadUrl,
      version: downloadInfo.version || null
    });
  } catch (error) {
    console.error("Account license download failed", publicError(error));
    return res.status(500).json({ error: "download_failed" });
  }
});

app.get("/api/download", downloadLimiter, async (req, res) => {
  const licenseKey = normalizeLicenseKey(req.query?.licenseKey);
  const settings = await getSiteSettings();

  if (env("NODE_ENV", "development") === "production" && !downloadSecretStatus().configured) {
    await logDownload(null, licenseKey || "-", "failed", "protected_download_signing_unavailable");
    return res.status(503).json({
      success: false,
      reason: "protected_download_signing_unavailable",
      message: "Protected downloads are temporarily unavailable. Please contact support."
    });
  }

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
  const minSupportedAppVersion = env("MIN_SUPPORTED_APP_VERSION", DEFAULT_MIN_SUPPORTED_APP_VERSION);
  const versionStatus = minimumAppVersionStatus(appVersion, minSupportedAppVersion);

  try {
    if (versionStatus.updateRequired) {
      const updateTarget = await latestAppUpdateTarget(versionStatus.minimumVersion || DEFAULT_MIN_SUPPORTED_APP_VERSION);
      await logValidation(null, licenseKey || "-", "failed", "update_required", hwid, appVersion);
      return res.status(426).json(licenseValidationPayload(null, {
        valid: false,
        validLicense: false,
        reason: "update_required",
        message: "This app version is no longer supported. Please download the latest Fima Macro update.",
        licenseKey,
        latestVersion: updateTarget.latestVersion,
        downloadUrl: updateTarget.downloadUrl
      }));
    }

    if (!licenseKey || !isNormalizedCloudLicenseKey(licenseKey)) {
      await logValidation(null, licenseKey || "-", "failed", "invalid_format", hwid, appVersion);
      return res.status(400).json(licenseValidationPayload(null, {
        valid: false,
        reason: "invalid_format",
        message: "Invalid license key format.",
        licenseKey
      }));
    }

    if (!hwid) {
      await logValidation(null, licenseKey, "failed", "invalid_hwid", hwid, appVersion);
      return res.status(400).json(licenseValidationPayload(null, {
        valid: false,
        reason: "invalid_format",
        message: "Invalid HWID.",
        licenseKey
      }));
    }

    let license = await prisma.license.findUnique({ where: { licenseKey } });
    if (!license) {
      await logValidation(null, licenseKey, "failed", "license_not_found", hwid, appVersion);
      return invalid(res, "license_not_found", "License key was not found.", licenseValidationPayload(null, {
        valid: false,
        reason: "license_not_found",
        message: "License key was not found.",
        licenseKey
      }));
    }

    const blockedReason = licenseBlockedReason(license);
    if (blockedReason) {
      await incrementValidationFailure(license, licenseKey, blockedReason, hwid, appVersion);
      return invalid(res, blockedReason, licenseReasonMessage(blockedReason), licenseValidationPayload(license, {
        valid: false,
        reason: blockedReason,
        message: licenseReasonMessage(blockedReason),
        hwid
      }));
    }

    if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      const expiredReason = licenseSource(license) === "Trial" ? "trial_expired" : "expired";
      await incrementValidationFailure(license, licenseKey, expiredReason, hwid, appVersion);
      return invalid(res, expiredReason, licenseReasonMessage(expiredReason), licenseValidationPayload(license, {
        valid: false,
        reason: expiredReason,
        message: licenseReasonMessage(expiredReason),
        hwid
      }));
    }

    const ownerBinding = ownerLicenseBindingState(license, hwid);
    if (!ownerBinding.ok) {
      await logOwnerKeyAttempt(license, hwid, appVersion, ownerBinding.reason);
      return invalid(res, ownerBinding.reason, licenseReasonMessage(ownerBinding.reason), licenseValidationPayload(license, {
        valid: false,
        reason: ownerBinding.reason,
        message: licenseReasonMessage(ownerBinding.reason),
        hwid,
        hwidMatches: false
      }));
    }

    const accountAccess = await buildLicenseAccountAccess(license);
    if (!entitlementSecretStatus().configured) {
      await logValidation(license, licenseKey, "failed", "entitlement_unavailable", hwid, appVersion);
      return res.status(503).json(licenseValidationPayload(license, {
        valid: false,
        validLicense: true,
        reason: "entitlement_unavailable",
        message: licenseReasonMessage("entitlement_unavailable"),
        accountAccess,
        hwid
      }));
    }

    let hwidBoundNow = false;
    if (!normalizeHwid(license.hwid)) {
      await prisma.license.updateMany({
        where: { id: license.id },
        data: { hwid }
      });
      license = await prisma.license.findUnique({ where: { id: license.id } });
      hwidBoundNow = normalizeHwid(license?.hwid) === hwid;
    }

    if (normalizeHwid(license.hwid) !== hwid) {
      await incrementValidationFailure(license, licenseKey, "hwid_mismatch", hwid, appVersion);
      return invalid(res, "hwid_mismatch", licenseReasonMessage("hwid_mismatch"), licenseValidationPayload(license, {
        valid: false,
        reason: "hwid_mismatch",
        message: licenseReasonMessage("hwid_mismatch"),
        accountAccess,
        hwid,
        hwidMatches: false,
        hwidBoundNow: false
      }));
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
          licenseKey: validationLogLicenseKey(license, licenseKey),
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
          metadata: { result: "success", appVersion, ownerKey: isOwnerManagedLicense(license) }
        }
      })
    ]);

    const entitlement = issueAppEntitlement({
      license,
      user: accountAccess.user,
      hwid,
      appVersion,
      minSupportedAppVersion,
      licenseStatus: "active"
    });

    return res.json({
      ...licenseValidationPayload(license, {
        valid: true,
        reason: "valid",
        message: "License valid",
        accountAccess,
        hwid,
        hwidMatches: true,
        hwidBoundNow
      }),
      valid: true,
      licenseKey,
      plan: license.plan,
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
      lifetime: license.lifetime,
      hasActiveLicense: true,
      discordLinked: accountAccess.discordLinked,
      robloxLinked: accountAccess.robloxLinked,
      canUseApp: true,
      hwidBoundNow,
      missingRequirements: [],
      entitlementToken: entitlement.token,
      entitlement: publicEntitlementPayload(entitlement),
      entitlementExpiresAt: entitlement.expiresAt,
      minSupportedAppVersion,
      accountEmail: maskEmail(accountAccess.user?.email || license.customerEmail),
      robloxUsername: accountAccess.user?.robloxUsername || null,
      robloxAvatarUrl: accountAccess.user?.robloxAvatarUrl || null,
      discordUsername: accountAccess.user?.discordUsername || null,
      message: "License valid"
    });
  } catch (error) {
    console.error("License validation failed", publicError(error));
    await logValidation(null, licenseKey || "-", "failed", "server_error", hwid, appVersion);
    return res.status(500).json(licenseValidationPayload(null, {
      valid: false,
      reason: "server_error",
      message: "License validation failed",
      licenseKey
    }));
  }
});

app.post("/api/license/refresh-entitlement", entitlementRefreshLimiter, async (req, res) => {
  const token = extractEntitlementToken(req);
  const hwid = normalizeHwid(req.body?.hwid);
  const appVersion = String(req.body?.appVersion || "").trim().slice(0, 80) || null;
  const minSupportedAppVersion = env("MIN_SUPPORTED_APP_VERSION", DEFAULT_MIN_SUPPORTED_APP_VERSION);
  const versionStatus = minimumAppVersionStatus(appVersion, minSupportedAppVersion);

  try {
    if (!entitlementSecretStatus().configured) {
      return res.status(503).json({
        valid: false,
        canUseApp: false,
        reason: "entitlement_unavailable",
        message: licenseReasonMessage("entitlement_unavailable")
      });
    }

    if (versionStatus.updateRequired) {
      const updateTarget = await latestAppUpdateTarget(versionStatus.minimumVersion || DEFAULT_MIN_SUPPORTED_APP_VERSION);
      return res.status(426).json({
        valid: false,
        canUseApp: false,
        reason: "update_required",
        message: "A security update is required. Please update Fima Macro.",
        latestVersion: updateTarget.latestVersion,
        downloadUrl: updateTarget.downloadUrl
      });
    }

    if (!token) {
      return res.status(401).json({
        valid: false,
        canUseApp: false,
        reason: "entitlement_required",
        message: licenseReasonMessage("entitlement_required")
      });
    }

    if (!hwid) {
      return res.status(400).json({
        valid: false,
        canUseApp: false,
        reason: "invalid_format",
        message: "Invalid HWID."
      });
    }

    const verified = verifyAppEntitlement(token);
    if (!verified.ok) {
      return res.status(401).json({
        valid: false,
        canUseApp: false,
        reason: verified.reason,
        message: licenseReasonMessage(verified.reason)
      });
    }

    const incomingHwidHash = hashDeviceId(hwid);
    if (!incomingHwidHash || incomingHwidHash !== verified.payload.hwidHash) {
      return res.status(403).json({
        valid: false,
        canUseApp: false,
        reason: "hwid_mismatch",
        message: licenseReasonMessage("hwid_mismatch")
      });
    }

    let license = await prisma.license.findUnique({ where: { id: verified.payload.licenseId } });
    if (!license) {
      return res.status(404).json({
        valid: false,
        canUseApp: false,
        reason: "license_not_found",
        message: licenseReasonMessage("license_not_found")
      });
    }

    const blockedReason = licenseBlockedReason(license);
    if (blockedReason) {
      await logValidation(license, license.licenseKey || "-", "failed", blockedReason, hwid, appVersion);
      return res.status(403).json(licenseValidationPayload(license, {
        valid: false,
        reason: blockedReason,
        message: licenseReasonMessage(blockedReason),
        hwid
      }));
    }

    if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      const expiredReason = licenseSource(license) === "Trial" ? "trial_expired" : "expired";
      await logValidation(license, license.licenseKey || "-", "failed", expiredReason, hwid, appVersion);
      return res.status(403).json(licenseValidationPayload(license, {
        valid: false,
        reason: expiredReason,
        message: licenseReasonMessage(expiredReason),
        hwid
      }));
    }

    const ownerBinding = ownerLicenseBindingState(license, hwid);
    if (!ownerBinding.ok) {
      await logOwnerKeyAttempt(license, hwid, appVersion, ownerBinding.reason);
      return res.status(403).json(licenseValidationPayload(license, {
        valid: false,
        reason: ownerBinding.reason,
        message: licenseReasonMessage(ownerBinding.reason),
        hwid,
        hwidMatches: false
      }));
    }

    if (!normalizeHwid(license.hwid)) {
      await prisma.license.updateMany({
        where: { id: license.id },
        data: { hwid }
      });
      license = await prisma.license.findUnique({ where: { id: license.id } });
    }

    if (normalizeHwid(license.hwid) !== hwid) {
      await logValidation(license, license.licenseKey || "-", "failed", "hwid_mismatch", hwid, appVersion);
      return res.status(403).json(licenseValidationPayload(license, {
        valid: false,
        reason: "hwid_mismatch",
        message: licenseReasonMessage("hwid_mismatch"),
        hwid,
        hwidMatches: false
      }));
    }

    const accountAccess = await buildLicenseAccountAccess(license);
    const entitlement = issueAppEntitlement({
      license,
      user: accountAccess.user,
      hwid,
      appVersion,
      minSupportedAppVersion,
      licenseStatus: "active"
    });

    await prisma.validationLog.create({
      data: {
        licenseId: license.id,
        licenseKey: validationLogLicenseKey(license, license.licenseKey),
        result: "success",
        reason: "entitlement_refresh",
        hwidHash: hashHwid(hwid),
        appVersion
      }
    }).catch(() => {});

    return res.json({
      ...licenseValidationPayload(license, {
        valid: true,
        reason: "valid",
        message: "License valid",
        accountAccess,
        hwid,
        hwidMatches: true
      }),
      valid: true,
      canUseApp: true,
      entitlementToken: entitlement.token,
      entitlement: publicEntitlementPayload(entitlement),
      entitlementExpiresAt: entitlement.expiresAt,
      minSupportedAppVersion
    });
  } catch (error) {
    console.error("Entitlement refresh failed", publicError(error));
    return res.status(500).json({
      valid: false,
      canUseApp: false,
      reason: "server_error",
      message: "License server could not refresh app entitlement right now."
    });
  }
});

app.get("/admin/login", (_req, res) => res.type("html").send(loginPage()));

app.post("/admin/login", adminLoginLimiter, async (req, res) => {
  try {
    const loginKey = adminLoginKey(req);
    const lock = adminLoginLockState(loginKey);
    if (lock.locked) {
      await createAuditLog("admin_login_locked_out", "admin", null, { ip: req.ip });
      return res.status(429).type("html").send(loginPage("Admin login is temporarily locked. Try again later."));
    }

    const submitted = String(req.body?.password || "");
    const expected = requiredEnv("ADMIN_PASSWORD");
    if (!adminPasswordMeetsEmergencyPolicy(expected)) {
      await createAuditLog("admin_login_blocked_weak_password", "admin", null, {});
      return res.status(503).type("html").send(loginPage("Admin login is disabled until the admin password is rotated to a strong value."));
    }
    if (!timingSafeTextEqual(submitted, expected)) {
      recordAdminLoginFailure(loginKey);
      await createAuditLog("admin_login_failed", "admin", null, { reason: "invalid_password", ip: req.ip });
      return res.status(401).type("html").send(loginPage("Invalid password"));
    }

    clearAdminLoginFailure(loginKey);
    await createAuditLog("admin_login_success", "admin", null, {});
    setAdminCookie(res, createAdminToken());
    return res.redirect(303, "/admin");
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

app.get("/admin/health/bot", async (_req, res) => {
  res.json({ success: true, bot: await discordBotHealth() });
});

app.get("/admin/api/bot/health", requireAdmin, async (_req, res) => {
  res.json({ success: true, bot: await discordBotHealth() });
});

app.post("/admin/roles/sync", requireAdmin, async (req, res) => {
  try {
    const result = await syncDiscordRoles(req.body || {});
    await createAuditLog("discord_roles_synced", "discord", null, { count: result.results.length });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Discord role sync failed", publicError(error));
    return res.status(500).json({ error: error.code || "discord_role_sync_failed", message: error.message });
  }
});

app.post("/admin/roles/give-buyer", requireAdmin, async (req, res) => {
  return adminDiscordRoleAction(req, res, "buyer", "add");
});

app.post("/admin/roles/remove-buyer", requireAdmin, async (req, res) => {
  return adminDiscordRoleAction(req, res, "buyer", "remove");
});

app.post("/admin/roles/give-trial", requireAdmin, async (req, res) => {
  return adminDiscordRoleAction(req, res, "trial", "add");
});

app.post("/admin/roles/remove-trial", requireAdmin, async (req, res) => {
  return adminDiscordRoleAction(req, res, "trial", "remove");
});

app.get("/admin/api/payments/robux/manual", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();
  const submissions = await prisma.paymentSubmission.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { customerEmail: { contains: search, mode: "insensitive" } },
                { discordUserId: { contains: search } },
                { discordUsername: { contains: search, mode: "insensitive" } },
                { robloxUsername: { contains: search, mode: "insensitive" } },
                { plan: { contains: search, mode: "insensitive" } }
              ]
            }
          : {}
      ]
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ submissions: submissions.map(publicPaymentSubmission) });
});

app.post([
  "/admin/api/payments/robux/manual/:id/approve",
  "/payments/robux/manual/:id/approve"
], requireAdmin, async (req, res) => {
  return reviewManualRobuxSubmission(req, res, "approved");
});

app.post([
  "/admin/api/payments/robux/manual/:id/reject",
  "/payments/robux/manual/:id/reject"
], requireAdmin, async (req, res) => {
  return reviewManualRobuxSubmission(req, res, "rejected");
});

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

async function adminLicensesHandler(req, res) {
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
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 3 }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const emails = [...new Set(licenses.map((license) => normalizeEmail(license.customerEmail)).filter(Boolean))];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: {
          email: true,
          discordUsername: true,
          discordUserId: true,
          discordAvatarUrl: true,
          robloxUsername: true,
          robloxUserId: true,
          robloxAvatarUrl: true,
          stripeCustomerId: true
        }
      })
    : [];
  const userByEmail = new Map(users.map((user) => [normalizeEmail(user.email), user]));

  res.json({
    licenses: licenses.map((license) => adminLicensePayload(license, userByEmail.get(normalizeEmail(license.customerEmail))))
  });
}

app.get(["/admin/api/licenses", "/api/admin/licenses"], requireAdmin, adminLicensesHandler);

app.post(["/admin/api/licenses/validate", "/api/admin/licenses/validate"], requireAdmin, async (req, res) => {
  const licenseKey = normalizeLicenseKey(req.body?.licenseKey);
  const hwid = normalizeHwid(req.body?.hwid);

  if (!licenseKey || !isNormalizedCloudLicenseKey(licenseKey)) {
    return res.status(400).json(licenseValidationPayload(null, {
      valid: false,
      reason: "invalid_format",
      message: licenseReasonMessage("invalid_format"),
      licenseKey
    }));
  }

  const license = await prisma.license.findUnique({ where: { licenseKey } });
  if (!license) {
    return res.status(404).json(licenseValidationPayload(null, {
      valid: false,
      reason: "license_not_found",
      message: licenseReasonMessage("license_not_found"),
      licenseKey
    }));
  }

  const accountAccess = await buildLicenseAccountAccess(license);
  let reason = "valid";
  const blockedReason = licenseBlockedReason(license);
  if (blockedReason) {
    reason = blockedReason;
  } else if (!license.lifetime && license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    reason = licenseSource(license) === "Trial" ? "trial_expired" : "expired";
  } else if (hwid && license.hwid && normalizeHwid(license.hwid) !== hwid) {
    reason = "hwid_mismatch";
  }

  const valid = reason === "valid";
  return res.json({
    ...licenseValidationPayload(license, {
      valid,
      validLicense: !["license_not_found", "invalid_format"].includes(reason),
      reason,
      message: licenseReasonMessage(reason),
      accountAccess,
      hwid,
      hwidMatches: !hwid || !license.hwid || normalizeHwid(license.hwid) === hwid
    }),
    dryRun: true,
    wouldBindHwid: Boolean(hwid && !license.hwid)
  });
});

app.get(["/admin/api/licenses/:id", "/api/admin/licenses/:id"], requireAdmin, async (req, res) => {
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

app.post(["/admin/api/licenses/:id/extend", "/api/admin/licenses/:id/extend"], requireAdmin, async (req, res) => {
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

app.post(["/admin/api/licenses/:id/attach-user", "/api/admin/licenses/:id/attach-user"], requireAdmin, async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const email = normalizeEmail(req.body?.email);
  const reason = String(req.body?.reason || "admin_attach_license_to_user").trim().slice(0, 500);
  if (!userId && !isValidEmail(email)) return res.status(400).json({ error: "user_or_email_required" });

  const [license, user] = await Promise.all([
    prisma.license.findUnique({ where: { id: req.params.id } }),
    userId
      ? prisma.user.findUnique({ where: { id: userId } })
      : prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized: normalizeAccountEmail(email) }] } })
  ]);
  if (!license) return res.status(404).json({ error: "license_not_found" });
  if (!user || !isValidEmail(user.email)) return res.status(404).json({ error: "user_not_found" });

  const previousEmail = license.customerEmail;
  const noteLine = `[${new Date().toISOString()}] attached_to_user:${user.id} previous_email:${previousEmail || "-"} reason:${reason}`;
  const updated = await prisma.license.update({
    where: { id: license.id },
    data: {
      customerEmail: normalizeEmail(user.email),
      notes: [license.notes, noteLine].filter(Boolean).join("\n").slice(0, 5000)
    }
  });
  await ensureCustomer(user.email);
  await createAuditLog("license_attached_to_user", "license", updated.id, {
    userId: user.id,
    previousEmail: maskEmail(previousEmail),
    newEmail: maskEmail(user.email),
    reason
  });
  return res.json({ success: true, license: updated, user: publicUser(user) });
});

app.post(["/admin/api/licenses/:id/extend-compensation", "/api/admin/licenses/:id/extend-compensation"], requireAdmin, async (req, res) => {
  const duration = String(req.body?.duration || "").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: "reason_required" });

  const current = await prisma.license.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "not_found" });
  if (["lifetime", "life", "unlimited"].includes(duration)) {
    const noteLine = `[${new Date().toISOString()}] compensation_extension duration:lifetime reason:${reason}`;
    const license = await prisma.license.update({
      where: { id: current.id },
      data: {
        lifetime: true,
        status: "active",
        expiresAt: null,
        notes: [current.notes, noteLine].filter(Boolean).join("\n").slice(0, 5000)
      }
    });
    await createAuditLog("license_compensation_extended", "license", license.id, {
      duration: "lifetime",
      previousExpiresAt: current.expiresAt ? current.expiresAt.toISOString() : null,
      newExpiresAt: null,
      reason
    });
    return res.json({ success: true, license });
  }

  const fromMode = String(req.body?.from || req.body?.applyFrom || "").trim().toLowerCase();
  const baseDate = fromMode === "now"
    ? new Date()
    : current.expiresAt && current.expiresAt > new Date()
      ? new Date(current.expiresAt)
      : new Date();
  const nextExpiry = addCompensationDuration(baseDate, duration, req.body?.customDays, req.body?.customDate);
  if (!nextExpiry) return res.status(400).json({ error: "invalid_duration" });

  const noteLine = `[${new Date().toISOString()}] compensation_extension duration:${duration || "custom"} new_expiry:${nextExpiry.toISOString()} reason:${reason}`;
  const license = await prisma.license.update({
    where: { id: current.id },
    data: {
      lifetime: false,
      status: "active",
      expiresAt: nextExpiry,
      notes: [current.notes, noteLine].filter(Boolean).join("\n").slice(0, 5000)
    }
  });
  await createAuditLog("license_compensation_extended", "license", license.id, {
    duration,
    customDays: req.body?.customDays || null,
    previousExpiresAt: current.expiresAt ? current.expiresAt.toISOString() : null,
    newExpiresAt: nextExpiry.toISOString(),
    reason
  });
  return res.json({ success: true, license });
});

app.post(["/admin/api/licenses/:id/status", "/api/admin/licenses/:id/status"], requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["active", "inactive", "banned", "disabled", "revoked"].includes(status)) return res.status(400).json({ error: "invalid_status" });
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { status } });
  await createAuditLog(status === "banned" ? "license_banned" : status === "revoked" ? "license_revoked" : "license_status_changed", "license", license.id, { status });
  return res.json({ license });
});

app.post(["/admin/api/licenses/:id/reset-hwid", "/api/admin/licenses/:id/reset-hwid"], requireAdmin, async (req, res) => {
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { hwid: null } });
  await createAuditLog("license_hwid_reset", "license", license.id, {});
  return res.json({ license });
});

app.post(["/admin/api/licenses/:id/bind-hwid", "/api/admin/licenses/:id/bind-hwid"], requireAdmin, async (req, res) => {
  const hwid = normalizeHwid(req.body?.hwid);
  if (!hwid) return res.status(400).json({ error: "invalid_hwid" });
  const license = await prisma.license.update({ where: { id: req.params.id }, data: { hwid } });
  await createAuditLog("license_hwid_bound", "license", license.id, { hwidHash: hashHwid(hwid) });
  return res.json({ license });
});

app.post(["/admin/api/licenses/:id/notes", "/api/admin/licenses/:id/notes"], requireAdmin, async (req, res) => {
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

app.get("/admin/api/email/health", requireAdmin, async (_req, res) => {
  res.json({
    smtp: smtpSummary(),
    resend: { configured: Boolean(env("RESEND_API_KEY", "")) },
    lastEmailDelivery: lastEmailDeliveryState
  });
});

app.post(["/admin/api/email/test", "/api/admin/email/test", "/admin/api/system/email-test"], requireAdmin, async (req, res) => {
  const to = normalizeEmail(req.body?.email) || normalizeEmail(env("SMTP_USER", ""));
  if (!isValidEmail(to)) return res.status(400).json({ error: "invalid_email" });
  try {
    const result = await sendFimaEmail({
      to,
      subject: "Fima Macro email test",
      text: "Fima Macro email delivery test succeeded.",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#070711;color:#f6f2ff;padding:24px">
          <div style="max-width:560px;margin:0 auto;border:1px solid rgba(190,150,255,.28);border-radius:12px;background:#121020;padding:24px">
            <p style="margin:0 0 8px;color:#c79cff;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Fima Macro</p>
            <h1 style="margin:0 0 14px;font-size:26px">Email test succeeded</h1>
            <p style="color:#b7adc9">This confirms the configured mail provider can send Fima account emails.</p>
          </div>
        </div>
      `
    });
    await createAuditLog("email_test_sent", "email", null, { to: maskEmail(to), provider: result.provider });
    return res.json({ success: true, sent: true, provider: result.provider, lastEmailDelivery: lastEmailDeliveryState });
  } catch (error) {
    console.error("Admin email test failed", publicError(error));
    return res.status(503).json({ error: "email_delivery_failed", message: "Email test failed.", smtp: smtpSummary(), lastEmailDelivery: lastEmailDeliveryState });
  }
});

app.post("/admin/api/customers/:email/password-reset", requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.params.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });

  try {
    const emailNormalized = normalizeAccountEmail(email);
    const user = await prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized }] } });
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const result = await createPasswordResetForUser(user, "admin_password_reset_sent", {
      requestedBy: "admin_panel",
      requireDelivery: true
    });
    return res.json({
      success: true,
      message: "Password reset email sent.",
      emailConfigured: result.emailConfigured,
      emailSent: result.emailSent,
      provider: result.provider,
      resetUrl: env("NODE_ENV", "development") !== "production" ? result.resetUrl : undefined
    });
  } catch (error) {
    console.error("Customer password reset send failed", publicError(error));
    return res.status(503).json({ error: "email_delivery_failed", message: "Email could not be sent.", smtp: smtpSummary(), lastEmailDelivery: lastEmailDeliveryState });
  }
});

app.post(["/admin/api/users/:id/password-reset", "/api/admin/users/:id/password-reset"], requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "user_not_found" });
  try {
    const result = await createPasswordResetForUser(user, "admin_password_reset_sent", {
      requestedBy: "admin_panel",
      requireDelivery: true
    });
    return res.json({
      success: true,
      message: "Password reset email sent.",
      emailConfigured: result.emailConfigured,
      emailSent: result.emailSent,
      provider: result.provider,
      resetUrl: env("NODE_ENV", "development") !== "production" ? result.resetUrl : undefined
    });
  } catch (error) {
    console.error("Admin password reset send failed", publicError(error));
    return res.status(503).json({ error: "email_delivery_failed", smtp: smtpSummary(), lastEmailDelivery: lastEmailDeliveryState });
  }
});

app.post(["/admin/api/users/:id/temporary-password", "/api/admin/users/:id/temporary-password"], requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(temporaryPassword) }
  });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
  await createAuditLog("admin_temporary_password_generated", "user", user.id, {
    email: maskEmail(user.email),
    expiresNotice: "Show once only. User should change it after login."
  });
  return res.json({
    success: true,
    temporaryPassword,
    message: "Temporary password generated. It is shown once only; tell the user to change it after login."
  });
});

app.get("/admin/api/downloads", requireAdmin, async (_req, res) => {
  const info = await resolveDownloadInfo();
  const recent = await prisma.downloadLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { license: true } });
  res.json({ current: info, recent });
});

app.get("/admin/api/settings", requireAdmin, async (_req, res) => {
  res.json({ settings: await getSiteSettings() });
});

app.get("/admin/api/payments/setup-status", requireAdmin, async (req, res) => {
  const validate = req.query?.validate === "1" || req.query?.validate === "true";
  res.json(await buildPaymentSetupStatus({ validate }));
});

app.post("/admin/api/payments/repair-stripe-prices", requireAdmin, async (req, res) => {
  try {
    const result = await bootstrapRuntimeStripePrices({ source: "admin_panel_repair" });
    await createAuditLog("stripe_price_repair_completed", "stripe", null, safeStripeBootstrapAudit(result));
    return res.json(publicStripeBootstrapResult(result));
  } catch (error) {
    const details = publicStripeResolverError(error);
    console.error("Stripe price repair failed", details);
    await createAuditLog("stripe_price_repair_failed", "stripe", null, details);
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.code || "stripe_price_repair_failed",
      message: "Stripe price repair could not run.",
      reason: details.code || "stripe_price_repair_failed"
    });
  }
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

app.get("/admin/api/products", requireAdmin, async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { prices: { orderBy: { createdAt: "desc" } }, purchases: { take: 5, orderBy: { createdAt: "desc" }, include: { user: true } } }
  });
  res.json({ products });
});

app.post("/admin/api/products", requireAdmin, async (req, res) => {
  try {
    const input = sanitizeProductInput(req.body || {});
    if (!input.name) return res.status(400).json({ error: "invalid_product_name" });
    const amount = toPositiveInt(req.body?.amount);
    if (!amount) return res.status(400).json({ error: "invalid_price_amount" });

    const stripeProduct = await stripe().products.create({
      name: input.name,
      description: input.description || undefined,
      images: input.image ? [input.image] : undefined,
      active: input.active,
      metadata: {
        category: input.category || "",
        app: env("APP_NAME", "Fima Macro")
      }
    });
    const stripePrice = await stripe().prices.create({
      product: stripeProduct.id,
      currency: "eur",
      unit_amount: amount
    });

    const product = await prisma.product.create({
      data: {
        ...input,
        stripeProductId: stripeProduct.id,
        prices: {
          create: {
            stripePriceId: stripePrice.id,
            amount,
            currency: "eur",
            active: true
          }
        }
      },
      include: { prices: true }
    });
    await createAuditLog("product_created", "product", product.id, { stripeProductId: stripeProduct.id, stripePriceId: stripePrice.id });
    res.status(201).json({ product });
  } catch (error) {
    console.error("Admin product create failed", publicError(error));
    res.status(500).json({ error: "product_create_failed" });
  }
});

app.post("/admin/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: "not_found" });
    const input = sanitizeProductInput(req.body || {});
    if (!input.name) return res.status(400).json({ error: "invalid_product_name" });

    if (product.stripeProductId) {
      await stripe().products.update(product.stripeProductId, {
        name: input.name,
        description: input.description || undefined,
        images: input.image ? [input.image] : [],
        active: input.active,
        metadata: {
          category: input.category || "",
          app: env("APP_NAME", "Fima Macro")
        }
      });
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: input,
      include: { prices: { orderBy: { createdAt: "desc" } } }
    });
    await createAuditLog("product_updated", "product", updated.id, {});
    res.json({ product: updated });
  } catch (error) {
    console.error("Admin product update failed", publicError(error));
    res.status(500).json({ error: "product_update_failed" });
  }
});

app.post("/admin/api/products/:id/price", requireAdmin, async (req, res) => {
  try {
    const amount = toPositiveInt(req.body?.amount);
    if (!amount) return res.status(400).json({ error: "invalid_price_amount" });
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { prices: { where: { active: true } } } });
    if (!product || !product.stripeProductId) return res.status(404).json({ error: "not_found" });

    const stripePrice = await stripe().prices.create({
      product: product.stripeProductId,
      currency: "eur",
      unit_amount: amount
    });

    await Promise.all(product.prices.map((price) =>
      price.stripePriceId
        ? stripe().prices.update(price.stripePriceId, { active: false }).catch(() => null)
        : Promise.resolve(null)
    ));

    const price = await prisma.$transaction(async (tx) => {
      await tx.productPrice.updateMany({ where: { productId: product.id, active: true }, data: { active: false } });
      return tx.productPrice.create({
        data: {
          productId: product.id,
          stripePriceId: stripePrice.id,
          amount,
          currency: "eur",
          active: true
        }
      });
    });
    await createAuditLog("product_price_changed", "product", product.id, { stripePriceId: stripePrice.id, amount });
    res.json({ price });
  } catch (error) {
    console.error("Admin price change failed", publicError(error));
    res.status(500).json({ error: "price_change_failed" });
  }
});

app.get("/admin/api/coupons", requireAdmin, async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ coupons });
});

app.post("/admin/api/coupons", requireAdmin, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!code) return res.status(400).json({ error: "invalid_code" });
    const percentOff = toOptionalInt(req.body?.percentOff);
    const amountOff = toOptionalInt(req.body?.amountOff);
    if (!percentOff && !amountOff) return res.status(400).json({ error: "discount_required" });
    if (percentOff && (percentOff < 1 || percentOff > 100)) return res.status(400).json({ error: "invalid_percent_off" });

    const active = req.body?.active !== false;
    const expiresAt = parseOptionalDate(req.body?.expiresAt);
    const maxRedemptions = toOptionalInt(req.body?.maxRedemptions);
    const stripeCoupon = await stripe().coupons.create({
      duration: "once",
      percent_off: percentOff || undefined,
      amount_off: amountOff || undefined,
      currency: amountOff ? "eur" : undefined,
      max_redemptions: maxRedemptions || undefined,
      redeem_by: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : undefined,
      metadata: { app: env("APP_NAME", "Fima Macro"), code }
    });

    let stripePromotionCode = null;
    try {
      stripePromotionCode = await stripe().promotionCodes.create({
        coupon: stripeCoupon.id,
        code,
        active,
        max_redemptions: maxRedemptions || undefined,
        expires_at: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : undefined
      });
    } catch (promotionError) {
      console.warn("Stripe promotion code create failed; coupon was still created", publicError(promotionError));
    }

    const coupon = await prisma.coupon.upsert({
      where: { code },
      create: {
        code,
        stripeCouponId: stripeCoupon.id,
        stripePromotionCodeId: stripePromotionCode?.id || null,
        percentOff,
        amountOff,
        currency: amountOff ? "eur" : null,
        active,
        expiresAt,
        maxRedemptions,
        notes: String(req.body?.notes || "").slice(0, 1000) || null
      },
      update: {
        stripeCouponId: stripeCoupon.id,
        stripePromotionCodeId: stripePromotionCode?.id || null,
        percentOff,
        amountOff,
        currency: amountOff ? "eur" : null,
        active,
        expiresAt,
        maxRedemptions,
        notes: String(req.body?.notes || "").slice(0, 1000) || null
      }
    });
    await createAuditLog("coupon_saved", "coupon", coupon.id, { code, stripeCouponId: stripeCoupon.id, stripePromotionCodeId: stripePromotionCode?.id || null });
    res.json({ coupon });
  } catch (error) {
    console.error("Admin coupon save failed", publicError(error));
    res.status(500).json({ error: "coupon_save_failed" });
  }
});

app.post("/admin/api/coupons/:id/status", requireAdmin, async (req, res) => {
  const active = Boolean(req.body?.active);
  const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: { active } });
  if (coupon.stripePromotionCodeId) {
    await stripe().promotionCodes.update(coupon.stripePromotionCodeId, { active }).catch((error) => {
      console.warn("Stripe promotion code status update failed", publicError(error));
    });
  }
  await createAuditLog("coupon_status_changed", "coupon", coupon.id, { active });
  res.json({ coupon });
});

app.get("/admin/api/users", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const users = await prisma.user.findMany({
    where: search
      ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { stripeCustomerId: { contains: search } }] }
      : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { purchases: { include: { product: true }, orderBy: { createdAt: "desc" }, take: 5 } }
  });
  res.json({ users: users.map((user) => ({ ...publicUser(user), purchases: user.purchases })) });
});

app.get("/admin/api/referrals", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const search = String(req.query.search || "").trim();
  const referrals = await prisma.referral.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { referralCode: { is: { code: { contains: normalizeReferralCode(search) } } } },
                { referrer: { is: { email: { contains: normalizeEmail(search), mode: "insensitive" } } } },
                { referred: { is: { email: { contains: normalizeEmail(search), mode: "insensitive" } } } },
                { referrer: { is: { discordUsername: { contains: search, mode: "insensitive" } } } },
                { referred: { is: { discordUsername: { contains: search, mode: "insensitive" } } } },
                { referrer: { is: { robloxUsername: { contains: search, mode: "insensitive" } } } },
                { referred: { is: { robloxUsername: { contains: search, mode: "insensitive" } } } }
              ]
            }
          : {}
      ]
    },
    include: {
      referralCode: true,
      referrer: true,
      referred: true,
      abuseFlags: { orderBy: { createdAt: "desc" }, take: 5 }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ referrals: referrals.map(adminReferralPayload) });
});

app.post("/admin/api/referrals/:id/status", requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();
  const allowed = new Set(["pending", "valid", "rejected", "flagged_for_review"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "invalid_referral_status" });
  const reason = String(req.body?.reason || "").trim().slice(0, 300) || `manual_${status}`;
  const notes = String(req.body?.notes || "").trim().slice(0, 1000) || null;
  try {
    const referral = await prisma.referral.update({
      where: { id: req.params.id },
      data: {
        status,
        statusReason: reason,
        notes,
        reviewedBy: "admin",
        reviewedAt: new Date()
      },
      include: { referrer: true, referred: true, referralCode: true, abuseFlags: true }
    });
    if (status === "valid") {
      await grantReferralRewardsIfEligible(referral.referrerUserId);
    }
    await createAuditLog("referral_status_changed", "referral", referral.id, { status, reason });
    return res.json({ referral: adminReferralPayload(referral) });
  } catch (error) {
    console.error("Admin referral status update failed", publicError(error));
    return res.status(500).json({ error: "referral_status_update_failed" });
  }
});

app.get(["/admin/api/gift-codes", "/api/admin/gift-codes"], adminGiftLimiter, requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();
  const giftCodes = await prisma.giftCode.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { maskedCode: { contains: search.toUpperCase() } },
                { plan: { contains: search, mode: "insensitive" } },
                { recipientEmail: { contains: normalizeEmail(search), mode: "insensitive" } }
              ]
            }
          : {}
      ]
    },
    include: {
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: true, license: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return res.json({ giftCodes: giftCodes.map(adminGiftCodePayload), permissions: giftAdminPermissionSummary() });
});

app.get(["/admin/api/gift-codes/permissions", "/api/admin/gift-codes/permissions"], adminGiftLimiter, requireAdmin, async (_req, res) => {
  return res.json({ permissions: giftAdminPermissionSummary() });
});

app.post(["/admin/api/gift-codes/create", "/api/admin/gift-codes/create"], adminGiftLimiter, requireAdmin, async (req, res) => {
  try {
    const permissions = giftAdminPermissionSummary();
    if (!permissions.canCreateGiftCodes) {
      await auditGiftPermissionDenied(req, "canCreateGiftCodes");
      return denyGiftPermission(res, "canCreateGiftCodes");
    }
    const giftPlan = resolveGiftPlan(req.body);
    if (!giftPlan) return res.status(400).json({ error: "invalid_gift_plan" });
    if (giftPlan.id === "lifetime" && !permissions.canCreateLifetimeGifts) {
      await auditGiftPermissionDenied(req, "canCreateLifetimeGifts", { plan: giftPlan.id });
      return denyGiftPermission(res, "canCreateLifetimeGifts", "Lifetime gift creation is locked.");
    }
    const quantity = Math.max(toOptionalInt(req.body?.quantity) || 1, 1);
    const maxUses = Math.max(toOptionalInt(req.body?.maxUses) || 1, 1);
    if (quantity > 1 && !permissions.canBulkCreateGifts) {
      await auditGiftPermissionDenied(req, "canBulkCreateGifts", { quantity });
      return denyGiftPermission(res, "canBulkCreateGifts", "Bulk gift creation is locked.");
    }
    if (maxUses > 1 && !permissions.canBulkCreateGifts) {
      await auditGiftPermissionDenied(req, "canBulkCreateGifts", { maxUses });
      return denyGiftPermission(res, "canBulkCreateGifts", "Multi-use gift creation is locked.");
    }
    if (quantity > permissions.maxBulkQuantity) {
      return res.status(400).json({ error: "gift_quantity_limit_exceeded", maxQuantity: permissions.maxBulkQuantity });
    }
    if (maxUses > permissions.maxUses) {
      return res.status(400).json({ error: "gift_max_uses_limit_exceeded", maxUses: permissions.maxUses });
    }
    const dangerous = quantity > 1 || maxUses > 1 || giftPlan.id === "lifetime";
    if (dangerous && !hasGiftCreationConfirmation(req.body)) {
      return res.status(409).json({ error: "gift_creation_confirmation_required", message: "Confirm dangerous gift creation before continuing." });
    }
    const expiresAt = parseOptionalDate(req.body?.expiresAt);
    const recipientEmail = normalizeEmail(req.body?.recipientEmail);
    const recipientUserId = String(req.body?.recipientUserId || "").trim() || null;
    const requiresDiscord = false;
    const requiresRoblox = false;
    const notes = String(req.body?.notes || "").trim().slice(0, 1000) || null;
    const created = [];

    for (let index = 0; index < quantity; index += 1) {
      const code = await generateUniqueGiftCode();
      const giftCode = await prisma.giftCode.create({
        data: {
          codeHash: hashGiftCode(code),
          codeCipher: encryptToken(code),
          maskedCode: maskGiftCode(code),
          plan: giftPlan.id,
          status: "unused",
          maxUses,
          expiresAt,
          recipientEmail: isValidEmail(recipientEmail) ? recipientEmail : null,
          recipientUserId,
          requiresDiscord,
          requiresRoblox,
          createdByAdminId: "admin",
          notes
        }
      });
      created.push({
        ...adminGiftCodePayload({ ...giftCode, redemptions: [] }),
        code,
        plaintextAvailable: true,
        shownOnceOnly: true
      });
    }

    await createAuditLog("gift_codes_created", "gift_code", null, {
      quantity,
      plan: giftPlan.id,
      maxUses,
      expiresAt: expiresAt?.toISOString?.() || null,
      recipientEmail: isValidEmail(recipientEmail) ? recipientEmail : null
    });
    return res.status(201).json({ success: true, giftCodes: created });
  } catch (error) {
    console.error("Admin gift code create failed", publicError(error));
    return res.status(500).json({ error: "gift_code_create_failed" });
  }
});

app.post(["/admin/api/gift-codes/create-test", "/api/admin/gift-codes/create-test"], adminGiftLimiter, requireAdmin, async (req, res) => {
  try {
    const permissions = giftAdminPermissionSummary();
    if (!permissions.canCreateDisposableTestCodes) {
      await auditGiftPermissionDenied(req, "canCreateDisposableTestCodes");
      return denyGiftPermission(res, "canCreateDisposableTestCodes", "Disposable test gift creation is locked.");
    }
    const plan = resolveGiftPlan({ plan: req.body?.plan || "3days" });
    if (!plan) return res.status(400).json({ error: "invalid_plan" });
    if (plan.id === "lifetime" && !permissions.canCreateLifetimeGifts) {
      await auditGiftPermissionDenied(req, "canCreateLifetimeGifts", { plan: plan.id, disposable: true });
      return denyGiftPermission(res, "canCreateLifetimeGifts", "Lifetime test gift creation is locked.");
    }
    const code = await generateUniqueGiftCode();
    const giftCode = await prisma.giftCode.create({
      data: {
        codeHash: hashGiftCode(code),
        codeCipher: encryptToken(code),
        maskedCode: maskGiftCode(code),
        plan: plan.id,
        status: "unused",
        maxUses: 1,
        usedCount: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        requiresDiscord: false,
        requiresRoblox: false,
        notes: `source:disposable_test createdBy:admin plan:${plan.id} expires:24h`
      },
      include: {
        redemptions: {
          include: { user: true, license: true },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });
    await createAuditLog("test_gift_code_created", "gift_code", giftCode.id, {
      plan: plan.id,
      disposable: true
    });
    return res.status(201).json({
      success: true,
      disposable: true,
      giftCode: {
        ...adminGiftCodePayload(giftCode),
        code,
        plaintextAvailable: true,
        shownOnceOnly: true
      }
    });
  } catch (error) {
    console.error("Test gift code creation failed", publicError(error));
    return res.status(500).json({ error: "test_gift_code_create_failed" });
  }
});

app.post(["/admin/api/gift-codes/:id/revoke", "/api/admin/gift-codes/:id/revoke"], adminGiftLimiter, requireAdmin, async (req, res) => {
  const permissions = giftAdminPermissionSummary();
  if (!permissions.canRevokeGiftCodes) {
    await auditGiftPermissionDenied(req, "canRevokeGiftCodes", { giftCodeId: req.params.id });
    return denyGiftPermission(res, "canRevokeGiftCodes", "Gift revocation is locked.");
  }
  const existing = await prisma.giftCode.findUnique({ where: { id: req.params.id }, select: { notes: true } });
  if (!existing) return res.status(404).json({ error: "gift_code_not_found" });
  const giftCode = await prisma.giftCode.update({
    where: { id: req.params.id },
    data: {
      status: "revoked",
      notes: appendGiftSecurityNote(existing.notes, "revokedReason:unauthorized_public_gift_creation_exposure revokedBy:system/security_hotfix")
    },
    include: { redemptions: { include: { user: true, license: true } } }
  });
  await createAuditLog("gift_code_revoked", "gift_code", giftCode.id, {
    revokedReason: "unauthorized_public_gift_creation_exposure",
    revokedBy: "system/security_hotfix"
  });
  return res.json({ giftCode: adminGiftCodePayload(giftCode) });
});

app.get(["/admin/api/direct-packages", "/api/admin/direct-packages"], adminGiftLimiter, requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();
  const packages = await prisma.directGiftPackage.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { recipientEmail: { contains: normalizeEmail(search), mode: "insensitive" } },
                { plan: { contains: search, mode: "insensitive" } },
                { recipientUser: { is: { robloxUsername: { contains: search, mode: "insensitive" } } } },
                { recipientUser: { is: { discordUsername: { contains: search, mode: "insensitive" } } } }
              ]
            }
          : {}
      ]
    },
    include: { recipientUser: true, license: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return res.json({ packages: packages.map(adminDirectGiftPackagePayload) });
});

app.post(["/admin/api/direct-packages/send", "/api/admin/direct-packages/send"], adminGiftLimiter, requireAdmin, async (req, res) => {
  try {
    const permissions = giftAdminPermissionSummary();
    if (!permissions.canCreateGiftCodes) {
      await auditGiftPermissionDenied(req, "canCreateGiftCodes", { directGift: true });
      return denyGiftPermission(res, "canCreateGiftCodes", "Direct gift creation is locked.");
    }
    const giftPlan = resolveGiftPlan(req.body);
    if (!giftPlan) return res.status(400).json({ error: "invalid_gift_plan" });
    if (giftPlan.id === "lifetime" && !permissions.canCreateLifetimeGifts) {
      await auditGiftPermissionDenied(req, "canCreateLifetimeGifts", { plan: giftPlan.id, directGift: true });
      return denyGiftPermission(res, "canCreateLifetimeGifts", "Lifetime direct gift creation is locked.");
    }
    if (giftPlan.id === "lifetime" && !hasGiftCreationConfirmation(req.body)) {
      return res.status(409).json({ error: "gift_creation_confirmation_required", message: "Confirm lifetime direct gift creation before continuing." });
    }
    const email = normalizeEmail(req.body?.recipientEmail);
    if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_recipient_email" });
    const emailNormalized = normalizeAccountEmail(email);
    const recipient = await prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized }] } });
    if (!recipient) return res.status(404).json({ error: "recipient_account_not_found", message: "No account found with this email." });

    const packageRow = await prisma.directGiftPackage.create({
      data: {
        recipientEmail: normalizeEmail(recipient.email),
        recipientUserId: recipient.id,
        plan: giftPlan.id,
        status: "pending",
        requiresDiscord: false,
        requiresRoblox: false,
        sentByAdminId: "admin",
        message: String(req.body?.message || "").trim().slice(0, 1000) || null,
        notes: String(req.body?.notes || "").trim().slice(0, 1000) || null,
        claimExpiresAt: parseOptionalDate(req.body?.claimExpiresAt)
      },
      include: { recipientUser: true, license: true }
    });
    await createAuditLog("direct_gift_package_sent", "direct_gift_package", packageRow.id, {
      recipientEmail: maskEmail(recipient.email),
      plan: giftPlan.id
    });
    return res.status(201).json({ success: true, package: adminDirectGiftPackagePayload(packageRow) });
  } catch (error) {
    console.error("Admin direct package send failed", publicError(error));
    return res.status(500).json({ error: "direct_package_send_failed" });
  }
});

app.post(["/admin/api/direct-packages/:id/revoke", "/api/admin/direct-packages/:id/revoke"], adminGiftLimiter, requireAdmin, async (req, res) => {
  const permissions = giftAdminPermissionSummary();
  if (!permissions.canRevokeGiftCodes) {
    await auditGiftPermissionDenied(req, "canRevokeGiftCodes", { directGiftPackageId: req.params.id });
    return denyGiftPermission(res, "canRevokeGiftCodes", "Direct gift revocation is locked.");
  }
  const packageRow = await prisma.directGiftPackage.update({
    where: { id: req.params.id },
    data: { status: "revoked" },
    include: { recipientUser: true, license: true }
  });
  await createAuditLog("direct_gift_package_revoked", "direct_gift_package", packageRow.id, {});
  return res.json({ package: adminDirectGiftPackagePayload(packageRow) });
});

app.get(["/admin/api/users/search", "/api/admin/users/search"], requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.query.email || req.query.q);
  if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
  const emailNormalized = normalizeAccountEmail(email);
  const users = await prisma.user.findMany({
    where: { OR: [{ email }, { emailNormalized }] },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  return res.json({ users: users.map(publicUser) });
});

app.get("/admin/api/purchases", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  const purchases = await prisma.purchase.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { stripeCheckoutSessionId: { contains: search } },
                { stripePaymentIntentId: { contains: search } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { product: { name: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {}
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true, product: true }
  });
  res.json({ purchases });
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

function oauthCookieOptions() {
  const options = {
    httpOnly: true,
    secure: apiBaseUrl().startsWith("https"),
    sameSite: "lax",
    path: "/auth",
    maxAge: 10 * 60 * 1000
  };
  const domain = oauthCookieDomain();
  if (domain) options.domain = domain;
  return options;
}

function setOAuthCookie(res, name, value) {
  res.cookie(name, value, oauthCookieOptions());
}

function clearOAuthCookies(res) {
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth" });
  res.clearCookie(OAUTH_PKCE_COOKIE, { path: "/auth" });
  res.clearCookie(ROBLOX_OAUTH_COOLDOWN_COOKIE, { path: "/auth/roblox" });
  const domain = oauthCookieDomain();
  if (domain) {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth", domain });
    res.clearCookie(OAUTH_PKCE_COOKIE, { path: "/auth", domain });
    res.clearCookie(ROBLOX_OAUTH_COOLDOWN_COOKIE, { path: "/auth/roblox", domain });
  }
}

function oauthCookieDomain() {
  const configured = String(env("OAUTH_COOKIE_DOMAIN", "") || "").trim();
  if (configured) return configured;
  try {
    const apiHost = new URL(apiBaseUrl()).hostname;
    const frontHost = new URL(frontendUrl()).hostname;
    if (apiHost.endsWith(".fimamacro.com") && frontHost === "fimamacro.com") return ".fimamacro.com";
  } catch {
    return "";
  }
  return "";
}

function oauthSecret() {
  return env("SESSION_SECRET") || env("ADMIN_PASSWORD") || env("APP_ENCRYPTION_KEY") || "fima-dev-oauth-state";
}

function createOAuthState(provider, data = {}) {
  const payload = {
    provider,
    nonce: crypto.randomBytes(16).toString("base64url"),
    iat: Date.now(),
    exp: Date.now() + 10 * 60 * 1000,
    userId: data.userId || null,
    returnTo: safeFrontendPath(data.returnTo, "/dashboard/overview")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyOAuthState(queryState, cookieState, provider) {
  const state = String(queryState || "");
  if (!state || state !== String(cookieState || "")) throw new Error("invalid_oauth_state");
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("invalid_oauth_state_format");
  const expected = crypto.createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  if (!timingSafeTextEqual(signature, expected)) throw new Error("invalid_oauth_state_signature");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (payload.provider !== provider || payload.exp < Date.now()) throw new Error("expired_oauth_state");
  return payload;
}

function robloxOAuthPublicError(error) {
  const code = String(error?.code || error?.message || "");
  if (code.includes("429") || code.includes("rate_limit") || code.includes("rate limit")) return "roblox_rate_limited";
  if (code.includes("duplicate_oauth_callback") || code.includes("oauth_state_already_used")) return "duplicate_oauth_callback";
  if (code.includes("roblox_link_requires_login")) return "roblox_link_requires_login";
  if (code.includes("invalid_oauth_state") || code.includes("expired_oauth_state")) return "roblox_oauth_state_invalid";
  return "roblox_oauth_failed";
}

function safeFrontendPath(value, fallback = "/dashboard/overview") {
  const text = String(value || "").trim();
  if (!text || !text.startsWith("/") || text.startsWith("//")) return fallback;
  if (/[\r\n]/.test(text)) return fallback;
  return text.slice(0, 240);
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function finishRobloxOAuth(req, res, input) {
  const state = verifyOAuthState(input?.state, req.cookies?.[OAUTH_STATE_COOKIE], "roblox");
  rememberUsedRobloxOAuthState(String(input?.state || ""));
  const currentUser = await getOptionalUser(req, res);
  if (!currentUser || currentUser.id !== state.userId) {
    const error = new Error("roblox_link_requires_login");
    error.code = "roblox_link_requires_login";
    throw error;
  }

  const code = String(input?.code || "").trim();
  const verifier = String(req.cookies?.[OAUTH_PKCE_COOKIE] || "");
  if (!code || !verifier) {
    const error = new Error("missing_roblox_oauth_data");
    error.code = "missing_roblox_oauth_data";
    throw error;
  }

  const token = await exchangeRobloxCode(code, verifier);
  const profile = await fetchRobloxOidcProfile(token.access_token);
  const user = await linkRobloxAccount(currentUser.id, profile, token);
  await evaluateReferralForUser(user.id).catch((error) => {
    console.warn("Referral evaluation after Roblox link failed", { userId: user.id, ...publicError(error) });
  });
  await createAuditLog("roblox_account_linked", "user", user.id, { robloxUserId: profile.sub });
  clearOAuthCookies(res);
  return {
    user,
    redirectUrl: `${frontendUrl()}${state.returnTo || "/dashboard/overview"}?roblox=connected`
  };
}

function rememberUsedRobloxOAuthState(state) {
  const now = Date.now();
  for (const [key, expiresAt] of usedRobloxOAuthStates) {
    if (expiresAt <= now) usedRobloxOAuthStates.delete(key);
  }
  const digest = crypto.createHash("sha256").update(state).digest("hex");
  if (usedRobloxOAuthStates.has(digest)) {
    const error = new Error("duplicate_oauth_callback");
    error.code = "duplicate_oauth_callback";
    throw error;
  }
  usedRobloxOAuthStates.set(digest, now + 10 * 60 * 1000);
}

async function exchangeDiscordCode(code) {
  const redirectUri = env("DISCORD_REDIRECT_URI", `${apiBaseUrl()}/auth/discord/callback`);
  const body = new URLSearchParams({
    client_id: requiredEnv("DISCORD_CLIENT_ID"),
    client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const response = await fetchWithAbort("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  }, 8000);
  if (!response.ok) throw new Error(`discord_token_exchange_failed_${response.status}`);
  return response.json();
}

async function fetchDiscordProfile(accessToken) {
  const response = await fetchWithAbort("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 8000);
  if (!response.ok) throw new Error(`discord_profile_failed_${response.status}`);
  const profile = await response.json();
  if (!profile?.id) throw new Error("discord_profile_missing_id");
  return profile;
}

async function loginOrLinkDiscordAccount(profile, token, preferredUserId = null) {
  const discordUserId = String(profile.id);
  const discordUsername = profile.global_name || profile.username || discordUserId;
  const discordEmail = isValidEmail(profile.email) ? normalizeEmail(profile.email) : null;
  const discordAvatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUserId}/${profile.avatar}.png?size=128`
    : null;

  let user = preferredUserId
    ? await prisma.user.findUnique({ where: { id: preferredUserId } })
    : await prisma.user.findFirst({
        where: {
          OR: [
            { discordUserId },
            ...(discordEmail ? [{ email: discordEmail }, { emailNormalized: normalizeAccountEmail(discordEmail) }] : [])
          ]
        }
      });

  let created = false;
  if (!user) {
    if (!discordEmail) {
      const error = new Error("discord_email_required");
      error.code = "discord_email_required";
      throw error;
    }
    user = await prisma.user.create({
      data: {
        email: discordEmail,
        emailNormalized: normalizeAccountEmail(discordEmail),
        passwordHash: await hashPassword(randomToken()),
        stripeCustomerId: await createStripeCustomerIfPossible(discordEmail),
        discordUserId,
        discordUsername,
        discordEmail,
        discordAvatarUrl,
        emailVerifiedAt: profile.verified ? new Date() : null
      }
    });
    created = true;
    await ensureCustomer(discordEmail);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        discordUserId,
        discordUsername,
        discordEmail,
        discordAvatarUrl,
        emailVerifiedAt: user.emailVerifiedAt || (profile.verified ? new Date() : undefined)
      }
    });
  }

  await upsertOAuthLink(user.id, "discord", discordUserId, {
    providerUsername: discordUsername,
    providerEmail: discordEmail,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
    scopes: token.scope,
    metadata: { verified: Boolean(profile.verified), avatar: profile.avatar || null }
  });

  return { user, created };
}

async function getRobloxOidcDiscovery() {
  const issuer = env("ROBLOX_OIDC_ISSUER", "https://apis.roblox.com/oauth").replace(/\/+$/, "");
  const fallback = {
    authorization_endpoint: `${issuer}/v1/authorize`,
    token_endpoint: `${issuer}/v1/token`,
    userinfo_endpoint: `${issuer}/v1/userinfo`
  };
  try {
    const response = await fetchWithAbort(`${issuer}/.well-known/openid-configuration`, {}, 4000);
    if (!response.ok) return fallback;
    const discovery = await response.json();
    return {
      authorization_endpoint: discovery.authorization_endpoint || fallback.authorization_endpoint,
      token_endpoint: discovery.token_endpoint || fallback.token_endpoint,
      userinfo_endpoint: discovery.userinfo_endpoint || fallback.userinfo_endpoint
    };
  } catch {
    return fallback;
  }
}

async function exchangeRobloxCode(code, verifier) {
  const discovery = await getRobloxOidcDiscovery();
  const redirectUri = robloxRedirectUri();
  const body = new URLSearchParams({
    client_id: requiredEnv("ROBLOX_CLIENT_ID"),
    client_secret: requiredEnv("ROBLOX_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });
  const response = await fetchWithAbort(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  }, 8000);
  if (!response.ok) {
    const error = new Error(`roblox_token_exchange_failed_${response.status}`);
    error.code = response.status === 429 ? "roblox_rate_limited" : `roblox_token_exchange_failed_${response.status}`;
    throw error;
  }
  return response.json();
}

function robloxRedirectUri() {
  return env("ROBLOX_REDIRECT_URI", `${frontendUrl()}/auth/roblox/callback`);
}

async function fetchRobloxOidcProfile(accessToken) {
  const discovery = await getRobloxOidcDiscovery();
  const response = await fetchWithAbort(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 8000);
  if (!response.ok) throw new Error(`roblox_profile_failed_${response.status}`);
  const profile = await response.json();
  if (!profile?.sub) throw new Error("roblox_profile_missing_sub");
  return profile;
}

async function linkRobloxAccount(userId, profile, token) {
  const robloxUserId = String(profile.sub);
  const robloxUsername = profile.preferred_username || profile.nickname || profile.name || robloxUserId;
  const avatarUrl = await resolveRobloxAvatarUrl(robloxUserId).catch(() => null);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      robloxUserId,
      robloxUsername,
      robloxAvatarUrl: avatarUrl
    }
  });

  await upsertOAuthLink(user.id, "roblox", robloxUserId, {
    providerUsername: robloxUsername,
    providerEmail: null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
    scopes: token.scope,
    metadata: { name: profile.name || null }
  });

  return user;
}

async function resolveRobloxAvatarUrl(robloxUserId) {
  const url = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
  url.searchParams.set("userIds", String(robloxUserId));
  url.searchParams.set("size", "150x150");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "true");
  const response = await fetchWithAbort(url, {}, 3500);
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return safeUrl(data?.data?.[0]?.imageUrl);
}

async function upsertOAuthLink(userId, provider, providerSubject, data) {
  const expiresAt = data.expiresIn ? new Date(Date.now() + Number(data.expiresIn) * 1000) : null;
  return prisma.oAuthLink.upsert({
    where: { provider_providerSubject: { provider, providerSubject } },
    create: {
      userId,
      provider,
      providerSubject,
      providerUsername: data.providerUsername || null,
      providerEmail: data.providerEmail || null,
      accessTokenCipher: encryptToken(data.accessToken),
      refreshTokenCipher: encryptToken(data.refreshToken),
      tokenExpiresAt: expiresAt,
      scopes: data.scopes || null,
      metadata: data.metadata || null
    },
    update: {
      userId,
      providerUsername: data.providerUsername || null,
      providerEmail: data.providerEmail || null,
      accessTokenCipher: encryptToken(data.accessToken),
      refreshTokenCipher: encryptToken(data.refreshToken),
      tokenExpiresAt: expiresAt,
      scopes: data.scopes || null,
      metadata: data.metadata || null
    }
  });
}

function encryptToken(value) {
  const text = String(value || "");
  const keySource = env("APP_ENCRYPTION_KEY");
  if (!text || !keySource) return null;
  const key = crypto.createHash("sha256").update(keySource).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(cipherText) {
  const text = String(cipherText || "");
  const keySource = env("APP_ENCRYPTION_KEY");
  if (!text || !keySource) return null;
  const [version, ivText, tagText, encryptedText] = text.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return null;
  try {
    const key = crypto.createHash("sha256").update(keySource).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

async function createManualRobuxSubmission(user, body) {
  const plan = getPlan(body?.plan);
  if (!plan) {
    const error = new Error("invalid_plan");
    error.code = "invalid_plan";
    error.statusCode = 400;
    throw error;
  }

  const premiumPlus = typeof body?.premiumPlus === "boolean" ? body.premiumPlus : null;
  const robuxAmount = toOptionalInt(body?.robuxAmount);
  const discordUserId = String(body?.discordUserId || user.discordUserId || "").trim() || null;
  const robloxUsername = String(body?.robloxUsername || user.robloxUsername || "").trim().slice(0, 80) || null;

  const submission = await prisma.paymentSubmission.create({
    data: {
      userId: user.id,
      plan: plan.id,
      customerEmail: user.email,
      discordUserId,
      discordUsername: String(body?.discordUsername || user.discordUsername || "").trim().slice(0, 80) || null,
      robloxUserId: String(body?.robloxUserId || user.robloxUserId || "").trim().slice(0, 80) || null,
      robloxUsername,
      premiumPlus,
      robuxAmount,
      proofUrl: safeUrl(body?.proofUrl) || null,
      proofText: String(body?.proofText || "").trim().slice(0, 3000) || null,
      notes: String(body?.notes || "").trim().slice(0, 1000) || null
    },
    include: { user: true }
  });

  await createAuditLog("manual_robux_submitted", "payment_submission", submission.id, {
    userId: user.id,
    plan: plan.id,
    discordLinked: Boolean(discordUserId),
    robloxUsername
  });
  return submission;
}

function publicPaymentSubmission(submission) {
  return {
    id: submission.id,
    userId: submission.userId,
    type: submission.type,
    status: submission.status,
    plan: submission.plan,
    customerEmail: submission.customerEmail,
    discordUserId: submission.discordUserId,
    discordUsername: submission.discordUsername,
    robloxUserId: submission.robloxUserId,
    robloxUsername: submission.robloxUsername,
    premiumPlus: submission.premiumPlus,
    robuxAmount: submission.robuxAmount,
    proofUrl: submission.proofUrl,
    proofText: submission.proofText,
    notes: submission.notes,
    reviewedBy: submission.reviewedBy,
    reviewedAt: submission.reviewedAt,
    createdAt: submission.createdAt,
    user: submission.user ? publicUser(submission.user) : null
  };
}

async function reviewManualRobuxSubmission(req, res, status) {
  try {
    const submission = await prisma.paymentSubmission.update({
      where: { id: req.params.id },
      data: {
        status,
        reviewedBy: "admin",
        reviewedAt: new Date(),
        notes: req.body?.notes ? String(req.body.notes).slice(0, 1000) : undefined
      },
      include: { user: true }
    });

    let roleResult = null;
    if (status === "approved" && submission.discordUserId) {
      roleResult = await giveDiscordRole(submission.discordUserId, "buyer").catch((error) => ({
        success: false,
        error: error.code || error.message
      }));
    }

    await createAuditLog(`manual_robux_${status}`, "payment_submission", submission.id, {
      discordRole: roleResult,
      plan: submission.plan
    });
    return res.json({ success: true, submission: publicPaymentSubmission(submission), discordRole: roleResult });
  } catch (error) {
    console.error("Manual Robux review failed", publicError(error));
    return res.status(500).json({ error: error.code || "manual_payment_review_failed", message: error.message });
  }
}

async function adminDiscordRoleAction(req, res, type, action) {
  try {
    const discordUserId = await resolveDiscordUserIdFromBody(req.body || {});
    const result = action === "add"
      ? await giveDiscordRole(discordUserId, type)
      : await removeDiscordRole(discordUserId, type);
    await createAuditLog(`discord_${type}_role_${action}`, "discord_user", discordUserId, result);
    return res.json({ success: true, result });
  } catch (error) {
    console.error("Discord role action failed", publicError(error));
    return res.status(500).json({ error: error.code || "discord_role_action_failed", message: error.message });
  }
}

async function resolveDiscordUserIdFromBody(body) {
  const direct = String(body?.discordUserId || "").trim();
  if (direct) return direct;
  const userId = String(body?.userId || "").trim();
  const email = normalizeEmail(body?.email);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : email
      ? await prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized: normalizeAccountEmail(email) }] } })
      : null;
  if (user?.discordUserId) return user.discordUserId;
  const error = new Error("discord_user_not_linked");
  error.code = "discord_user_not_linked";
  throw error;
}

async function syncDiscordRoles(body) {
  const singleDiscordUserId = String(body?.discordUserId || "").trim();
  const singleUserId = String(body?.userId || "").trim();
  const users = singleDiscordUserId
    ? [{ id: null, discordUserId: singleDiscordUserId, email: null }]
    : await prisma.user.findMany({
        where: {
          discordUserId: { not: null },
          ...(singleUserId ? { id: singleUserId } : {})
        },
        take: singleUserId ? 1 : 200
      });

  const results = [];
  for (const user of users) {
    const discordUserId = user.discordUserId;
    if (!discordUserId) continue;
    const access = user.id ? await userAccessSummary(user) : { buyer: true, trial: false };
    const row = { userId: user.id, discordUserId, buyer: null, trial: null };

    if (access.buyer) row.buyer = await giveDiscordRole(discordUserId, "buyer").catch((error) => ({ success: false, error: error.code || error.message }));
    else row.buyer = await removeDiscordRole(discordUserId, "buyer").catch((error) => ({ success: false, error: error.code || error.message }));

    if (access.trial) row.trial = await giveDiscordRole(discordUserId, "trial").catch((error) => ({ success: false, error: error.code || error.message }));
    else row.trial = await removeDiscordRole(discordUserId, "trial").catch((error) => ({ success: false, error: error.code || error.message }));

    results.push(row);
  }
  return { results };
}

async function userAccessSummary(user) {
  const now = new Date();
  const licenses = await prisma.license.findMany({
    where: { customerEmail: user.email },
    select: { plan: true, status: true, lifetime: true, expiresAt: true, notes: true }
  });
  const buyer = licenses.some((license) =>
    license.status === "active" &&
    (license.lifetime || !license.expiresAt || license.expiresAt > now)
  );
  const trial = licenses.some((license) =>
    license.status === "active" &&
    String(license.notes || "").toLowerCase().includes("trial") &&
    (license.lifetime || !license.expiresAt || license.expiresAt > now)
  );
  return { buyer, trial };
}

async function cleanupExpiredMonthlyTrials() {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      trialStatus: "active",
      trialExpiresAt: { lte: now }
    },
    take: 100
  }).catch((error) => {
    console.warn("Monthly trial cleanup query failed", publicError(error));
    return [];
  });

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { trialStatus: "expired" }
    }).catch((error) => {
      console.warn("Monthly trial cleanup status update failed", { userId: user.id, ...publicError(error) });
    });
    if (user.discordUserId) {
      await removeDiscordRole(user.discordUserId, "trial").catch((error) => {
        console.warn("Monthly trial cleanup Discord role removal failed", { userId: user.id, ...publicError(error) });
      });
    }
    await createAuditLog("monthly_trial_expired", "user", user.id, {
      trialExpiresAt: user.trialExpiresAt?.toISOString?.() || null
    });
  }
}

app.get([
  "/downloads/FIMA.MACRO.Setup.exe",
  "/downloads/FIMA%20MACRO%20Setup.exe",
  "/downloads/FIMA MACRO Setup.exe",
  "/FIMA.MACRO.Setup.exe",
  "/FIMA MACRO Setup.exe"
], (_req, res) => {
  res.redirect(302, PUBLIC_SETUP_DOWNLOAD_URL);
});

app.get([
  "/downloads/FIMA.MACRO.App.zip",
  "/downloads/FIMA%20MACRO%20App.zip",
  "/downloads/FIMA MACRO App.zip",
  "/FIMA.MACRO.App.zip",
  "/FIMA MACRO App.zip"
], (_req, res) => {
  res.redirect(302, PUBLIC_APP_PACKAGE_URL);
});

app.get(["/dashboard", "/dashboard/overview"], (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get([
  "/dashboard/products",
  "/dashboard/billing",
  "/dashboard/redeem",
  "/dashboard/gifts",
  "/dashboard/referrals",
  "/dashboard/connected-accounts",
  "/dashboard/security",
  "/dashboard/downloads",
  "/dashboard/support",
  "/dashboard/settings"
], (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

const cleanHtmlRedirects = new Map([
  ["/index.html", "/"],
  ["/download.html", "/download"],
  ["/pricing.html", "/pricing"],
  ["/macros.html", "/macros"],
  ["/features.html", "/features"],
  ["/faq.html", "/faq"],
  ["/support.html", "/support"],
  ["/security.html", "/security"],
  ["/legal.html", "/legal"],
  ["/login.html", "/login"],
  ["/register.html", "/register"],
  ["/forgot-password.html", "/forgot-password"],
  ["/reset-password.html", "/reset-password"],
  ["/dashboard.html", "/dashboard/overview"],
  ["/my-products.html", "/dashboard/products"],
  ["/store.html", "/store"],
  ["/success.html", "/success"],
  ["/payment-success.html", "/success"],
  ["/payment-cancelled.html", "/payment-cancelled"]
]);

for (const [legacyPath, cleanPath] of cleanHtmlRedirects) {
  app.get(legacyPath, (req, res) => {
    const queryIndex = req.url.indexOf("?");
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
    res.redirect(301, cleanPath + query);
  });
}

app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const normalized = filePath.replace(/\\/g, "/");
    const extension = path.extname(filePath).toLowerCase();
    if (normalized.endsWith("/latest.json")) {
      res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
      return;
    }
    if (extension === ".html") {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
      return;
    }
    if ([".mp4", ".webm", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf"].includes(extension)) {
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=2592000");
      return;
    }
    if ([".css", ".js", ".mjs"].includes(extension)) {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      return;
    }
    if ([".zip", ".exe", ".msi"].includes(extension)) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(port, () => {
  console.log(`Fima payments API listening on ${port}`);
  console.info("Stripe configuration", stripeStatus());
  logSecurityStartupReadiness();
  startDiscordBot();
  cleanupExpiredMonthlyTrials().catch((error) => {
    console.warn("Monthly trial cleanup failed", publicError(error));
  });
  setInterval(() => {
    cleanupExpiredMonthlyTrials().catch((error) => {
      console.warn("Monthly trial cleanup failed", publicError(error));
    });
  }, MONTHLY_TRIAL_CLEANUP_MS).unref?.();
  validateConfiguredStripePrices().catch((error) => {
    console.warn("Stripe price env validation failed", publicError(error));
  });
  runSecurityE2EJobOnce({ port, logger: console, backendVersion, backendCommit }).catch((error) => {
    console.error("Security E2E one-time job crashed", publicError(error));
  });
  runOwnerLifetimeGrantJobOnce({ logger: console, backendVersion, backendCommit }).catch((error) => {
    console.error("Owner lifetime grant one-time job crashed", publicError(error));
  });
});

function stripe() {
  const key = requiredEnv("STRIPE_SECRET_KEY").trim();
  assertStripeSecretKeyAllowed(key, env("STRIPE_MODE", "auto"));
  return new Stripe(key);
}

function stripeWithKey(key, expectedMode) {
  assertStripeSecretKeyAllowed(key, expectedMode);
  return new Stripe(String(key || "").trim());
}

function stripeStatus() {
  return {
    ...stripeConfigSummary(stripePriceEnvNames),
    priceValidation: lastStripePriceValidation
  };
}

function versionPayload() {
  return {
    status: "ok",
    app: env("APP_NAME", "Fima Macro"),
    version: backendVersion,
    backendVersion,
    legacyAppVersionEnv: legacyAppVersionEnv || null,
    commit: backendCommit,
    buildTime,
    mode: env("NODE_ENV", "development")
  };
}

function runtimeTrialPromoEnvStatus() {
  const promo = getTrialPromoConfig(process.env, new Date());
  return {
    hasTrialPromoEnabled: Boolean(env("TRIAL_PROMO_ENABLED")),
    hasTrialPromoDays: Boolean(env("TRIAL_PROMO_DAYS")),
    hasNormalTrialDays: Boolean(env("NORMAL_TRIAL_DAYS")),
    hasTrialPromoEndAt: Boolean(env("TRIAL_PROMO_END_AT")),
    parsedTrialPromoEnabled: promo.enabled,
    parsedTrialPromoDays: promo.promoDays,
    parsedNormalTrialDays: promo.normalDays,
    parsedTrialPromoEndAt: promo.endAtIso,
    active: promo.active,
    currentTrialDays: promo.currentTrialDays,
    currentServerTimeUtc: new Date().toISOString(),
    serviceVersion: backendVersion,
    commit: backendCommit,
    nodeEnv: env("NODE_ENV", "development")
  };
}

function runtimeEntitlementEnvStatus() {
  const readiness = productionSecurityReadiness(process.env);
  return {
    hasEntitlementSigningSecret: readiness.entitlement.present,
    hasDownloadSigningSecret: readiness.download.present,
    hasUpdateManifestSigningSecret: readiness.updateManifest.present,
    entitlementSigningSecretConfigured: readiness.entitlement.configured,
    downloadSigningSecretConfigured: readiness.download.configured,
    updateManifestSigningSecretConfigured: readiness.updateManifest.configured,
    entitlementLifetimeMinutes: readiness.entitlement.lifetimeMinutes,
    sessionVersionConfigured: readiness.entitlement.sessionVersionConfigured,
    dangerousFeaturesRefuseEntitlement: readiness.dangerousFeaturesRefuseEntitlement,
    protectedDownloadsDisabled: readiness.protectedDownloadsDisabled,
    currentServerTimeUtc: new Date().toISOString(),
    serviceVersion: backendVersion,
    commit: backendCommit,
    nodeEnv: env("NODE_ENV", "development")
  };
}

function logSecurityStartupReadiness() {
  const readiness = productionSecurityReadiness(process.env);
  if (readiness.production && !readiness.entitlement.configured) {
    console.error("SECURITY CONFIGURATION ERROR: ENTITLEMENT_SIGNING_SECRET is missing or too short; app entitlement issuance is disabled.");
  }
  if (readiness.production && !readiness.download.configured) {
    console.error("SECURITY CONFIGURATION ERROR: DOWNLOAD_SIGNING_SECRET is missing or too short; protected download tokens are disabled.");
  }
  if (readiness.production && !readiness.updateManifest.configured) {
    console.error("SECURITY CONFIGURATION WARNING: UPDATE_MANIFEST_SIGNING_SECRET is missing or too short; server-side manifest signing is unavailable.");
  }
}

function securityFlagEnabled(...names) {
  return names.some((name) => isTruthy(env(name, "false")));
}

function adminPanelEnabled() {
  return securityFlagEnabled("ADMIN_PANEL_ENABLED");
}

function adminMutationsEnabled() {
  return adminPanelEnabled() && securityFlagEnabled("ADMIN_MUTATIONS_ENABLED");
}

function adminDebugEndpointsEnabled() {
  return adminPanelEnabled() && securityFlagEnabled("ADMIN_DEBUG_ENDPOINTS_ENABLED");
}

function emergencyAdminSecurityGate(req, res, next) {
  const routePath = String(req.path || "");
  if (!isAdminSurfacePath(routePath)) return next();

  const authenticated = isAdminAuthenticated(req);
  if (!adminPanelEnabled()) {
    return rejectEmergencyAdminRoute(req, res, authenticated, "admin_panel_disabled", "ADMIN_PANEL_ENABLED");
  }

  if (isAdminDebugPath(routePath) && !adminDebugEndpointsEnabled()) {
    return rejectEmergencyAdminRoute(req, res, authenticated, "admin_debug_endpoints_disabled", "ADMIN_DEBUG_ENDPOINTS_ENABLED");
  }

  if (isAdminMutationRequest(req, routePath) && !adminMutationsEnabled()) {
    return rejectEmergencyAdminRoute(req, res, authenticated, "admin_mutations_disabled", "ADMIN_MUTATIONS_ENABLED");
  }

  return next();
}

function isAdminSurfacePath(routePath) {
  return routePath === "/admin" ||
    routePath.startsWith("/admin/") ||
    routePath.startsWith("/api/admin/") ||
    routePath === "/cloud-admin" ||
    routePath.startsWith("/cloud-admin/") ||
    routePath === "/gift-admin" ||
    routePath.startsWith("/gift-admin/") ||
    routePath.startsWith("/payments/robux/manual/");
}

function isAdminDebugPath(routePath) {
  return /\/(?:system|backup|runtime|debug|test|health\/bot|bot\/health|trial-reset|stripe\/setup|stripe\/test)/i.test(routePath);
}

function isAdminMutationRequest(req, routePath) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (routePath === "/admin/login" || routePath === "/admin/logout") return false;
  return isAdminSurfacePath(routePath);
}

function rejectEmergencyAdminRoute(req, res, authenticated, reason, requiredFlag) {
  const status = authenticated ? 403 : 401;
  const payload = {
    error: reason,
    message: "Admin functionality is temporarily locked during security containment.",
    requiredFlag
  };
  createAuditLog("admin_emergency_lockdown_blocked", "admin", null, {
    reason,
    requiredFlag,
    path: req.originalUrl,
    method: req.method,
    authenticated,
    ip: req.ip,
    userAgent: String(req.get("user-agent") || "").slice(0, 160)
  });
  if (req.path.startsWith("/admin") && !req.path.startsWith("/admin/api") && !req.is("application/json")) {
    return res.status(status).type("html").send("<!doctype html><title>Admin locked</title><h1>Admin locked</h1><p>Admin functionality is temporarily locked during security containment.</p>");
  }
  return res.status(status).json(payload);
}

function adminLoginKey(req) {
  return String(req.ip || req.get("x-forwarded-for") || "unknown").split(",")[0].trim() || "unknown";
}

function adminLoginLockState(key) {
  const now = Date.now();
  const state = adminFailedLoginState.get(key);
  if (!state) return { locked: false };
  if (state.lockedUntil && state.lockedUntil > now) return { locked: true, lockedUntil: state.lockedUntil };
  if (state.lockedUntil && state.lockedUntil <= now) {
    adminFailedLoginState.delete(key);
    return { locked: false };
  }
  return { locked: false };
}

function recordAdminLoginFailure(key) {
  const now = Date.now();
  const windowMs = 30 * 60 * 1000;
  const maxFailures = 5;
  const existing = adminFailedLoginState.get(key);
  const state = existing && existing.firstFailedAt + windowMs > now
    ? existing
    : { count: 0, firstFailedAt: now, lockedUntil: null };
  state.count += 1;
  if (state.count >= maxFailures) state.lockedUntil = now + windowMs;
  adminFailedLoginState.set(key, state);
}

function clearAdminLoginFailure(key) {
  adminFailedLoginState.delete(key);
}

function adminPasswordMeetsEmergencyPolicy(password) {
  const value = String(password || "");
  return value.length >= 16 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value);
}

function giftAdminPermissionSummary() {
  const createEnabled = adminMutationsEnabled() && securityFlagEnabled("GIFT_ADMIN_ENABLED", "FIMA_GIFT_CODES_CREATE_ENABLED");
  const bulkEnabled = createEnabled && securityFlagEnabled("BULK_GIFT_ENABLED", "FIMA_GIFT_CODES_BULK_ENABLED");
  const maxBulkQuantity = Math.min(Math.max(toOptionalInt(env("FIMA_GIFT_CODES_MAX_BULK_QUANTITY")) || 1, 1), 25);
  const maxUses = Math.min(Math.max(toOptionalInt(env("FIMA_GIFT_CODES_MAX_USES")) || 1, 1), 25);
  return {
    canCreateGiftCodes: createEnabled,
    canCreateDisposableTestCodes: createEnabled && securityFlagEnabled("DISPOSABLE_GIFT_ENABLED", "FIMA_GIFT_CODES_TEST_ENABLED"),
    canCreateLifetimeGifts: createEnabled && securityFlagEnabled("LIFETIME_GIFT_ENABLED", "FIMA_GIFT_CODES_LIFETIME_ENABLED"),
    canBulkCreateGifts: bulkEnabled,
    canRevokeGiftCodes: adminMutationsEnabled() && securityFlagEnabled("GIFT_ADMIN_ENABLED", "FIMA_GIFT_CODES_REVOKE_ENABLED"),
    canViewGiftAuditLogs: adminPanelEnabled() && securityFlagEnabled("GIFT_ADMIN_ENABLED", "FIMA_GIFT_CODES_AUDIT_ENABLED"),
    maxBulkQuantity: bulkEnabled ? maxBulkQuantity : 1,
    maxUses: bulkEnabled ? maxUses : 1,
    creationLocked: !createEnabled,
    permissionsSource: "service_env_flags",
    requiredEnvFlags: {
      adminPanel: "ADMIN_PANEL_ENABLED",
      adminMutations: "ADMIN_MUTATIONS_ENABLED",
      create: "FIMA_GIFT_CODES_CREATE_ENABLED",
      createAlias: "GIFT_ADMIN_ENABLED",
      disposableTest: "FIMA_GIFT_CODES_TEST_ENABLED",
      disposableTestAlias: "DISPOSABLE_GIFT_ENABLED",
      lifetime: "FIMA_GIFT_CODES_LIFETIME_ENABLED",
      lifetimeAlias: "LIFETIME_GIFT_ENABLED",
      bulk: "FIMA_GIFT_CODES_BULK_ENABLED",
      bulkAlias: "BULK_GIFT_ENABLED",
      revoke: "FIMA_GIFT_CODES_REVOKE_ENABLED"
    }
  };
}

function denyGiftPermission(res, permission, message = "Gift-code administration is locked. Ask a super-admin to enable the required permission.") {
  return res.status(403).json({
    error: "gift_permission_denied",
    permission,
    message
  });
}

async function auditGiftPermissionDenied(req, permission, metadata = {}) {
  await createAuditLog("gift_permission_denied", "gift_code", null, {
    permission,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: String(req.get("user-agent") || "").slice(0, 160),
    ...metadata
  });
}

function hasGiftCreationConfirmation(body) {
  const value = body?.confirmGiftCreation ?? body?.confirmDangerousGiftCreation ?? body?.confirmed;
  return value === true || ["1", "true", "yes", "on", "confirmed"].includes(String(value || "").trim().toLowerCase());
}

function appendGiftSecurityNote(notes, note) {
  const existing = String(notes || "").trim();
  const next = `[${new Date().toISOString()}] ${note}`;
  return [existing, next].filter(Boolean).join("\n").slice(0, 1000);
}

function safeGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

async function auditRuntimeAdmin(req, action) {
  await createAuditLog(action, "admin_runtime", null, {
    path: req.originalUrl,
    ip: req.ip,
    userAgent: String(req.get("user-agent") || "").slice(0, 160)
  });
}

function requireRuntimeAdminKey(req, res, next) {
  const expected = env("FIMA_ADMIN_API_KEY", env("ADMIN_API_KEY", "")).trim();
  if (!expected) {
    return res.status(503).json({ error: "admin_api_key_not_configured" });
  }

  const headerKey = String(req.get("x-admin-api-key") || "").trim();
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const provided = headerKey || bearer;
  if (!provided) {
    return res.status(401).json({ error: "admin_api_key_required" });
  }

  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  if (expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
    return res.status(403).json({ error: "admin_api_key_invalid" });
  }

  return next();
}

async function buildTrialLicenseBackupExport() {
  const createdAt = new Date().toISOString();
  const auditWhere = {
    OR: [
      { action: { contains: "trial", mode: "insensitive" } },
      { action: { contains: "license", mode: "insensitive" } },
      { action: { contains: "hwid", mode: "insensitive" } },
      { action: { contains: "gift", mode: "insensitive" } },
      { action: { contains: "subscription", mode: "insensitive" } },
      { action: { contains: "download", mode: "insensitive" } },
      { action: { contains: "payment", mode: "insensitive" } }
    ]
  };

  const [
    users,
    licenses,
    orders,
    customers,
    giftCodes,
    giftRedemptions,
    directGiftPackages,
    purchases,
    products,
    productPrices,
    paymentSubmissions,
    oauthLinks,
    referrals,
    referralRewards,
    validationLogs,
    downloadLogs,
    webhookEvents,
    auditLogs
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        emailNormalized: true,
        stripeCustomerId: true,
        discordUserId: true,
        discordUsername: true,
        discordEmail: true,
        robloxUsername: true,
        robloxUserId: true,
        emailVerifiedAt: true,
        trialUsedAt: true,
        trialExpiresAt: true,
        nextTrialAvailableAt: true,
        trialStatus: true,
        monthlyTrialClaimCount: true,
        role: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.license.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.order.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.customer.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.giftCode.findMany({
      select: {
        id: true,
        codeHash: true,
        maskedCode: true,
        plan: true,
        status: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        buyerUserId: true,
        buyerEmail: true,
        buyerDiscordId: true,
        buyerRobloxId: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        purchasedAt: true,
        recipientEmail: true,
        recipientUserId: true,
        requiresDiscord: true,
        requiresRoblox: true,
        createdByAdminId: true,
        notes: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.giftRedemption.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.directGiftPackage.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.purchase.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.productPrice.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.paymentSubmission.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.oAuthLink.findMany({
      select: {
        id: true,
        userId: true,
        provider: true,
        providerSubject: true,
        providerUsername: true,
        providerEmail: true,
        tokenExpiresAt: true,
        scopes: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.referral.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.referralReward.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.validationLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.downloadLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.webhookEvent.findMany({
      select: {
        id: true,
        stripeEventId: true,
        type: true,
        processed: true,
        errorMessage: true,
        relatedOrderId: true,
        relatedLicenseId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "asc" } })
  ]);

  const records = {
    users,
    licenses,
    orders,
    customers,
    giftCodes,
    giftRedemptions,
    directGiftPackages,
    purchases,
    products,
    productPrices,
    paymentSubmissions,
    oauthLinks,
    referrals,
    referralRewards,
    validationLogs,
    downloadLogs,
    webhookEvents,
    auditLogs
  };
  const recordCounts = Object.fromEntries(Object.entries(records).map(([key, rows]) => [key, rows.length]));
  const exportCore = {
    success: true,
    artifact: "trial-license-export",
    schemaVersion: 1,
    createdAt,
    backend: versionPayload(),
    exportType: "targeted_trial_license_backup",
    includedCollections: Object.keys(records),
    recordCounts,
    totalRecords: Object.values(recordCounts).reduce((sum, count) => sum + count, 0),
    secretsIncluded: false,
    excludedSensitiveFields: [
      "User.passwordHash",
      "UserSession.tokenHash",
      "PasswordResetToken.tokenHash",
      "EmailVerificationToken.tokenHash",
      "OAuthLink.accessTokenCipher",
      "OAuthLink.refreshTokenCipher",
      "GiftCode.codeCipher",
      "environment variables and API keys"
    ],
    paidLicensesIncludedForSafety: true,
    paidLicensesWillBeModified: false,
    restoreNotes: [
      "This is a targeted JSON export for trial/license rollback analysis before the beta 7-day trial reset.",
      "Use license IDs, user IDs, emails, HWIDs, trial fields and audit rows to inspect or reverse trial eligibility changes.",
      "Do not publish this file; it contains user/license linkage data needed for recovery."
    ],
    records
  };
  const checksumSha256 = crypto.createHash("sha256").update(JSON.stringify(exportCore)).digest("hex");
  return { ...exportCore, checksumSha256 };
}

function firstConfiguredEnv(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return { name, value };
  }
  return { name: names[0], value: "" };
}

function stripeRuntimeMode() {
  const keyMode = stripeKeyMode(env("STRIPE_SECRET_KEY"));
  if (keyMode === "live" || keyMode === "test") return keyMode;
  return "unknown";
}

function stripePriceBootstrapEnabled() {
  return String(env("STRIPE_PRICE_BOOTSTRAP_ENABLED", "true")).trim().toLowerCase() !== "false";
}

async function buildPaymentSetupStatus({ validate = false } = {}) {
  const config = await getStripeRuntimePriceConfig();
  let stripeClient = null;
  const secretPresent = Boolean(env("STRIPE_SECRET_KEY"));
  const mode = stripeRuntimeMode();
  if (validate && secretPresent) {
    try {
      stripeClient = stripe();
    } catch (error) {
      stripeClient = null;
    }
  }

  const plans = {};
  for (const planId of publicCheckoutPlanIds()) {
    const plan = getPlan(planId);
    const commerce = getPlanCommerce(plan);
    const envPriceId = env(commerce.priceEnv, "");
    const runtimeRow = config.prices?.[plan.id] || null;
    const envState = stripePriceEnvState(envPriceId);
    const runtimeState = stripePriceEnvState(runtimeRow?.priceId);
    const source = envState === "set" ? "env" : runtimeState === "set" ? "db_runtime_config" : "missing";
    let validation = null;
    if (stripeClient && source !== "missing") {
      const candidate = source === "env" ? envPriceId : runtimeRow.priceId;
      validation = sanitizePriceCheck(await validateStripePriceForPlan(stripeClient, plan, candidate, commerce));
    }
    plans[plan.id] = {
      plan: plan.id,
      label: plan.name,
      envName: commerce.priceEnv,
      envPriceConfigured: envState === "set",
      runtimeConfigPriceConfigured: runtimeState === "set",
      configured: envState === "set" || runtimeState === "set",
      source,
      mode: runtimeRow?.mode || mode,
      expected: expectedPriceForPlan(plan, commerce),
      maskedPriceId: source === "env" ? maskStripeId(envPriceId) : maskStripeId(runtimeRow?.priceId),
      lastResolvedAt: runtimeRow?.lastResolvedAt || null,
      validation
    };
  }

  return {
    success: true,
    stripeSecretPresent: secretPresent,
    stripeWebhookSecretPresent: Boolean(env("STRIPE_WEBHOOK_SECRET")),
    mode,
    bootstrapEnabled: stripePriceBootstrapEnabled(),
    envPriceIdsPresent: PUBLIC_REQUIRED_PRICE_ENVS.every((name) => stripePriceEnvState(env(name, "")) === "set"),
    dbRuntimeConfigFallbackCreated: Object.values(config.prices || {}).some((row) => stripePriceEnvState(row?.priceId) === "set"),
    lastBootstrapAt: config.lastBootstrapAt || null,
    lastSafeErrorCode: config.lastSafeErrorCode || null,
    prices: plans,
    fullSecretsExposed: false,
    fullPriceIdsExposed: false
  };
}

async function resolveStripePriceForCheckout(stripeClient, plan, commerce, options = {}) {
  const attempts = [];
  const candidatePriceId = String(options.candidatePriceId || "").trim();
  if (candidatePriceId) {
    const envCheck = await validateStripePriceForPlan(stripeClient, plan, candidatePriceId, commerce);
    recordStripePriceCheck(envCheck);
    attempts.push({ source: options.candidateSource || "env", check: sanitizePriceCheck(envCheck), maskedPriceId: maskStripeId(candidatePriceId) });
    if (envCheck.ok) {
      await persistStripeRuntimePriceRows([{
        plan: plan.id,
        envName: commerce.priceEnv,
        priceId: candidatePriceId,
        productId: null,
        productCreated: false,
        priceCreated: false,
        amount: commerce.priceCents,
        currency: commerce.currency,
        type: plan.subscription ? "recurring" : "one_time",
        interval: plan.subscription ? "month" : null
      }], { mode: stripeRuntimeMode(), source: "env_validated" });
      return { plan: plan.id, priceId: candidatePriceId, source: "env", check: envCheck, attempts };
    }
    console.warn("Stripe price env invalid", sanitizePriceCheck(envCheck));
  } else {
    const missingCheck = {
      ok: false,
      plan: plan.id,
      priceEnv: commerce.priceEnv,
      status: "missing_env",
      expected: expectedPriceForPlan(plan, commerce)
    };
    recordStripePriceCheck(missingCheck);
    attempts.push({ source: "env", check: sanitizePriceCheck(missingCheck), maskedPriceId: null });
    console.warn("Stripe price env missing", sanitizePriceCheck(missingCheck));
  }

  const runtimeConfig = await getStripeRuntimePriceConfig();
  const runtimeRow = runtimeConfig.prices?.[plan.id] || null;
  if (runtimeRow?.priceId) {
    const runtimeCheck = await validateStripePriceForPlan(stripeClient, plan, runtimeRow.priceId, commerce);
    recordStripePriceCheck(runtimeCheck);
    attempts.push({ source: "db_runtime_config", check: sanitizePriceCheck(runtimeCheck), maskedPriceId: maskStripeId(runtimeRow.priceId) });
    if (runtimeCheck.ok) {
      return { plan: plan.id, priceId: runtimeRow.priceId, source: "db_runtime_config", check: runtimeCheck, attempts };
    }
    console.warn("Stripe runtime price config invalid", sanitizePriceCheck(runtimeCheck));
  }

  if (options.allowBootstrap !== false && stripePriceBootstrapEnabled()) {
    return withStripePriceBootstrapLock(plan.id, async () => {
      const afterLockConfig = await getStripeRuntimePriceConfig();
      const afterLockRow = afterLockConfig.prices?.[plan.id] || null;
      if (afterLockRow?.priceId) {
        const afterLockCheck = await validateStripePriceForPlan(stripeClient, plan, afterLockRow.priceId, commerce);
        recordStripePriceCheck(afterLockCheck);
        attempts.push({ source: "db_runtime_config_after_lock", check: sanitizePriceCheck(afterLockCheck), maskedPriceId: maskStripeId(afterLockRow.priceId) });
        if (afterLockCheck.ok) {
          return { plan: plan.id, priceId: afterLockRow.priceId, source: "db_runtime_config", check: afterLockCheck, attempts };
        }
      }

      const row = await verifyOrCreateStripePlan(stripeClient, stripeSetupPlanFor(plan, commerce));
      await persistStripeRuntimePriceRows([row], { mode: stripeRuntimeMode(), source: row.priceCreated ? "stripe_bootstrap_created" : "stripe_bootstrap_reused" });
      const bootstrapCheck = await validateStripePriceForPlan(stripeClient, plan, row.priceId, commerce);
      recordStripePriceCheck(bootstrapCheck);
      attempts.push({ source: row.priceCreated ? "stripe_bootstrap_created" : "stripe_bootstrap_reused", check: sanitizePriceCheck(bootstrapCheck), maskedPriceId: maskStripeId(row.priceId) });
      if (bootstrapCheck.ok) {
        await createAuditLog("stripe_runtime_price_resolved", "stripe", null, {
          plan: plan.id,
          source: row.priceCreated ? "stripe_bootstrap_created" : "stripe_bootstrap_reused",
          priceIdMasked: maskStripeId(row.priceId),
          productCreated: row.productCreated,
          priceCreated: row.priceCreated,
          mode: stripeRuntimeMode()
        });
        return {
          plan: plan.id,
          priceId: row.priceId,
          source: row.priceCreated ? "stripe_bootstrap_created" : "stripe_bootstrap_reused",
          check: bootstrapCheck,
          bootstrap: safeStripePlanRow(row),
          attempts
        };
      }
      throw stripePriceUnavailableError(plan, commerce, attempts, "stripe_bootstrap_invalid_price");
    });
  }

  throw stripePriceUnavailableError(plan, commerce, attempts, "stripe_bootstrap_unavailable");
}

function stripeSetupPlanFor(plan, commerce = getPlanCommerce(plan)) {
  return {
    plan,
    commerce,
    envName: commerce.priceEnv,
    productName: plan.name,
    metadata: stripePlanMetadata(plan)
  };
}

function stripePlanMetadata(plan) {
  return {
    app: "fima_macro",
    fima_plan: plan.id,
    managed_by: "fima_runtime_setup",
    product_type: "license",
    access_days: plan.durationDays ? String(plan.durationDays) : "",
    subscription: plan.subscription ? "monthly" : "",
    lifetime: plan.lifetime ? "true" : ""
  };
}

async function bootstrapRuntimeStripePrices({ source = "runtime_bootstrap" } = {}) {
  const stripeClient = stripe();
  const mode = stripeRuntimeMode();
  const rows = [];
  for (const planId of publicCheckoutPlanIds()) {
    const plan = getPlan(planId);
    rows.push(await verifyOrCreateStripePlan(stripeClient, stripeSetupPlanFor(plan)));
  }
  const config = await persistStripeRuntimePriceRows(rows, { mode, source });
  return {
    success: true,
    mode,
    source,
    products: rows,
    config
  };
}

function stripePriceUnavailableError(plan, commerce, attempts, status = "not_configured") {
  const error = new Error("Stripe checkout price is not configured.");
  error.code = "stripe_price_unavailable";
  error.statusCode = 503;
  error.priceEnv = commerce.priceEnv;
  error.priceStatus = attempts.at(-1)?.check?.status || status;
  error.plan = plan.id;
  error.attempts = attempts.map((attempt) => ({
    source: attempt.source,
    status: attempt.check?.status || null,
    ok: Boolean(attempt.check?.ok),
    maskedPriceId: attempt.maskedPriceId || null
  }));
  updateStripeRuntimePriceConfigError(error.priceStatus).catch(() => {});
  return error;
}

async function withStripePriceBootstrapLock(planId, fn) {
  const key = String(planId || "unknown");
  if (stripePriceBootstrapLocks.has(key)) return stripePriceBootstrapLocks.get(key);
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => stripePriceBootstrapLocks.delete(key));
  stripePriceBootstrapLocks.set(key, promise);
  return promise;
}

async function getStripeRuntimePriceConfig() {
  const row = await prisma.setting.findUnique({ where: { key: STRIPE_RUNTIME_PRICE_SETTING_KEY } }).catch(() => null);
  return normalizeStripeRuntimePriceConfig(row?.value);
}

function normalizeStripeRuntimePriceConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const prices = {};
  for (const planId of publicCheckoutPlanIds()) {
    const row = input.prices?.[planId] || {};
    prices[planId] = {
      plan: planId,
      envName: String(row.envName || getPlanCommerce(getPlan(planId)).priceEnv || ""),
      priceId: String(row.priceId || ""),
      productId: String(row.productId || ""),
      mode: ["live", "test"].includes(row.mode) ? row.mode : "unknown",
      source: String(row.source || ""),
      currency: String(row.currency || getPlanCommerce(getPlan(planId)).currency || "eur").toLowerCase(),
      amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : getPlanCommerce(getPlan(planId)).priceCents,
      type: String(row.type || (getPlan(planId)?.subscription ? "recurring" : "one_time")),
      interval: row.interval ? String(row.interval) : null,
      productCreated: Boolean(row.productCreated),
      priceCreated: Boolean(row.priceCreated),
      lastResolvedAt: row.lastResolvedAt || null
    };
  }
  return {
    prices,
    updatedAt: input.updatedAt || null,
    lastBootstrapAt: input.lastBootstrapAt || null,
    lastSafeErrorCode: input.lastSafeErrorCode || null,
    lastErrorAt: input.lastErrorAt || null
  };
}

async function persistStripeRuntimePriceRows(rows, { mode = stripeRuntimeMode(), source = "unknown" } = {}) {
  const current = await getStripeRuntimePriceConfig();
  const now = new Date().toISOString();
  for (const row of rows) {
    current.prices[row.plan] = {
      ...(current.prices[row.plan] || {}),
      plan: row.plan,
      envName: row.envName,
      priceId: row.priceId,
      productId: row.productId || current.prices[row.plan]?.productId || "",
      mode,
      source,
      currency: row.currency,
      amount: row.amount,
      type: row.type,
      interval: row.interval,
      productCreated: Boolean(row.productCreated),
      priceCreated: Boolean(row.priceCreated),
      lastResolvedAt: now
    };
  }
  current.updatedAt = now;
  current.lastBootstrapAt = source.includes("bootstrap") || source.includes("repair") ? now : current.lastBootstrapAt;
  current.lastSafeErrorCode = null;
  current.lastErrorAt = null;
  await prisma.setting.upsert({
    where: { key: STRIPE_RUNTIME_PRICE_SETTING_KEY },
    create: { key: STRIPE_RUNTIME_PRICE_SETTING_KEY, value: current },
    update: { value: current }
  });
  return current;
}

async function updateStripeRuntimePriceConfigError(code) {
  const current = await getStripeRuntimePriceConfig();
  current.lastSafeErrorCode = String(code || "stripe_price_unavailable").slice(0, 80);
  current.lastErrorAt = new Date().toISOString();
  await prisma.setting.upsert({
    where: { key: STRIPE_RUNTIME_PRICE_SETTING_KEY },
    create: { key: STRIPE_RUNTIME_PRICE_SETTING_KEY, value: current },
    update: { value: current }
  });
}

function publicStripePriceResolution(resolution) {
  return {
    plan: resolution.plan,
    source: resolution.source,
    maskedPriceId: maskStripeId(resolution.priceId),
    check: sanitizePriceCheck(resolution.check),
    bootstrap: resolution.bootstrap || null
  };
}

function safeStripePlanRow(row) {
  return {
    plan: row.plan,
    envName: row.envName,
    productIdMasked: maskStripeId(row.productId),
    priceIdMasked: maskStripeId(row.priceId),
    productCreated: Boolean(row.productCreated),
    priceCreated: Boolean(row.priceCreated),
    currentEnvPriceId: row.currentEnvPriceId,
    currentEnvMatches: row.currentEnvMatches,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    interval: row.interval
  };
}

function publicStripeBootstrapResult(result) {
  return {
    success: Boolean(result.success),
    mode: result.mode,
    source: result.source,
    products: (result.products || []).map(safeStripePlanRow),
    config: publicStripeRuntimePriceConfig(result.config),
    fullSecretsExposed: false,
    fullPriceIdsExposed: false
  };
}

function publicStripeSetupProductsResult(result) {
  return {
    success: Boolean(result.success),
    mode: result.mode,
    stripeKeyEnv: result.stripeKeyEnv,
    products: (result.products || []).map(safeStripePlanRow),
    envUpdates: Object.fromEntries(Object.entries(result.envUpdates || {}).map(([envName, row]) => [envName, {
      setInProcess: Boolean(row.setInProcess),
      maskedPriceId: maskStripeId(row.priceId)
    }])),
    config: result.config ? publicStripeRuntimePriceConfig(result.config) : null,
    renderEnv: result.renderEnv,
    deploy: result.deploy,
    fullSecretsExposed: false,
    fullPriceIdsExposed: false
  };
}

function publicStripeRuntimePriceConfig(config) {
  const normalized = normalizeStripeRuntimePriceConfig(config);
  return {
    updatedAt: normalized.updatedAt,
    lastBootstrapAt: normalized.lastBootstrapAt,
    lastSafeErrorCode: normalized.lastSafeErrorCode,
    lastErrorAt: normalized.lastErrorAt,
    prices: Object.fromEntries(Object.entries(normalized.prices).map(([planId, row]) => [planId, {
      plan: row.plan,
      envName: row.envName,
      configured: stripePriceEnvState(row.priceId) === "set",
      maskedPriceId: maskStripeId(row.priceId),
      maskedProductId: maskStripeId(row.productId),
      mode: row.mode,
      source: row.source,
      currency: row.currency,
      amount: row.amount,
      type: row.type,
      interval: row.interval,
      lastResolvedAt: row.lastResolvedAt
    }]))
  };
}

function publicStripeResolverError(error) {
  return {
    code: error?.code || "stripe_error",
    type: error?.type || null,
    priceEnv: error?.priceEnv || null,
    priceStatus: error?.priceStatus || null,
    plan: error?.plan || null,
    attempts: Array.isArray(error?.attempts) ? error.attempts : undefined
  };
}

function maskStripeId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 8) return "***";
  return `${text.slice(0, 6)}***${text.slice(-6)}`;
}

function stripeSetupPlans(envMap) {
  return ["3days", "monthly", "lifetime"].map((planId) => {
    const plan = getPlan(planId);
    const commerce = getPlanCommerce(plan);
    return {
      plan,
      commerce,
      envName: envMap[planId],
      productName: plan.name,
      metadata: stripePlanMetadata(plan)
    };
  });
}

async function setupStripeProducts({ mode, keyNames, envMap, updateRenderEnv, persistRuntimeConfig = false }) {
  const key = firstConfiguredEnv(keyNames);
  if (!key.value) {
    const error = new Error(`${keyNames.join(" or ")} is required in Render runtime.`);
    error.code = "missing_stripe_key";
    error.statusCode = 503;
    throw error;
  }
  const stripeClient = stripeWithKey(key.value, mode);
  const planned = stripeSetupPlans(envMap);
  const products = [];
  const envUpdates = {};

  for (const item of planned) {
    const row = await verifyOrCreateStripePlan(stripeClient, item);
    products.push(row);
    envUpdates[item.envName] = row.priceId;
  }

  const config = persistRuntimeConfig
    ? await persistStripeRuntimePriceRows(products, { mode, source: "admin_setup_products" })
    : null;
  const renderEnv = updateRenderEnv ? await updateRenderEnvVars(envUpdates) : {
    attempted: false,
    updated: false,
    reason: "disabled_by_request"
  };
  const deploy = renderEnv.updated ? await triggerRenderDeploy() : { attempted: false, triggered: false, reason: "env_not_updated" };
  return {
    success: true,
    mode,
    stripeKeyEnv: key.name,
    products,
    envUpdates: Object.fromEntries(Object.entries(envUpdates).map(([envName, priceId]) => [envName, { priceId, setInProcess: Boolean(process.env[envName]) }])),
    config,
    renderEnv,
    deploy
  };
}

async function verifyOrCreateStripePlan(stripeClient, item) {
  const { plan, commerce, envName, productName, metadata } = item;
  let product = await findStripeProductForPlan(stripeClient, plan.id);
  let productCreated = false;
  if (!product) {
    product = await stripeClient.products.create({
      name: productName,
      active: true,
      metadata
    }, {
      idempotencyKey: `fima-product-${plan.id}`
    });
    productCreated = true;
  }

  const expectedType = plan.subscription ? "recurring" : "one_time";
  let price = await findStripePriceForPlan(stripeClient, product.id, plan, commerce);
  let priceCreated = false;
  if (!price) {
    price = await stripeClient.prices.create({
      product: product.id,
      currency: commerce.currency,
      unit_amount: commerce.priceCents,
      ...(plan.subscription ? { recurring: { interval: "month" } } : {}),
      metadata
    }, {
      idempotencyKey: `fima-price-${plan.id}-${commerce.currency}-${commerce.priceCents}-${plan.subscription ? "month" : "one_time"}`
    });
    priceCreated = true;
  }

  const currentEnvPriceId = env(envName, "");
  const currentMatches = currentEnvPriceId === price.id;
  if (!currentMatches) process.env[envName] = price.id;
  return {
    plan: plan.id,
    envName,
    productId: product.id,
    priceId: price.id,
    productCreated,
    priceCreated,
    currentEnvPriceId: currentEnvPriceId ? "set" : "missing",
    currentEnvMatches: currentMatches,
    amount: commerce.priceCents,
    currency: commerce.currency,
    type: expectedType,
    interval: plan.subscription ? "month" : null
  };
}

async function findStripeProductForPlan(stripeClient, planId) {
  const list = await stripeClient.products.search({
    query: `metadata['fima_plan']:'${planId}' AND metadata['app']:'fima_macro'`,
    limit: 10
  }).catch(async () => {
    const fallback = await stripeClient.products.list({ active: true, limit: 100 });
    return { data: fallback.data.filter((product) => product.metadata?.fima_plan === planId && product.metadata?.app === "fima_macro") };
  });
  return list.data?.[0] || null;
}

async function findStripePriceForPlan(stripeClient, productId, plan, commerce) {
  const prices = await stripeClient.prices.list({ product: productId, active: true, limit: 100 });
  return prices.data.find((price) => {
    if (String(price.currency || "").toLowerCase() !== commerce.currency) return false;
    if (price.unit_amount !== commerce.priceCents) return false;
    if (plan.subscription) return price.type === "recurring" && price.recurring?.interval === "month";
    return price.type === "one_time";
  }) || null;
}

async function updateRenderEnvVars(updates) {
  const apiKey = env("RENDER_API_KEY");
  const serviceId = env("RENDER_SERVICE_ID");
  if (!apiKey || !serviceId) {
    return {
      attempted: false,
      updated: false,
      reason: "missing_render_api_env",
      required: ["RENDER_API_KEY", "RENDER_SERVICE_ID"]
    };
  }
  try {
    const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/env-vars`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(Object.entries(updates).map(([key, value]) => ({ key, value })))
    });
    const body = await response.json().catch(() => ({}));
    return {
      attempted: true,
      updated: response.ok,
      status: response.status,
      keys: Object.keys(updates),
      error: response.ok ? null : (body?.message || body?.error || "render_env_update_failed")
    };
  } catch (error) {
    return {
      attempted: true,
      updated: false,
      keys: Object.keys(updates),
      error: error.message
    };
  }
}

async function triggerRenderDeploy() {
  const hook = env("FIMA_RENDER_DEPLOY_HOOK", env("RENDER_DEPLOY_HOOK_URL", ""));
  if (hook) {
    const response = await fetch(hook, { method: "POST" });
    return { attempted: true, triggered: response.ok, status: response.status, method: "deploy_hook" };
  }
  const apiKey = env("RENDER_API_KEY");
  const serviceId = env("RENDER_SERVICE_ID");
  if (!apiKey || !serviceId) return { attempted: false, triggered: false, reason: "missing_deploy_hook_or_render_api" };
  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({ clearCache: "do_not_clear" })
  });
  return { attempted: true, triggered: response.ok, status: response.status, method: "render_api" };
}

function safeStripeSetupAudit(result) {
  return {
    mode: result.mode,
    products: result.products?.map(safeStripePlanRow),
    renderEnv: result.renderEnv,
    deploy: result.deploy,
    fullPriceIdsIncluded: false
  };
}

async function runStripeTestClockE2E() {
  const key = firstConfiguredEnv(["STRIPE_AGENT_TEST_API_KEY", "STRIPE_TEST_SECRET_KEY"]);
  if (!key.value) {
    const error = new Error("STRIPE_AGENT_TEST_API_KEY or STRIPE_TEST_SECRET_KEY is required.");
    error.code = "missing_test_stripe_key";
    error.statusCode = 503;
    throw error;
  }
  const stripeClient = stripeWithKey(key.value, "test");
  const monthlyPriceId = env("STRIPE_TEST_PRICE_MONTHLY");
  if (stripePriceEnvState(monthlyPriceId) !== "set") {
    const error = new Error("STRIPE_TEST_PRICE_MONTHLY is required. Run setup-test-products first.");
    error.code = "missing_test_monthly_price";
    error.statusCode = 503;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const testClock = await stripeClient.testHelpers.testClocks.create({
    frozen_time: now,
    name: `Fima v1.0.126 ${new Date().toISOString()}`
  });
  const customer = await stripeClient.customers.create({
    email: `fima-test-clock-${testClock.id}@example.com`,
    test_clock: testClock.id,
    metadata: { app: "fima_macro", purpose: "test_clock_e2e" }
  });
  await stripeClient.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripeClient.customers.update(customer.id, { invoice_settings: { default_payment_method: "pm_card_visa" } });
  const subscription = await stripeClient.subscriptions.create({
    customer: customer.id,
    items: [{ price: monthlyPriceId }],
    metadata: { app: "fima_macro", fima_plan: "monthly", purpose: "test_clock_e2e" }
  });
  const cancelUpdate = await stripeClient.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  const resumeUpdate = await stripeClient.subscriptions.update(subscription.id, { cancel_at_period_end: false });
  const advancedClock = await stripeClient.testHelpers.testClocks.advance(testClock.id, {
    frozen_time: now + 32 * 24 * 60 * 60
  });
  return {
    success: true,
    stripeKeyEnv: key.name,
    testClockId: testClock.id,
    customerId: customer.id,
    subscriptionId: subscription.id,
    statuses: {
      subscriptionCreated: subscription.status,
      cancelAtPeriodEnd: cancelUpdate.cancel_at_period_end,
      resumeCancelAtPeriodEnd: resumeUpdate.cancel_at_period_end,
      clockAdvanceStatus: advancedClock.status
    }
  };
}

function isProductCheckoutSession(session) {
  return session?.metadata?.purchase_type === "product" ||
    (Boolean(session?.metadata?.user_id) && Boolean(session?.metadata?.product_id));
}

async function createProductCheckoutSession({ user, product, price }) {
  if (!price.stripePriceId) {
    const error = new Error("Active product price is missing Stripe Price ID");
    error.code = "missing_stripe_price_id";
    throw error;
  }

  return stripe().checkout.sessions.create({
    mode: "payment",
    customer: user.stripeCustomerId,
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/payment-cancelled`,
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    metadata: {
      purchase_type: "product",
      user_id: user.id,
      product_id: product.id,
      product_price_id: price.id
    }
  });
}

async function createCheckoutSession({ plan, commerce, customerEmail, customerId, priceId, selectedCurrency, language, extraMetadata = {} }) {
  const stripeClient = stripe();
  const checkoutType = String(extraMetadata.checkoutType || "").trim().toLowerCase();
  const subscriptionCheckout = checkoutModeForPlan(plan) === "subscription" && checkoutType === "license_purchase";
  const productionMode = productionInlinePriceDataBlocked(env("NODE_ENV", "development"), env("STRIPE_MODE", "auto"));
  const baseSession = {
    mode: subscriptionCheckout ? "subscription" : "payment",
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/#pricing`,
    metadata: checkoutMetadata(plan, commerce, selectedCurrency, language, extraMetadata)
  };
  const normalizedCustomerId = String(customerId || "").trim();
  if (normalizedCustomerId.startsWith("cus_")) {
    baseSession.customer = normalizedCustomerId;
  } else {
    baseSession.customer_email = customerEmail;
  }

  let priceResolution = null;
  try {
    priceResolution = await resolveStripePriceForCheckout(stripeClient, plan, commerce, {
      candidatePriceId: priceId,
      candidateSource: priceId ? "env" : "env_missing",
      allowBootstrap: true
    });
  } catch (error) {
    if (productionMode) throw error;
    console.warn("Stripe price resolver unavailable; using development inline price_data fallback", publicStripeResolverError(error));
  }

  if (priceResolution?.priceId) {
    const session = await stripeClient.checkout.sessions.create({
      ...baseSession,
      line_items: [{ price: priceResolution.priceId, quantity: 1 }]
    });
    return {
      session,
      priceSource: priceResolution.source,
      priceResolution: publicStripePriceResolution(priceResolution)
    };
  }

  const session = await stripeClient.checkout.sessions.create({
    ...baseSession,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: commerce.currency,
        unit_amount: commerce.priceCents,
        ...(subscriptionCheckout ? { recurring: { interval: "month" } } : {}),
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

function checkoutMetadata(plan, commerce, selectedCurrency, language, extraMetadata = {}) {
  return {
    plan: plan.id,
    durationDays: plan.durationDays === null ? "0" : String(plan.durationDays),
    productName: env("APP_NAME", "Fima Macro"),
    checkoutCurrency: commerce.currency,
    checkoutAmount: String(commerce.priceCents),
    saleActive: commerce.saleActive ? "true" : "false",
    saleEndAt: commerce.saleEndAt,
    selectedCurrency,
    language,
    ...Object.fromEntries(Object.entries(extraMetadata).map(([key, value]) => [key, String(value)]))
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
  for (const plan of Object.values(PLANS).filter((item) => publicProductPlanIds.has(item.id))) {
    for (const option of getPlanPriceOptions(plan)) {
      const check = await validateStripePriceForPlan(stripeClient, plan, env(option.priceEnv), option);
      recordStripePriceCheck(check);
      results.push(sanitizePriceCheck(check));
      if (check.ok) {
        console.info("Stripe price env valid", sanitizePriceCheck(check));
      } else {
        console.warn("Stripe price env invalid", sanitizePriceCheck(check));
      }
    }
  }
  console.info("Stripe price env validation complete", {
    stripeMode: stripeStatus().effectiveMode,
    results
  });
}

async function validateStripePriceForPlan(stripeClient, plan, priceId, commerce = getPlanCommerce(plan)) {
  const base = {
    plan: plan.id,
    priceEnv: commerce.priceEnv,
    expected: expectedPriceForPlan(plan, commerce)
  };

  const normalizedPriceId = String(priceId || "").trim();
  const priceEnvState = stripePriceEnvState(normalizedPriceId);
  if (priceEnvState !== "set") {
    const status = priceEnvState === "missing" ? "missing_env" : "invalid_env_value";
    return { ...base, ok: false, status, priceEnvState };
  }

  if (!normalizedPriceId) {
    return { ...base, ok: false, status: "missing_env" };
  }

  try {
    const price = await stripeClient.prices.retrieve(normalizedPriceId);
    const actual = {
      active: price.active,
      currency: String(price.currency || "").toLowerCase(),
      unitAmount: price.unit_amount,
      type: price.type
    };

    if (actual.active === false) return { ...base, ok: false, status: "inactive_price", actual };
    const expectedType = plan.subscription ? "recurring" : "one_time";
    if (actual.type !== expectedType) return { ...base, ok: false, status: "price_type_mismatch", actual };
    if (plan.subscription && price.recurring?.interval !== "month") return { ...base, ok: false, status: "recurring_interval_mismatch", actual: { ...actual, interval: price.recurring?.interval || null } };
    if (actual.currency !== commerce.currency) return { ...base, ok: false, status: "currency_mismatch", actual };
    if (actual.unitAmount !== commerce.priceCents) return { ...base, ok: false, status: "amount_mismatch", actual };

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

function expectedPriceForPlan(plan, commerce = getPlanCommerce(plan)) {
  return {
    currency: commerce.currency,
    unitAmount: commerce.priceCents,
    type: plan.subscription ? "recurring" : "one_time",
    interval: plan.subscription ? "month" : null
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
    priceEnvState: check.priceEnvState,
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
  const fallbackUrl = absoluteFrontendUrl(env("DOWNLOAD_FALLBACK_URL", PUBLIC_SETUP_DOWNLOAD_URL));
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

async function latestAppUpdateTarget(minimumVersion = DEFAULT_MIN_SUPPORTED_APP_VERSION) {
  const info = await resolveDownloadInfo();
  return {
    latestVersion: info.version || minimumVersion || DEFAULT_MIN_SUPPORTED_APP_VERSION,
    downloadUrl: info.downloadUrl || PUBLIC_SETUP_DOWNLOAD_URL
  };
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
  if (!text) return PUBLIC_SETUP_DOWNLOAD_URL;
  try {
    return new URL(text, `${frontendUrl()}/`).toString();
  } catch {
    return PUBLIC_SETUP_DOWNLOAD_URL;
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

function isNormalizedCloudLicenseKey(licenseKey) {
  return /^FIMA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(licenseKey || ""));
}

function licenseBlockedReason(license) {
  const status = String(license?.status || "").trim().toLowerCase();
  if (!status || status === "active") return null;
  if (status === "banned") return "banned";
  if (status === "inactive") return "inactive";
  if (status === "canceled" || status === "cancelled") return "canceled";
  if (status === "payment_failed" || status === "failed") return "payment_failed";
  return "disabled";
}

function configuredOwnerLicenseKey() {
  return normalizeLicenseKey(process.env.OWNER_LIFETIME_LICENSE_KEY);
}

function configuredOwnerEmail() {
  return normalizeAccountEmail(process.env.OWNER_LIFETIME_GRANT_EMAIL);
}

function isOwnerManagedLicense(license) {
  if (!license) return false;
  const configuredKey = configuredOwnerLicenseKey();
  if (configuredKey && normalizeLicenseKey(license.licenseKey) === configuredKey) return true;
  const notes = String(license.notes || "").toLowerCase();
  return notes.includes("owner_internal_lifetime") || notes.includes("adminaccess=owner_only");
}

function ownerLicenseBindingState(license, hwid) {
  if (!isOwnerManagedLicense(license)) return { ok: true, reason: "not_owner_key" };

  const configuredEmail = configuredOwnerEmail();
  const licenseEmail = normalizeAccountEmail(license.customerEmail);
  if (configuredEmail && licenseEmail !== configuredEmail) {
    return { ok: false, reason: "owner_key_wrong_account_or_hwid" };
  }

  if (!license.lifetime || license.status !== "active") {
    return { ok: false, reason: "owner_key_wrong_account_or_hwid" };
  }

  const boundHwid = normalizeHwid(license.hwid);
  const incomingHwid = normalizeHwid(hwid);
  if (!boundHwid || !incomingHwid || boundHwid !== incomingHwid) {
    return { ok: false, reason: "owner_key_wrong_account_or_hwid" };
  }

  return { ok: true, reason: "owner_key_bound" };
}

function validationLogLicenseKey(license, fallback = "") {
  const value = fallback || license?.licenseKey || "-";
  return isOwnerManagedLicense(license) ? maskCode(value) : value;
}

async function logOwnerKeyAttempt(license, hwid, appVersion, reason) {
  await prisma.$transaction([
    prisma.validationLog.create({
      data: {
        licenseId: license?.id || null,
        licenseKey: validationLogLicenseKey(license, license?.licenseKey || "-"),
        result: "failed",
        reason,
        hwidHash: hashHwid(hwid),
        appVersion
      }
    }),
    prisma.auditLog.create({
      data: {
        action: "owner_key_validation_blocked",
        targetType: "license",
        targetId: license?.id || null,
        metadata: {
          reason,
          appVersion,
          hwidHash: hashHwid(hwid),
          licenseKeyMasked: maskCode(license?.licenseKey),
          ownerKey: true,
          fullKeyPrinted: false,
          fullEmailPrinted: false
        }
      }
    })
  ]).catch(() => {});
}

function licenseReasonMessage(reason) {
  return {
    valid: "License valid",
    license_not_found: "License key was not found.",
    invalid_format: "Invalid license key format.",
    expired: "Your license has expired.",
    disabled: "This license was disabled.",
    inactive: "This license key is inactive.",
    banned: "This license has been banned.",
    canceled: "This license was canceled.",
    payment_failed: "Payment for this license was not completed.",
    hwid_mismatch: "This license is already bound to another PC.",
    owner_key_wrong_account_or_hwid: "This owner key is locked to the owner account and device.",
    account_not_connected: "Your license is valid. A Fima account is optional for app access, but linking an account helps recovery and My Products.",
    discord_not_connected: "Discord is optional except for free trial claims.",
    roblox_not_connected: "Roblox is optional. You can add a username later for profile/community features.",
    trial_expired: "Your trial license has expired.",
    gift_not_claimed: "This gift license has not been claimed yet.",
    referral_not_claimed: "This referral reward has not been claimed yet.",
    update_required: "This app version is no longer supported. Please download the latest Fima Macro update.",
    entitlement_required: "App entitlement is required. Please validate your license again.",
    entitlement_unavailable: "App entitlement service is not configured. Please contact support.",
    invalid_entitlement_format: "App entitlement is invalid. Please validate your license again.",
    invalid_entitlement_payload: "App entitlement is invalid. Please validate your license again.",
    invalid_entitlement_type: "App entitlement is invalid. Please validate your license again.",
    invalid_entitlement_signature: "App entitlement is invalid. Please validate your license again.",
    entitlement_expired: "App entitlement expired. Please validate your license again.",
    entitlement_session_revoked: "App entitlement was revoked. Please validate your license again.",
    server_error: "License server could not validate this key right now.",
    timeout: "License server timed out. Try again in a moment."
  }[reason] || "Invalid license key.";
}

function licenseValidationPayload(license, options = {}) {
  const accountAccess = options.accountAccess || null;
  const timeLeft = license ? licenseTimeLeft(license.expiresAt, license.lifetime) : { label: "", seconds: null, state: "unknown" };
  const normalizedHwid = normalizeHwid(options.hwid);
  const boundHwid = normalizeHwid(license?.hwid);
  const hwidBound = Boolean(boundHwid);
  const hwidMatches = options.hwidMatches ?? (hwidBound && normalizedHwid ? boundHwid === normalizedHwid : !hwidBound);
  const reason = options.reason || (options.valid ? "valid" : "license_not_found");
  const plan = license?.plan || null;
  const planInfo = plan ? getPlan(plan) : null;
  const user = accountAccess?.user || null;
  const missingRequirements = accountAccess?.missingRequirements || [];
  const accountConnected = accountAccess ? Boolean(accountAccess.user) : false;
  const licenseExists = Boolean(license);
  const validLicense = options.validLicense ?? Boolean(license && !["license_not_found", "invalid_format"].includes(reason));
  const canUseApp = Boolean(options.valid && hwidMatches);

  return {
    valid: Boolean(options.valid),
    validLicense: Boolean(validLicense),
    licenseExists,
    reason,
    message: options.message || licenseReasonMessage(reason),
    appMessagePreview: options.message || licenseReasonMessage(reason),
    recommendedFix: recommendedLicenseFix(reason),
    latestVersion: options.latestVersion || null,
    downloadUrl: options.downloadUrl || null,
    licenseKey: license && isOwnerManagedLicense(license) ? maskCode(license.licenseKey) : license?.licenseKey || options.licenseKey || null,
    licenseKeyMasked: license ? maskCode(license.licenseKey) : null,
    licenseId: license?.id || null,
    source: license ? licenseSource(license) : null,
    status: license?.status || null,
    plan,
    planName: planInfo?.name?.replace(/^Fima Macro\s+/i, "") || plan || null,
    productName: "Fima Macro",
    expiresAt: license?.expiresAt ? license.expiresAt.toISOString() : null,
    timeLeft: timeLeft.label || null,
    timeLeftSeconds: timeLeft.seconds,
    timeLeftState: timeLeft.state,
    lifetime: Boolean(license?.lifetime),
    ownerAdminAccess: Boolean(license && isOwnerManagedLicense(license) && reason === "valid"),
    boundHwid: boundHwid || null,
    incomingHwid: normalizedHwid || null,
    hwidBound,
    hwidUnbound: !hwidBound,
    hwidMatches,
    hwidBoundNow: Boolean(options.hwidBoundNow),
    hwidStatus: hwidBound ? "Bound" : "Unbound",
    accountConnected,
    discordLinked: accountAccess ? Boolean(accountAccess.discordLinked) : false,
    robloxLinked: accountAccess ? Boolean(accountAccess.robloxLinked) : false,
    canUseApp,
    missingRequirements,
    hasActiveLicense: Boolean(license && license.status === "active"),
    buyerEmail: maskEmail(user?.email || license?.customerEmail),
    buyerEmailMasked: maskEmail(user?.email || license?.customerEmail),
    accountEmail: maskEmail(user?.email || license?.customerEmail),
    maskedAccountEmail: maskEmail(user?.email || license?.customerEmail),
    customerEmail: maskEmail(license?.customerEmail),
    accountSetupUrl: `${env("FRONTEND_URL") || "https://fimamacro.com"}/dashboard/overview`,
    connectDiscordUrl: `${env("API_BASE_URL") || "https://api.fimamacro.com"}/auth/discord/start?returnTo=/dashboard/overview`,
    connectRobloxUrl: `${env("FRONTEND_URL") || "https://fimamacro.com"}/dashboard/security#roblox-profile`,
    optionalProfileMissing: missingRequirements,
    buyerDiscord: user ? {
      connected: Boolean(accountAccess?.discordLinked),
      id: maskDiscordId(user.discordUserId),
      username: user.discordUsername || null,
      avatar: user.discordAvatarUrl || null
    } : null,
    buyerRoblox: user ? {
      connected: false,
      id: null,
      username: user.robloxUsername || null,
      avatar: null,
      manualOnly: Boolean(user.robloxUsername)
    } : null,
    robloxUsername: user?.robloxUsername || null,
    robloxAvatarUrl: user?.robloxAvatarUrl || null,
    discordUsername: user?.discordUsername || null,
    lastValidatedAt: license?.lastValidatedAt ? license.lastValidatedAt.toISOString() : null,
    createdAt: license?.createdAt ? license.createdAt.toISOString() : null
  };
}

async function buildLicenseAccountAccess(license) {
  const user = await findUserForLicense(license);
  const missingRequirements = [];

  if (!user) {
    missingRequirements.push("fima_account");
    return {
      user: null,
      discordLinked: false,
      robloxLinked: false,
      canUseApp: true,
      missingRequirements,
      message: "License is valid. Fima account, Discord and Roblox are optional for app access."
    };
  }

  const integrations = await buildIntegrationSummary(user);
  const discordLinked = Boolean(integrations.discord.connected);
  if (!discordLinked) missingRequirements.push("discord_optional");

  const message = "Discord is optional for recovery. Roblox username is profile-only and never blocks app access.";

  return {
    user,
    discordLinked,
    robloxLinked: false,
    canUseApp: true,
    missingRequirements,
    message
  };
}

async function findUserForLicense(license) {
  const email = normalizeEmail(license?.customerEmail);
  if (!isValidEmail(email)) return null;
  const emailNormalized = normalizeAccountEmail(email);
  return prisma.user.findFirst({
    where: { OR: [{ email }, { emailNormalized }] },
    include: {
      oauthLinks: {
        where: { provider: { in: ["discord"] } },
        orderBy: { updatedAt: "desc" }
      }
    }
  });
}

function recommendedLicenseFix(reason) {
  return {
    valid: "No action needed.",
    license_not_found: "Check the copied key. If the user paid, search by buyer email and verify the generated license.",
    invalid_format: "Ask the user to copy the full FIMA-XXXX-XXXX-XXXX-XXXX key.",
    expired: "Extend the license or ask the user to renew.",
    trial_expired: "Trial expired. Ask the user to buy a plan or wait for the next eligible trial.",
    disabled: "Re-enable the license if it was disabled by mistake.",
    inactive: "Set license status to active if this user should have access.",
    banned: "Unban only if the ban was a mistake.",
    canceled: "Check the order/payment status before re-enabling.",
    payment_failed: "Ask the user to complete payment or create a manual replacement if appropriate.",
    hwid_mismatch: "Reset HWID from Admin Panel if this is the owner of the license.",
    owner_key_wrong_account_or_hwid: "Owner key is locked to the owner account and PC. Do not reset unless the owner verified the device.",
    account_not_connected: "Optional only. App access should not be blocked; ask user to link an account only for recovery/My Products.",
    discord_not_connected: "Discord is optional except when claiming the free trial.",
    roblox_not_connected: "Roblox is optional and should never block app access.",
    gift_not_claimed: "Ask the user to claim the gift from their dashboard.",
    referral_not_claimed: "Ask the user to claim the referral reward from their dashboard.",
    update_required: "Install the latest Fima Macro app from fimamacro.com/download.",
    server_error: "Check backend logs and retry validation.",
    timeout: "Retry after the API connection recovers."
  }[reason] || "Open the license record and inspect status, expiry, HWID and account links.";
}

function licenseSource(license) {
  const notes = String(license?.notes || "").toLowerCase();
  if (notes.includes("direct_gift_package")) return "Direct Gift Package";
  if (notes.includes("gift_code")) return "Gift Code";
  if (notes.includes("gift_purchase")) return "Gift/Website";
  if (notes.includes("old_buyer")) return "Old Buyer Trial";
  if (notes.includes("robux_manual")) return "Robux Manual Order";
  if (notes.includes("legacy_import")) return "Legacy Import";
  if (license?.stripeSessionId) return "Stripe/Website";
  if (notes.includes("referral_reward")) return "Referral reward";
  if (notes.includes("trial")) return "Trial";
  if (notes.includes("extension")) return "Extension";
  return "Manual";
}

function licenseTimeLeft(expiresAt, lifetime) {
  if (lifetime) return { label: "Lifetime", seconds: null, state: "lifetime" };
  if (!expiresAt) return { label: "No expiry", seconds: null, state: "unknown" };
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return { label: "Expired", seconds, state: "expired" };
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const label = days > 0 ? `${days}d ${hours}h ${minutes}m left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  return { label, seconds, state: seconds < 86400 ? "warning" : "active" };
}

function adminLicensePayload(license, user = null) {
  const order = license.orders?.[0] || null;
  const timeLeft = licenseTimeLeft(license.expiresAt, license.lifetime);
  return {
    ...license,
    source: licenseSource(license),
    customerEmail: maskEmail(license.customerEmail),
    userEmail: maskEmail(license.customerEmail),
    robloxUsername: user?.robloxUsername || null,
    robloxUserId: maskExternalId(user?.robloxUserId),
    robloxAvatarUrl: user?.robloxAvatarUrl || null,
    discordUsername: user?.discordUsername || null,
    discordUserId: maskDiscordId(user?.discordUserId),
    discordAvatarUrl: user?.discordAvatarUrl || null,
    stripeCustomerId: maskExternalId(user?.stripeCustomerId),
    hwidStatus: license.hwid ? "Bound" : "Unbound",
    enabled: license.status === "active",
    expires: license.lifetime ? "Lifetime" : license.expiresAt,
    timeLeft: timeLeft.label,
    timeLeftSeconds: timeLeft.seconds,
    timeLeftState: timeLeft.state,
    paymentSessionId: maskExternalId(license.stripeSessionId || order?.stripeSessionId),
    paymentIntentId: maskExternalId(license.stripePaymentIntentId || order?.stripePaymentIntentId),
    orderId: order?.id || null,
    orderAmount: order?.amount || null,
    orderCurrency: order?.currency || null,
    orderStatus: order?.status || null
  };
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

function extractEntitlementToken(req) {
  const bodyToken = String(req.body?.entitlementToken || req.body?.entitlement || req.body?.token || "").trim();
  if (bodyToken) return bodyToken;

  const authorization = String(req.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccountEmail(value) {
  const email = normalizeEmail(value);
  const [localPart, domainPart] = email.split("@");
  const domain = domainPart === "googlemail.com" ? "gmail.com" : domainPart;
  if (!localPart || !domain) return email;

  if (domain === "gmail.com") {
    const baseLocal = localPart.split("+")[0].replace(/\./g, "");
    return `${baseLocal}@${domain}`;
  }

  return `${localPart}@${domain}`;
}

async function validateSignupEmail(email) {
  if (!isValidEmail(email)) return { valid: false, reason: "invalid_email" };
  const domain = email.split("@")[1];
  if (!domain || domain.length > 253) return { valid: false, reason: "invalid_email" };

  try {
    const mx = await dns.resolveMx(domain);
    if (!mx.length) return { valid: false, reason: "email_domain_has_no_mail" };
    return { valid: true, mxVerified: true };
  } catch (error) {
    if (["ENODATA", "ENOTFOUND", "ESERVFAIL"].includes(error.code)) {
      return { valid: false, reason: "email_domain_has_no_mail" };
    }
    return { valid: true, mxVerified: false };
  }
}

function normalizeRobloxUsername(value) {
  const username = String(value || "").trim();
  if (!username) return "";
  return /^[A-Za-z0-9_]{3,20}$/.test(username) ? username : "";
}

async function resolveRobloxProfile(value) {
  const username = normalizeRobloxUsername(value);
  if (!username) return null;

  const userResponse = await fetchWithAbort("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  }, 4500).catch(() => null);
  if (!userResponse?.ok) return null;
  const userData = await userResponse.json().catch(() => ({}));
  const user = userData?.data?.[0];
  if (!user?.id) return null;

  let avatarUrl = null;
  const avatarUrlRequest = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
  avatarUrlRequest.searchParams.set("userIds", String(user.id));
  avatarUrlRequest.searchParams.set("size", "150x150");
  avatarUrlRequest.searchParams.set("format", "Png");
  avatarUrlRequest.searchParams.set("isCircular", "true");
  const avatarResponse = await fetchWithAbort(avatarUrlRequest, {}, 3500).catch(() => null);
  if (avatarResponse?.ok) {
    const avatarData = await avatarResponse.json().catch(() => ({}));
    avatarUrl = safeUrl(avatarData?.data?.[0]?.imageUrl);
  }

  return {
    id: String(user.id),
    username: user.name || username,
    displayName: user.displayName || user.name || username,
    avatarUrl
  };
}

async function fetchWithAbort(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isStrongPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, 64);
  return `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;
  const key = await scrypt(password, salt, Buffer.from(expected, "base64url").length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  const a = Buffer.from(expected, "base64url");
  return a.length === key.length && crypto.timingSafeEqual(a, key);
}

function scrypt(password, salt, keyLength, options = { N: 16384, r: 8, p: 1 }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function generateUniquePasswordResetCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = String(crypto.randomInt(100000, 1000000));
    const existing = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(code) } });
    if (!existing) return code;
  }
  return randomToken();
}

function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%?*";
  const all = upper + lower + digits + symbols;
  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];
  const raw = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(symbols),
    ...Array.from({ length: 12 }, () => pick(all))
  ];
  for (let i = raw.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw.join("");
}

async function generateUniqueEmailVerificationCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = String(crypto.randomInt(100000, 1000000));
    const existing = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(code) } });
    if (!existing) return code;
  }
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function createPasswordResetForUser(user, auditAction = "password_reset_requested", metadata = {}) {
  const requireDelivery = Boolean(metadata.requireDelivery);
  const auditMetadata = { ...metadata };
  delete auditMetadata.requireDelivery;
  const { token, resetUrl } = await createPasswordResetTokenForUser(user);

  const emailResult = await sendPasswordResetEmail(user.email, token).catch((error) => {
    console.warn("Password reset email could not be sent", {
      email: maskEmail(user.email),
      ...publicError(error)
    });
    return {
      configured: true,
      sent: false,
      provider: emailProviderName(),
      error: error.code || "email_send_failed"
    };
  });
  const emailConfigured = Boolean(emailResult?.configured);
  const emailSent = Boolean(emailResult?.sent || (emailResult?.configured && !emailResult?.error));
  await createAuditLog(auditAction, "user", user.id, {
    ...auditMetadata,
    email: maskEmail(user.email),
    emailConfigured,
    emailSent,
    provider: emailResult?.provider || "none",
    emailError: emailResult?.error || null
  });
  if (requireDelivery && !emailSent) {
    const error = new Error(emailResult?.error || "email_delivery_failed");
    error.code = emailConfigured ? "email_delivery_failed" : "email_not_configured";
    throw error;
  }
  return {
    token,
    resetUrl,
    emailConfigured,
    emailSent,
    provider: emailResult?.provider || "none"
  };
}

async function createDiscordPasswordResetForUser(user, auditAction = "password_reset_discord_sent", metadata = {}) {
  const { token, resetUrl } = await createPasswordResetTokenForUser(user);
  const dmResult = await sendPasswordResetDm(user.discordUserId, token, resetUrl);
  await createAuditLog(auditAction, "user", user.id, {
    ...metadata,
    provider: "discord_dm",
    discordUserId: maskDiscordId(user.discordUserId),
    discordSent: true
  });
  return {
    token,
    resetUrl,
    provider: dmResult.provider,
    discordSent: Boolean(dmResult.sent)
  };
}

async function createPasswordResetTokenForUser(user) {
  const token = await generateUniquePasswordResetCode();
  const resetUrl = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })
  ]);
  return { token, resetUrl };
}

async function sendPasswordResetEmail(email, code) {
  const resetUrl = `${frontendUrl()}/reset-password?token=${encodeURIComponent(code)}`;
  const subject = "Your Fima Macro password reset code";
  const text = [
    "Your Fima Macro password reset code is:",
    "",
    code,
    "",
    "This code expires in 15 minutes.",
    `Reset link: ${resetUrl}`,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070711;color:#f6f2ff;padding:24px">
      <div style="max-width:560px;margin:0 auto;border:1px solid rgba(190,150,255,.28);border-radius:12px;background:#121020;padding:24px">
        <p style="margin:0 0 8px;color:#c79cff;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Fima Macro</p>
        <h1 style="margin:0 0 14px;font-size:28px">Password reset code</h1>
        <p style="color:#b7adc9">Use this code to reset your Fima account password. It expires in 15 minutes.</p>
        <div style="margin:20px 0;padding:16px;border-radius:10px;background:#080713;border:1px solid rgba(199,156,255,.35);font-size:30px;font-weight:900;letter-spacing:.18em;text-align:center">${code}</div>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 16px;border-radius:8px;background:linear-gradient(135deg,#c79cff,#42d9ff);color:#080713;font-weight:900;text-decoration:none">Reset password</a>
        <p style="margin-top:18px;color:#8f84a5;font-size:13px">If you did not request this, ignore this email.</p>
      </div>
    </div>
  `;
  return sendFimaEmail({ to: email, subject, text, html });
}

async function createAndSendEmailVerification(user, targetEmail = null) {
  if (!user?.id || user.emailVerifiedAt) return { skipped: true };
  const email = normalizeEmail(targetEmail || user.email);
  if (!isValidEmail(email) || isSyntheticUsernameEmail(email)) {
    const error = new Error("email_not_linked");
    error.code = "email_not_linked";
    throw error;
  }
  const code = await generateUniqueEmailVerificationCode();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      email,
      tokenHash: hashToken(code),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  await sendEmailVerificationEmail(email, code);
  return { sent: true };
}

async function sendEmailVerificationEmail(email, code) {
  const subject = "Verify your Fima Macro email";
  const text = [
    "Your Fima Macro email verification code is:",
    "",
    code,
    "",
    "This code expires in 30 minutes.",
    "After verifying, referrals can count toward invite rewards.",
    "",
    "If you did not create a Fima account, you can ignore this email."
  ].join("\n");
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070711;color:#f6f2ff;padding:24px">
      <div style="max-width:560px;margin:0 auto;border:1px solid rgba(190,150,255,.28);border-radius:12px;background:#121020;padding:24px">
        <p style="margin:0 0 8px;color:#c79cff;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Fima Macro</p>
        <h1 style="margin:0 0 14px;font-size:28px">Verify your email</h1>
        <p style="color:#b7adc9">Use this code to verify your Fima account email. Referrals require verified email, Discord and Roblox.</p>
        <div style="margin:20px 0;padding:16px;border-radius:10px;background:#080713;border:1px solid rgba(199,156,255,.35);font-size:30px;font-weight:900;letter-spacing:.18em;text-align:center">${code}</div>
        <p style="margin-top:18px;color:#8f84a5;font-size:13px">If you did not create this account, ignore this email.</p>
      </div>
    </div>
  `;
  return sendFimaEmail({ to: email, subject, text, html });
}

function smtpSummary() {
  return {
    configured: Boolean(env("SMTP_HOST", "") && env("SMTP_USER", "") && env("SMTP_PASS", "")),
    host: env("SMTP_HOST", "smtp.gmail.com"),
    port: Number(env("SMTP_PORT", "587")),
    secure: isTruthy(env("SMTP_SECURE", "false")),
    userConfigured: Boolean(env("SMTP_USER", "")),
    passConfigured: Boolean(env("SMTP_PASS", "")),
    from: mailFrom()
  };
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function emailProviderName() {
  if (smtpSummary().configured) return "smtp";
  if (env("RESEND_API_KEY", "")) return "resend";
  return "none";
}

function mailFrom() {
  return env("MAIL_FROM", "Fima Macro <fimamacro.noreply@gmail.com>");
}

async function sendFimaEmail({ to, subject, text, html }) {
  const smtp = smtpSummary();
  lastEmailDeliveryState = {
    ...lastEmailDeliveryState,
    checkedAt: new Date().toISOString(),
    provider: emailProviderName(),
    configured: smtp.configured || Boolean(env("RESEND_API_KEY", ""))
  };
  if (smtp.configured) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      connectionTimeout: Number(env("SMTP_CONNECTION_TIMEOUT_MS", "12000")),
      greetingTimeout: Number(env("SMTP_GREETING_TIMEOUT_MS", "12000")),
      socketTimeout: Number(env("SMTP_SOCKET_TIMEOUT_MS", "15000")),
      auth: {
        user: env("SMTP_USER", ""),
        pass: env("SMTP_PASS", "")
      }
    });
    try {
      await transporter.sendMail({ from: mailFrom(), to, subject, text, html });
    } catch (error) {
      const details = publicError(error);
      const resendFallbackKey = env("RESEND_API_KEY", "");
      if (resendFallbackKey) {
        const fallback = await fetchWithAbort("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${resendFallbackKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ from: mailFrom(), to, subject, text, html })
        }, 8000);
        if (fallback.ok) {
          lastEmailDeliveryState = {
            ...lastEmailDeliveryState,
            provider: "resend",
            configured: true,
            lastSuccessAt: new Date().toISOString(),
            lastError: null,
            lastErrorType: null
          };
          return { configured: true, sent: true, provider: "resend", fallbackFrom: "smtp" };
        }
        const fallbackBody = await fallback.text().catch(() => "");
        details.type = `smtp:${details.type || details.message || "failed"}; resend:${fallback.status} ${fallbackBody.slice(0, 120)}`;
      }
      lastEmailDeliveryState = {
        ...lastEmailDeliveryState,
        provider: "smtp",
        configured: true,
        lastErrorAt: new Date().toISOString(),
        lastError: details.code || details.message || "smtp_send_failed",
        lastErrorType: details.type || null
      };
      throw error;
    }
    lastEmailDeliveryState = {
      ...lastEmailDeliveryState,
      provider: "smtp",
      configured: true,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      lastErrorType: null
    };
    return { configured: true, sent: true, provider: "smtp" };
  }

  const resendKey = env("RESEND_API_KEY", "");
  if (!resendKey) {
    lastEmailDeliveryState = {
      ...lastEmailDeliveryState,
      provider: "none",
      configured: false,
      lastErrorAt: new Date().toISOString(),
      lastError: "email_not_configured"
    };
    return { configured: false, provider: "none" };
  }

  const response = await fetchWithAbort("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ from: mailFrom(), to, subject, text, html })
  }, 8000);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`Resend email failed with status ${response.status}`);
    error.code = "email_send_failed";
    error.type = body.slice(0, 160);
    lastEmailDeliveryState = {
      ...lastEmailDeliveryState,
      provider: "resend",
      configured: true,
      lastErrorAt: new Date().toISOString(),
      lastError: error.code
    };
    throw error;
  }
  lastEmailDeliveryState = {
    ...lastEmailDeliveryState,
    provider: "resend",
    configured: true,
    lastSuccessAt: new Date().toISOString(),
    lastError: null
  };
  return { configured: true, sent: true, provider: "resend" };
}

async function issueUserSession(res, userId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });
  res.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: apiBaseUrl().startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function clearUserCookie(res) {
  res.clearCookie(USER_SESSION_COOKIE, {
    httpOnly: true,
    secure: apiBaseUrl().startsWith("https"),
    sameSite: "lax",
    path: "/"
  });
}

async function requireUser(req, res, next) {
  try {
    const tokenHash = hashToken(req.cookies?.[USER_SESSION_COOKIE]);
    if (!tokenHash) return res.status(401).json({ error: "unauthorized" });

    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
      clearUserCookie(res);
      return res.status(401).json({ error: "unauthorized" });
    }

    req.user = session.user;
    prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    }).catch(() => {});
    return next();
  } catch (error) {
    console.error("User auth failed", publicError(error));
    return res.status(500).json({ error: "auth_failed" });
  }
}

async function getOptionalUser(req, res) {
  const tokenHash = hashToken(req.cookies?.[USER_SESSION_COOKIE]);
  if (!tokenHash) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
    clearUserCookie(res);
    return null;
  }

  prisma.userSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  }).catch(() => {});
  return session.user;
}

function normalizeUsername(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(text)) return "";
  return text;
}

function syntheticEmailForUsername(value) {
  const username = normalizeUsername(value);
  return username ? `${username}@username.fimamacro.local` : "";
}

function isSyntheticUsernameEmail(email) {
  return normalizeEmail(email).endsWith("@username.fimamacro.local");
}

function usernameFromSyntheticEmail(email) {
  const normalized = normalizeEmail(email);
  return isSyntheticUsernameEmail(normalized) ? normalized.split("@")[0] : "";
}

function publicUser(user) {
  const usernameOnly = isSyntheticUsernameEmail(user.email);
  const username = usernameOnly ? usernameFromSyntheticEmail(user.email) : null;
  const maskedEmail = usernameOnly ? null : maskEmail(user.email);
  return {
    id: user.id,
    email: maskedEmail,
    emailMasked: maskedEmail,
    username,
    loginName: username || maskedEmail,
    usernameOnly,
    emailLinked: !usernameOnly && isValidEmail(user.email),
    passwordResetAvailable: !usernameOnly && Boolean(user.emailVerifiedAt),
    stripeCustomerId: maskExternalId(user.stripeCustomerId),
    stripeCustomerIdMasked: maskExternalId(user.stripeCustomerId),
    discordUserId: maskDiscordId(user.discordUserId),
    discordUserIdMasked: maskDiscordId(user.discordUserId),
    discordUsername: user.discordUsername || null,
    discordEmail: maskEmail(user.discordEmail),
    discordAvatarUrl: user.discordAvatarUrl || null,
    robloxUsername: user.robloxUsername || null,
    robloxUserId: null,
    robloxUserIdMasked: null,
    robloxAvatarUrl: user.robloxAvatarUrl || null,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt || null,
    trialUsedAt: user.trialUsedAt || null,
    trialExpiresAt: user.trialExpiresAt || null,
    nextTrialAvailableAt: user.nextTrialAvailableAt || null,
    trialStatus: user.trialStatus || null,
    monthlyTrialClaimCount: user.monthlyTrialClaimCount || 0,
    role: user.role,
    createdAt: user.createdAt
  };
}

async function buildIntegrationSummary(user) {
  const links = Array.isArray(user?.oauthLinks)
    ? user.oauthLinks
    : user?.id
    ? await prisma.oAuthLink.findMany({
        where: { userId: user.id, provider: { in: ["discord"] } },
        orderBy: { updatedAt: "desc" }
      }).catch(() => [])
    : [];
  const byProvider = Object.fromEntries(links.map((link) => [link.provider, link]));
  const discordConnected = Boolean(user?.discordUserId && byProvider.discord);
  const robloxConnected = false;

  return {
    discord: {
      connected: discordConnected,
      id: maskDiscordId(user?.discordUserId),
      username: user?.discordUsername || null,
      email: maskEmail(user?.discordEmail),
      avatar: user?.discordAvatarUrl || null,
      connectedAt: byProvider.discord?.createdAt || null,
      updatedAt: byProvider.discord?.updatedAt || null
    },
    roblox: {
      connected: robloxConnected,
      id: null,
      username: user?.robloxUsername || null,
      displayName: user?.robloxUsername || null,
      avatar: null,
      connectedAt: null,
      updatedAt: null,
      manualOnly: Boolean(user?.robloxUsername)
    }
  };
}

async function searchGiftRecipients(query, requesterUserId) {
  const raw = String(query || "").trim();
  const normalized = normalizeGiftSearch(raw);
  if (normalized.length < 2) return [];

  const lowerEmail = normalizeEmail(raw);
  const normalizedEmail = normalizeAccountEmail(raw);
  const textWhere = [
    { email: { contains: lowerEmail, mode: "insensitive" } },
    { emailNormalized: { contains: normalizedEmail, mode: "insensitive" } },
    { discordUsername: { contains: raw, mode: "insensitive" } },
    { discordUserId: { contains: raw } },
    { discordEmail: { contains: lowerEmail, mode: "insensitive" } },
    { robloxUsername: { contains: raw, mode: "insensitive" } },
    { robloxUserId: { contains: raw } }
  ];
  const userInclude = {
    oauthLinks: {
      where: { provider: { in: ["discord", "roblox"] } },
      orderBy: { updatedAt: "desc" }
    }
  };

  const directUsers = await prisma.user.findMany({
    where: {
      id: { not: requesterUserId },
      OR: textWhere
    },
    include: userInclude,
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const oauthLinkMatches = await prisma.oAuthLink.findMany({
    where: {
      provider: { in: ["discord", "roblox"] },
      OR: [
        { providerUsername: { contains: raw, mode: "insensitive" } },
        { providerEmail: { contains: lowerEmail, mode: "insensitive" } },
        { providerSubject: { contains: raw } }
      ]
    },
    include: { user: { include: userInclude } },
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const robloxDisplayMatches = await prisma.oAuthLink.findMany({
    where: {
      provider: "roblox",
      OR: [
        { metadata: { path: ["name"], string_contains: raw, mode: "insensitive" } },
        { metadata: { path: ["displayName"], string_contains: raw, mode: "insensitive" } }
      ]
    },
    include: { user: { include: userInclude } },
    orderBy: { updatedAt: "desc" },
    take: 20
  }).catch(() => []);

  const byId = new Map();
  for (const user of directUsers) byId.set(user.id, user);
  for (const link of oauthLinkMatches) {
    if (link.user?.id && link.user.id !== requesterUserId) byId.set(link.user.id, link.user);
  }
  for (const link of robloxDisplayMatches) {
    if (link.user?.id && link.user.id !== requesterUserId) byId.set(link.user.id, link.user);
  }

  return Array.from(byId.values())
    .filter((user) => giftRecipientMatches(user, normalized))
    .slice(0, 12)
    .map(publicGiftRecipient);
}

function normalizeGiftSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .trim();
}

function giftRecipientMatches(user, normalizedQuery) {
  const integrations = giftRecipientIntegrationData(user);
  const haystack = [
    user.email,
    user.emailNormalized,
    user.discordUsername,
    user.discordUserId,
    user.discordEmail,
    user.robloxUsername,
    user.robloxUserId,
    integrations.discord.username,
    integrations.discord.id,
    integrations.roblox.username,
    integrations.roblox.displayName,
    integrations.roblox.id
  ].map(normalizeGiftSearch).join(" ");
  return haystack.includes(normalizedQuery);
}

function giftRecipientIntegrationData(user) {
  const links = Array.isArray(user?.oauthLinks) ? user.oauthLinks : [];
  const byProvider = Object.fromEntries(links.map((link) => [link.provider, link]));
  return {
    discord: {
      connected: Boolean(user?.discordUserId && byProvider.discord),
      username: user?.discordUsername || byProvider.discord?.providerUsername || null,
      id: user?.discordUserId || byProvider.discord?.providerSubject || null,
      avatar: user?.discordAvatarUrl || null
    },
    roblox: {
      connected: Boolean(user?.robloxUserId && byProvider.roblox),
      username: user?.robloxUsername || byProvider.roblox?.providerUsername || null,
      displayName: byProvider.roblox?.metadata?.displayName || byProvider.roblox?.metadata?.name || user?.robloxUsername || null,
      id: user?.robloxUserId || byProvider.roblox?.providerSubject || null,
      avatar: user?.robloxAvatarUrl || null
    }
  };
}

function publicGiftRecipient(user) {
  const integrations = giftRecipientIntegrationData(user);
  return {
    id: user.id,
    maskedEmail: maskEmail(user.email),
    discord: integrations.discord,
    roblox: integrations.roblox
  };
}

async function getPendingGiftPackagesForUser(user) {
  if (!user?.id) return [];
  const email = normalizeEmail(user.email);
  return prisma.directGiftPackage.findMany({
    where: {
      status: "pending",
      OR: [
        { recipientUserId: user.id },
        { recipientEmail: email }
      ]
    },
    include: { recipientUser: true, license: true },
    orderBy: { createdAt: "desc" },
    take: 20
  });
}

async function getPurchasedGiftCodesForUser(user) {
  if (!user?.id) return [];
  const email = normalizeEmail(user.email);
  return prisma.giftCode.findMany({
    where: {
      OR: [
        { buyerUserId: user.id },
        { buyerEmail: email }
      ]
    },
    include: {
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: true, license: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

function normalizeGiftCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function hashGiftCode(code) {
  return crypto.createHash("sha256").update(normalizeGiftCode(code)).digest("hex");
}

function maskCode(code) {
  const normalized = normalizeGiftCode(code);
  if (!normalized) return "";
  const prefix = normalized.startsWith("FIMA-") ? "FIMA" : "CODE";
  const tail = normalized.replace(/-/g, "").slice(-4);
  return `${prefix}-****-****-${tail}`;
}

function maskGiftCode(code) {
  const normalized = normalizeGiftCode(code);
  if (!normalized) return "";
  const tail = normalized.replace(/-/g, "").slice(-4);
  return `FIMA-GIFT-****-${tail}`;
}

async function generateUniqueGiftCode(tx = prisma) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const token = crypto.randomBytes(10).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    const groups = token.match(/.{1,4}/g)?.join("-") || token;
    const code = `FIMA-GIFT-${groups}`;
    const existing = await tx.giftCode.findUnique({ where: { codeHash: hashGiftCode(code) } });
    if (!existing) return code;
  }
  throw new Error("gift_code_generation_failed");
}

function resolveGiftPlan(input = {}) {
  const directPlan = getPlan(input.plan || input.product || input.productId);
  if (directPlan) return directPlan;
  const alias = String(input.plan || input.duration || "").trim().toLowerCase().replace(/\s+/g, "");
  const aliasDays = {
    "1d": 1,
    "1day": 1,
    "3d": 3,
    "3day": 3,
    "3days": 3,
    "7d": 7,
    "7day": 7,
    "7days": 7,
    "15d": 15,
    "15day": 15,
    "15days": 15,
    "2weeks": 15,
    "1month": 30,
    "30d": 30,
    "30days": 30,
    "3months": 90,
    "90d": 90,
    "90days": 90
  };
  if (["lifetime", "life", "unlimited", "never"].includes(alias)) return getPlan("lifetime");
  const customAliasMatch = alias.match(/^gift_(\d+)d$/);
  if (customAliasMatch) {
    return {
      id: `gift_${customAliasMatch[1]}d`,
      name: `Fima Macro ${customAliasMatch[1]} Day Gift`,
      durationDays: Number(customAliasMatch[1]),
      lifetime: false
    };
  }
  const durationDays = toOptionalInt(input.durationDays) || aliasDays[alias];
  if (!durationDays || durationDays < 1 || durationDays > 3650) return null;
  return {
    id: `gift_${durationDays}d`,
    name: `Fima Macro ${durationDays} Day Gift`,
    durationDays,
    lifetime: false
  };
}

function giftAccessState(row) {
  if (!row) return { ok: false, code: "invalid_code", statusCode: 404 };
  if (row.status === "revoked") return { ok: false, code: "revoked", statusCode: 409 };
  if (row.status === "redeemed" || row.usedCount >= row.maxUses) return { ok: false, code: "already_redeemed", statusCode: 409 };
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return { ok: false, code: "expired", statusCode: 409 };
  return { ok: true };
}

async function validateGiftClaimRequirements(user, row) {
  if (!user?.id) throw giftError("account_required", 401);
  const integrations = await buildIntegrationSummary(user);
  if (row?.recipientUserId && row.recipientUserId !== user.id) throw giftError("account_mismatch", 403);
  if (row?.recipientEmail && normalizeAccountEmail(row.recipientEmail) !== normalizeAccountEmail(user.email)) {
    const recipient = normalizeEmail(row.recipientEmail);
    const username = usernameFromSyntheticEmail(user.email);
    if (!username || normalizeUsername(recipient) !== username) throw giftError("account_mismatch", 403);
  }
  return integrations;
}

function giftError(code, statusCode = 400) {
  const error = new Error(giftErrorMessage(code));
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function giftErrorMessage(code) {
  const messages = {
    account_required: "Please log in to your Fima account first.",
    discord_required: "Discord is optional on the website. Refresh your account and try again.",
    roblox_required: "Roblox is optional on the website. Refresh your account and try again.",
    discord_not_connected: "Discord is optional on the website. Refresh your account and try again.",
    roblox_not_connected: "Roblox is optional on the website. Refresh your account and try again.",
    account_mismatch: "This gift is assigned to a different account.",
    invalid_code: "Invalid gift code.",
    already_redeemed: "This gift code has already been used.",
    expired: "This gift code has expired.",
    revoked: "This gift code has been revoked.",
    wrong_recipient: "This gift is assigned to a different account.",
    package_not_found: "Gift package was not found.",
    direct_package_already_claimed: "This gift package has already been claimed.",
    direct_package_expired: "This gift package has expired."
  };
  return messages[code] || "Gift claim could not be completed.";
}

async function createGiftLicense(tx, { user, plan, source, sourceId, notes = null, hwid = null }) {
  return tx.license.create({
    data: {
      ...buildLicenseData({
        licenseKey: await generateUniqueLicenseKey(tx),
        email: normalizeEmail(user.email),
        plan,
        notes: `${source} ${sourceId || ""} user:${user.id}${notes ? ` note:${notes}` : ""}`.trim()
      }),
      hwid: normalizeHwid(hwid) || null
    }
  });
}

async function redeemGiftCodeForUser({ user, code, hwid = null }) {
  const normalizedCode = normalizeGiftCode(code);
  if (!normalizedCode) throw giftError("invalid_code", 400);
  const codeHash = hashGiftCode(normalizedCode);
  const existing = await prisma.giftCode.findUnique({ where: { codeHash } });
  const state = giftAccessState(existing);
  if (!state.ok) throw giftError(state.code, state.statusCode);
  const integrations = await validateGiftClaimRequirements(user, existing);
  const plan = resolveGiftPlan({ plan: existing.plan });
  if (!plan) throw giftError("invalid_code", 400);

  return prisma.$transaction(async (tx) => {
    const current = await tx.giftCode.findUnique({ where: { id: existing.id } });
    const currentState = giftAccessState(current);
    if (!currentState.ok) throw giftError(currentState.code, currentState.statusCode);
    const already = await tx.giftRedemption.findFirst({
      where: { giftCodeId: current.id, userId: user.id, result: "success" }
    });
    if (already) throw giftError("already_redeemed", 409);

    const nextUsedCount = current.usedCount + 1;
    const nextStatus = nextUsedCount >= current.maxUses ? "redeemed" : "active";
    const lock = await tx.giftCode.updateMany({
      where: {
        id: current.id,
        status: { in: ["unused", "active"] },
        usedCount: { lt: current.maxUses },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      data: {
        usedCount: { increment: 1 },
        status: nextStatus
      }
    });
    if (lock.count !== 1) throw giftError("already_redeemed", 409);

    const license = await createGiftLicense(tx, {
      user,
      plan,
      source: "gift_code",
      sourceId: current.id,
      notes: current.notes,
      hwid
    });
    const redemption = await tx.giftRedemption.create({
      data: {
        giftCodeId: current.id,
        userId: user.id,
        redeemedEmail: normalizeEmail(user.email),
        discordUserId: integrations.discord.id,
        robloxUserId: integrations.roblox.id,
        hwid: normalizeHwid(hwid) || null,
        licenseId: license.id,
        result: "success"
      }
    });
    await tx.auditLog.create({
      data: {
        action: "gift_code_redeemed",
        targetType: "gift_code",
        targetId: current.id,
        metadata: { userId: user.id, licenseId: license.id, redemptionId: redemption.id }
      }
    });
    return {
      license: publicLicense(license),
      giftCode: adminGiftCodePayload({ ...current, usedCount: nextUsedCount, status: nextStatus, redemptions: [{ ...redemption, user, license }] })
    };
  });
}

async function claimDirectGiftPackageForUser({ user, packageId, hwid = null }) {
  const id = String(packageId || "").trim();
  if (!id) throw giftError("package_not_found", 404);
  const packageRow = await prisma.directGiftPackage.findFirst({
    where: {
      id,
      OR: [{ recipientUserId: user.id }, { recipientEmail: normalizeEmail(user.email) }]
    }
  });
  if (!packageRow) throw giftError("package_not_found", 404);
  if (packageRow.status !== "pending") throw giftError("direct_package_already_claimed", 409);
  if (packageRow.claimExpiresAt && packageRow.claimExpiresAt.getTime() <= Date.now()) throw giftError("direct_package_expired", 409);
  const integrations = await validateGiftClaimRequirements(user, packageRow);
  const plan = resolveGiftPlan({ plan: packageRow.plan });
  if (!plan) throw giftError("package_not_found", 404);

  return prisma.$transaction(async (tx) => {
    const lock = await tx.directGiftPackage.updateMany({
      where: {
        id: packageRow.id,
        status: "pending",
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { gt: new Date() } }]
      },
      data: {
        status: "claimed",
        claimedAt: new Date(),
        claimedByUserId: user.id,
        claimedEmail: normalizeEmail(user.email),
        claimedDiscordId: integrations.discord.id,
        claimedRobloxId: integrations.roblox.id,
        claimedHwid: normalizeHwid(hwid) || null
      }
    });
    if (lock.count !== 1) throw giftError("direct_package_already_claimed", 409);
    const license = await createGiftLicense(tx, {
      user,
      plan,
      source: "direct_gift_package",
      sourceId: packageRow.id,
      notes: packageRow.notes,
      hwid
    });
    const claimed = await tx.directGiftPackage.update({
      where: { id: packageRow.id },
      data: { licenseId: license.id },
      include: { recipientUser: true, license: true }
    });
    await tx.auditLog.create({
      data: {
        action: "direct_gift_package_claimed",
        targetType: "direct_gift_package",
        targetId: packageRow.id,
        metadata: { userId: user.id, licenseId: license.id }
      }
    });
    return { license: publicLicense(license), package: publicDirectGiftPackage(claimed) };
  });
}

function publicDirectGiftPackage(row) {
  const claimExpired = Boolean(row.claimExpiresAt && row.claimExpiresAt.getTime() <= Date.now());
  const claimState = row.status === "pending" && claimExpired ? "expired" : row.status;
  return {
    id: row.id,
    recipientEmail: maskEmail(row.recipientEmail),
    plan: row.plan,
    planLabel: resolveGiftPlan({ plan: row.plan })?.name || row.plan,
    status: row.status,
    claimState,
    requiresDiscord: row.requiresDiscord,
    requiresRoblox: row.requiresRoblox,
    message: row.message || null,
    notes: row.notes || null,
    claimExpired,
    claimExpiresAt: row.claimExpiresAt ? row.claimExpiresAt.toISOString() : null,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
    licenseExpiresAt: row.license?.expiresAt ? row.license.expiresAt.toISOString() : null,
    license: row.license ? publicLicense(row.license) : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null
  };
}

function adminDirectGiftPackagePayload(row) {
  return {
    ...publicDirectGiftPackage(row),
    recipientEmailFull: null,
    recipientUser: row.recipientUser ? publicUser(row.recipientUser) : null,
    sentByAdminId: row.sentByAdminId || null,
    claimedByUserId: row.claimedByUserId || null,
    claimedEmail: row.claimedEmail || null,
    claimedDiscordId: row.claimedDiscordId || null,
    claimedRobloxId: row.claimedRobloxId || null,
    claimedHwid: row.claimedHwid || null,
    licenseId: row.licenseId || null
  };
}

function publicPurchasedGiftCode(row, includeCode = false) {
  const decryptedCode = includeCode ? decryptToken(row.codeCipher) : null;
  const plan = resolveGiftPlan({ plan: row.plan });
  const firstRedemption = row.redemptions?.[0] || null;
  const redeemed = row.status === "redeemed" || row.usedCount >= row.maxUses;
  const expired = Boolean(row.expiresAt && row.expiresAt.getTime() <= Date.now());
  return {
    id: row.id,
    giftCode: decryptedCode || null,
    codeAvailable: Boolean(decryptedCode),
    shownOnceOnly: includeCode && !decryptedCode,
    maskedCode: row.maskedCode,
    productName: plan?.name || "Fima Macro",
    plan: row.plan,
    planLabel: plan?.name?.replace(/^Fima Macro\s+/i, "") || row.plan,
    durationDays: plan?.durationDays ?? null,
    status: expired && !redeemed ? "expired" : row.status,
    used: redeemed,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    requiresDiscord: row.requiresDiscord,
    requiresRoblox: row.requiresRoblox,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    purchasedAt: row.purchasedAt ? row.purchasedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    redeemedAt: firstRedemption?.createdAt ? firstRedemption.createdAt.toISOString() : null,
    redeemedBy: firstRedemption?.user ? publicUser(firstRedemption.user) : null,
    generatedLicense: firstRedemption?.license ? publicLicense(firstRedemption.license) : null
  };
}

function adminGiftCodePayload(row) {
  return {
    id: row.id,
    maskedCode: row.maskedCode,
    codeAvailable: Boolean(row.codeCipher),
    plan: row.plan,
    planLabel: resolveGiftPlan({ plan: row.plan })?.name || row.plan,
    status: row.status,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    buyerUserId: row.buyerUserId || null,
    buyerEmail: row.buyerEmail ? maskEmail(row.buyerEmail) : null,
    buyerEmailFull: null,
    buyerDiscordId: maskDiscordId(row.buyerDiscordId),
    buyerRobloxId: maskExternalId(row.buyerRobloxId),
    stripeSessionId: maskExternalId(row.stripeSessionId),
    stripePaymentIntentId: maskExternalId(row.stripePaymentIntentId),
    purchasedAt: row.purchasedAt ? row.purchasedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    recipientEmail: row.recipientEmail ? maskEmail(row.recipientEmail) : null,
    recipientUserId: row.recipientUserId || null,
    requiresDiscord: row.requiresDiscord,
    requiresRoblox: row.requiresRoblox,
    createdByAdminId: row.createdByAdminId || null,
    notes: row.notes || null,
    redemptions: (row.redemptions || []).map((redemption) => ({
      id: redemption.id,
      userId: redemption.userId,
      email: redemption.redeemedEmail ? maskEmail(redemption.redeemedEmail) : null,
      discordUserId: redemption.discordUserId || null,
      robloxUserId: redemption.robloxUserId || null,
      hwid: redemption.hwid || null,
      result: redemption.result,
      reason: redemption.reason || null,
      license: redemption.license ? publicLicense(redemption.license) : null,
      user: redemption.user ? publicUser(redemption.user) : null,
      createdAt: redemption.createdAt ? redemption.createdAt.toISOString() : null
    })),
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
  };
}

function maskEmail(email) {
  const text = normalizeEmail(email);
  const [local, domain] = text.split("@");
  if (!local || !domain) return "";
  const first = local.slice(0, 1);
  const last = local.length > 2 ? local.slice(-1) : "";
  return `${first}***${last}@${domain}`;
}

function maskDiscordId(discordUserId) {
  const text = String(discordUserId || "").trim();
  if (!text) return null;
  if (text.length <= 6) return "***";
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function maskExternalId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function referralCodePrefix(user) {
  const base = String(user?.robloxUsername || user?.discordUsername || user?.email?.split("@")[0] || "USER")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  return base || "USER";
}

function randomReferralSuffix(length = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

function preferredReferralCodeForUser(user) {
  const robloxUsername = String(user?.robloxUsername || "").trim().toLowerCase();
  const robloxUserId = String(user?.robloxUserId || "").trim();
  if (robloxUsername === "fieelcomplex" || robloxUserId === "549482728") {
    return "FIMA-FIEELCOMPL-SMGS";
  }
  return null;
}

function privacyHash(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return crypto.createHmac("sha256", oauthSecret()).update(text).digest("hex");
}

function requestIpHash(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return privacyHash(forwarded || req.ip || req.socket?.remoteAddress || "");
}

function requestUserAgentHash(req) {
  return privacyHash(req.headers?.["user-agent"] || "");
}

async function ensureReferralCodeForUser(userOrId, tx = prisma) {
  const user = typeof userOrId === "string"
    ? await tx.user.findUnique({ where: { id: userOrId } })
    : userOrId;
  if (!user?.id) throw new Error("referral_user_missing");

  const existing = await tx.referralCode.findUnique({ where: { userId: user.id } });
  const preferredCode = preferredReferralCodeForUser(user);
  if (existing) {
    if (preferredCode && existing.code !== preferredCode && /^FIMA-KAAN-/i.test(existing.code)) {
      const taken = await tx.referralCode.findUnique({ where: { code: preferredCode } });
      if (!taken || taken.userId === user.id) {
        return await tx.referralCode.update({ where: { userId: user.id }, data: { code: preferredCode } });
      }
    }
    return existing;
  }

  if (preferredCode) {
    const taken = await tx.referralCode.findUnique({ where: { code: preferredCode } });
    if (!taken || taken.userId === user.id) {
      return await tx.referralCode.upsert({
        where: { userId: user.id },
        create: { userId: user.id, code: preferredCode },
        update: { code: preferredCode }
      });
    }
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = normalizeReferralCode(`FIMA-${referralCodePrefix(user)}-${randomReferralSuffix(4)}`);
    try {
      return await tx.referralCode.create({ data: { userId: user.id, code } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }
  throw new Error("referral_code_generation_failed");
}

function referralError(code, statusCode = 400, softFail = false) {
  if (softFail) return { applied: false, error: code };
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

async function applyReferralCodeToUser({ code, referredUserId, req, softFail = false }) {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return referralError("invalid_referral_code", 400, softFail);

  const [existingReferral, referralCode] = await Promise.all([
    prisma.referral.findUnique({ where: { referredUserId } }),
    prisma.referralCode.findUnique({ where: { code: normalizedCode }, include: { user: true } })
  ]);
  if (existingReferral) {
    if (softFail) return { applied: false, error: "referral_already_used", referralId: existingReferral.id, status: existingReferral.status };
    return referralError("referral_already_used", 409, softFail);
  }
  if (!referralCode) return referralError("invalid_referral_code", 404, softFail);
  if (referralCode.userId === referredUserId) return referralError("self_referral_not_allowed", 400, softFail);

  const referral = await prisma.referral.create({
    data: {
      referralCodeId: referralCode.id,
      referrerUserId: referralCode.userId,
      referredUserId,
      status: "pending",
      statusReason: "waiting_for_discord_and_roblox",
      ipHash: requestIpHash(req),
      userAgentHash: requestUserAgentHash(req)
    }
  });
  await createAuditLog("referral_applied", "referral", referral.id, { referrerUserId: referralCode.userId, referredUserId, code: normalizedCode });
  const evaluated = await evaluateReferralForUser(referredUserId);
  return {
    applied: true,
    referralId: referral.id,
    status: evaluated?.status || referral.status,
    code: normalizedCode
  };
}

async function evaluateReferralForUser(userId) {
  const referral = await prisma.referral.findUnique({
    where: { referredUserId: userId },
    include: {
      referred: { include: { oauthLinks: true } },
      referrer: true,
      referralCode: true
    }
  });
  if (!referral) return null;
  if (["rejected"].includes(referral.status)) return referral;

  const integrations = await buildIntegrationSummary(referral.referred);
  const emailVerified = Boolean(referral.referred.emailVerifiedAt);
  const discordConnected = Boolean(integrations.discord.connected && integrations.discord.id);
  const robloxConnected = Boolean(integrations.roblox.connected && integrations.roblox.id);
  const [discordDuplicateCount, robloxDuplicateCount, sameIpCount] = await Promise.all([
    discordConnected
      ? prisma.user.count({ where: { discordUserId: integrations.discord.id, id: { not: referral.referredUserId } } })
      : 0,
    robloxConnected
      ? prisma.user.count({ where: { robloxUserId: integrations.roblox.id, id: { not: referral.referredUserId } } })
      : 0,
    referral.ipHash
      ? prisma.referral.count({
          where: {
            referrerUserId: referral.referrerUserId,
            ipHash: referral.ipHash,
            referredUserId: { not: referral.referredUserId }
          }
        })
      : 0
  ]);

  const riskFlags = [];
  if (discordDuplicateCount > 0) riskFlags.push("duplicate_discord");
  if (robloxDuplicateCount > 0) riskFlags.push("duplicate_roblox");
  if (sameIpCount >= 3) riskFlags.push("many_referrals_same_ip");

  const missing = [];
  if (!emailVerified) missing.push("email");
  if (!discordConnected) missing.push("discord");
  if (!robloxConnected) missing.push("roblox");

  let nextStatus = "pending";
  let statusReason = missing.length ? `missing_${missing.join("_")}` : "verified";
  if (riskFlags.length) {
    nextStatus = "flagged_for_review";
    statusReason = riskFlags.join(",");
  } else if (!missing.length) {
    nextStatus = "valid";
  }

  for (const flag of riskFlags) {
    const existing = await prisma.referralAbuseFlag.findFirst({ where: { referralId: referral.id, type: flag, status: "open" } });
    if (!existing) {
      await prisma.referralAbuseFlag.create({
        data: {
          referralId: referral.id,
          type: flag,
          severity: flag === "many_referrals_same_ip" ? "medium" : "high",
          metadata: { discordDuplicateCount, robloxDuplicateCount, sameIpCount }
        }
      });
    }
  }

  const verification = {
    emailVerified,
    emailVerifiedAt: referral.referred.emailVerifiedAt?.toISOString?.() || null,
    discordConnected,
    discordUserId: integrations.discord.id || null,
    discordUsername: integrations.discord.username || null,
    robloxConnected,
    robloxUserId: integrations.roblox.id || null,
    robloxUsername: integrations.roblox.username || null,
    riskFlags,
    sameIpCount,
    evaluatedAt: new Date().toISOString()
  };

  const updated = await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: nextStatus,
      statusReason,
      verification
    },
    include: {
      referralCode: true,
      referrer: true,
      referred: true,
      abuseFlags: { orderBy: { createdAt: "desc" }, take: 5 }
    }
  });

  if (nextStatus === "valid") {
    await grantReferralRewardsIfEligible(referral.referrerUserId);
  }
  return updated;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function appendReferralNote(current, line) {
  return [String(current || "").trim(), line].filter(Boolean).join("\n").slice(0, 2000);
}

async function grantReferralRewardsIfEligible(referrerUserId) {
  const validCount = await prisma.referral.count({ where: { referrerUserId, status: "valid" } });
  const targetRewardCount = Math.floor(validCount / REFERRAL_REWARD_VALID_INVITES);
  const existingRewardCount = await prisma.referralReward.count({
    where: { userId: referrerUserId, status: { notIn: ["revoked", "canceled"] } }
  });
  if (targetRewardCount <= existingRewardCount) return [];

  const createdRewards = [];
  for (let rewardNumber = existingRewardCount + 1; rewardNumber <= targetRewardCount; rewardNumber += 1) {
    const reward = await prisma.$transaction(async (tx) => {
      const referrer = await tx.user.findUnique({ where: { id: referrerUserId } });
      if (!referrer) throw new Error("referrer_missing");
      const chunk = await tx.referral.findMany({
        where: { referrerUserId, status: "valid", rewardGranted: false },
        orderBy: { createdAt: "asc" },
        take: REFERRAL_REWARD_VALID_INVITES
      });
      if (chunk.length < REFERRAL_REWARD_VALID_INVITES) return null;

      const now = new Date();
      const activeLicense = await tx.license.findFirst({
        where: {
          customerEmail: referrer.email,
          status: "active",
          lifetime: false,
          expiresAt: { gt: now }
        },
        orderBy: { expiresAt: "desc" }
      });

      let license;
      if (activeLicense) {
        license = await tx.license.update({
          where: { id: activeLicense.id },
          data: {
            expiresAt: addDays(activeLicense.expiresAt || now, REFERRAL_REWARD_DAYS),
            notes: appendReferralNote(activeLicense.notes, `referral_reward +${REFERRAL_REWARD_DAYS}d reward:${rewardNumber}`)
          }
        });
      } else {
        const plan = getPlan("2weeks");
        license = await tx.license.create({
          data: {
            licenseKey: await generateUniqueLicenseKey(tx),
            customerEmail: referrer.email,
            plan: plan?.id || "2weeks",
            status: "active",
            hwid: null,
            expiresAt: addDays(now, REFERRAL_REWARD_DAYS),
            lifetime: false,
            notes: `referral_reward user:${referrer.id} reward:${rewardNumber} invites:${chunk.map((item) => item.id).join(",")}`
          }
        });
      }

      await tx.referral.updateMany({
        where: { id: { in: chunk.map((item) => item.id) } },
        data: { rewardGranted: true }
      });

      const created = await tx.referralReward.create({
        data: {
          userId: referrer.id,
          licenseId: license.id,
          rewardNumber,
          validCountAtAward: validCount,
          days: REFERRAL_REWARD_DAYS,
          status: "granted",
          referralIds: chunk.map((item) => item.id),
          grantedAt: now,
          notes: activeLicense ? "extended_existing_license" : "created_referral_reward_license"
        }
      });

      await tx.auditLog.create({
        data: {
          action: "referral_reward_granted",
          targetType: "referral_reward",
          targetId: created.id,
          metadata: {
            userId: referrer.id,
            licenseId: license.id,
            rewardNumber,
            days: REFERRAL_REWARD_DAYS,
            referralIds: chunk.map((item) => item.id)
          }
        }
      });
      return created;
    });
    if (reward) createdRewards.push(reward);
  }
  return createdRewards;
}

async function buildReferralSummary(userId, options = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const code = await ensureReferralCodeForUser(user);
  if (options.evaluate) {
    await evaluateReferralForUser(userId).catch((error) => {
      console.warn("Referral self evaluation failed", { userId, ...publicError(error) });
    });
  }
  const [referrals, rewards, incoming] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: { referred: true, abuseFlags: { orderBy: { createdAt: "desc" }, take: 3 } },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.referralReward.findMany({
      where: { userId },
      include: { license: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.referral.findUnique({
      where: { referredUserId: userId },
      include: { referralCode: true, referrer: true, abuseFlags: { orderBy: { createdAt: "desc" }, take: 3 } }
    })
  ]);
  const counts = {
    total: referrals.length,
    valid: referrals.filter((item) => item.status === "valid").length,
    pending: referrals.filter((item) => item.status === "pending").length,
    rejected: referrals.filter((item) => item.status === "rejected").length,
    flagged: referrals.filter((item) => item.status === "flagged_for_review").length
  };
  const nextProgress = counts.valid % REFERRAL_REWARD_VALID_INVITES;
  return {
    code: code.code,
    link: `${frontendUrl()}/register?ref=${encodeURIComponent(code.code)}`,
    rewardRule: {
      requiredValidInvites: REFERRAL_REWARD_VALID_INVITES,
      rewardDays: REFERRAL_REWARD_DAYS
    },
    counts,
    progress: {
      current: nextProgress,
      required: REFERRAL_REWARD_VALID_INVITES,
      remaining: REFERRAL_REWARD_VALID_INVITES - nextProgress
    },
    referrals: referrals.map(publicReferral),
    incoming: incoming ? publicReferral(incoming, { incoming: true }) : null,
    rewards: rewards.map(publicReferralReward)
  };
}

function publicReferral(referral, options = {}) {
  const user = options.incoming ? referral.referrer : referral.referred;
  return {
    id: referral.id,
    status: referral.status,
    statusReason: referral.statusReason,
    code: referral.referralCode?.code || null,
    rewardGranted: Boolean(referral.rewardGranted),
    createdAt: referral.createdAt?.toISOString?.() || null,
    updatedAt: referral.updatedAt?.toISOString?.() || null,
    user: user ? {
      maskedEmail: maskEmail(user.email),
      discordUsername: user.discordUsername || null,
      robloxUsername: user.robloxUsername || null,
      robloxAvatarUrl: user.robloxAvatarUrl || null
    } : null,
    flags: (referral.abuseFlags || []).map((flag) => ({ type: flag.type, severity: flag.severity, status: flag.status }))
  };
}

function publicReferralReward(reward) {
  return {
    id: reward.id,
    rewardNumber: reward.rewardNumber,
    validCountAtAward: reward.validCountAtAward,
    days: reward.days,
    status: reward.status,
    grantedAt: reward.grantedAt?.toISOString?.() || null,
    license: reward.license ? publicLicense(reward.license) : null
  };
}

function adminReferralPayload(referral) {
  return {
    id: referral.id,
    code: referral.referralCode?.code || null,
    status: referral.status,
    statusReason: referral.statusReason,
    verification: referral.verification || null,
    rewardGranted: referral.rewardGranted,
    notes: referral.notes || null,
    createdAt: referral.createdAt?.toISOString?.() || null,
    updatedAt: referral.updatedAt?.toISOString?.() || null,
    referrer: referral.referrer ? publicUser(referral.referrer) : null,
    referred: referral.referred ? publicUser(referral.referred) : null,
    flags: (referral.abuseFlags || []).map((flag) => ({
      id: flag.id,
      type: flag.type,
      severity: flag.severity,
      status: flag.status,
      metadata: flag.metadata || null,
      createdAt: flag.createdAt?.toISOString?.() || null
    }))
  };
}

async function buildMonthlyTrialSummary(user, now = new Date(), integrations = null) {
  const promo = getTrialPromoConfig(process.env, now);
  const linked = integrations || await buildIntegrationSummary(user);
  const activeTrial = await findActiveMonthlyTrial(user, now);
  const promoAlreadyClaimed = promo.active ? await findPromoTrial(user) : null;
  const requirements = [
    { id: "account", label: "Fima account logged in", complete: Boolean(user?.id), action: null },
    { id: "discord", label: "Discord connected", complete: Boolean(linked.discord?.connected), action: "connect_discord" }
  ];
  const missing = requirements.filter((item) => !item.complete).map((item) => item.id);
  const nextTrialAvailableAt = promo.active ? null : user?.nextTrialAvailableAt || null;
  const cooldownActive = Boolean(nextTrialAvailableAt && nextTrialAvailableAt > now);
  const cooldownSeconds = cooldownActive ? Math.ceil((nextTrialAvailableAt.getTime() - now.getTime()) / 1000) : 0;
  const activeSeconds = activeTrial?.expiresAt ? Math.max(0, Math.ceil((activeTrial.expiresAt.getTime() - now.getTime()) / 1000)) : 0;
  const paidAccessActive = await hasActivePaidLicense(user, now);

  let disabledReason = null;
  if (activeTrial) disabledReason = "trial_already_active";
  else if (missing.includes("discord")) disabledReason = "discord_not_connected";
  else if (promoAlreadyClaimed) disabledReason = "trial_already_claimed";
  else if (cooldownActive) disabledReason = "trial_cooldown_active";

  return {
    promo: publicTrialPromo(promo),
    durationDays: promo.currentTrialDays,
    label: promo.active ? `${promo.promoDays}-Day Free Trial` : `${promo.normalDays}-Day Free Trial`,
    requirements,
    missing,
    eligible: requirements.every((item) => item.complete) && !activeTrial && !promoAlreadyClaimed && !cooldownActive,
    disabledReason,
    active: Boolean(activeTrial),
    activeLicense: activeTrial ? publicLicense(activeTrial) : null,
    expiresAt: activeTrial?.expiresAt ? activeTrial.expiresAt.toISOString() : user?.trialExpiresAt?.toISOString?.() || null,
    activeSeconds,
    nextTrialAvailableAt: nextTrialAvailableAt ? nextTrialAvailableAt.toISOString() : null,
    cooldownActive,
    cooldownSeconds,
    status: activeTrial ? "active" : cooldownActive ? "cooldown" : requirements.every((item) => item.complete) ? "available" : "locked",
    claimCount: user?.monthlyTrialClaimCount || 0,
    promoClaimed: Boolean(promoAlreadyClaimed),
    promoSource: promoAlreadyClaimed ? promo.source : null,
    paidAccessActive,
    priorityRule: paidAccessActive ? "paid_access_has_priority; monthly trial remains optional" : "trial_access"
  };
}

async function findActiveMonthlyTrial(user, now = new Date()) {
  if (!user?.email) return null;
  return prisma.license.findFirst({
    where: {
      customerEmail: user.email,
      status: "active",
      expiresAt: { gt: now },
      OR: [
        { notes: { contains: "monthly_trial", mode: "insensitive" } },
        { notes: { contains: "trial_promo_7d_beta", mode: "insensitive" } }
      ]
    },
    orderBy: { expiresAt: "desc" }
  });
}

async function findPromoTrial(user) {
  if (!user?.email) return null;
  return prisma.license.findFirst({
    where: {
      customerEmail: user.email,
      notes: { contains: "trial_promo_7d_beta", mode: "insensitive" }
    },
    orderBy: { createdAt: "desc" }
  });
}

function publicTrialPromo(promo = getTrialPromoConfig(process.env, new Date())) {
  return {
    active: promo.active,
    enabled: promo.enabled,
    campaign: promo.campaign,
    source: promo.source,
    days: promo.currentTrialDays,
    promoDays: promo.promoDays,
    normalDays: promo.normalDays,
    endAt: promo.endAtIso,
    label: promo.active ? `${promo.promoDays}-Day Free Trial` : `${promo.normalDays}-Day Free Trial`
  };
}

async function hasActivePaidLicense(user, now = new Date()) {
  if (!user?.email) return false;
  const license = await prisma.license.findFirst({
    where: {
      customerEmail: user.email,
      status: "active",
      OR: [{ lifetime: true }, { expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [
        {
          OR: [
            { notes: null },
            { NOT: { notes: { contains: "monthly_trial", mode: "insensitive" } } }
          ]
        }
      ],
      NOT: [
        { notes: { contains: "trial_promo_7d_beta", mode: "insensitive" } }
      ]
    },
    select: { id: true }
  });
  return Boolean(license);
}

function addCalendarMonth(date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

async function createStripeCustomerIfPossible(email) {
  try {
    const customer = await stripe().customers.create({
      email,
      metadata: {
        app: env("APP_NAME", "Fima Macro"),
        account_email: email
      }
    });
    return customer.id;
  } catch (error) {
    if (error.code === "missing_env") return null;
    console.warn("Stripe customer create failed", publicError(error));
    return null;
  }
}

async function ensureUserStripeCustomer(user) {
  if (user.stripeCustomerId) return user;
  const stripeCustomerId = await createStripeCustomerIfPossible(user.email);
  if (!stripeCustomerId) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId }
  });
}

function publicProduct(product) {
  const activePrice = product.prices?.find((price) => price.active) || product.prices?.[0] || null;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    image: product.image,
    active: product.active,
    price: activePrice
      ? {
          id: activePrice.id,
          amount: activePrice.amount,
          currency: activePrice.currency,
          active: activePrice.active
        }
      : null
  };
}

function publicPurchase(purchase) {
  return {
    id: purchase.id,
    productId: purchase.productId,
    product: purchase.product ? {
      id: purchase.product.id,
      name: purchase.product.name,
      description: purchase.product.description,
      category: purchase.product.category,
      image: purchase.product.image,
      active: purchase.product.active,
      price: purchase.product.prices ? publicProduct(purchase.product).price : undefined
    } : null,
    amountTotal: purchase.amountTotal,
    currency: purchase.currency,
    status: purchase.status,
    createdAt: purchase.createdAt
  };
}

async function getAccountAccess(user) {
  return Promise.all([
    prisma.purchase.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { product: { include: { prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } } } } }
    }),
    prisma.license.findMany({
      where: { customerEmail: user.email },
      orderBy: { createdAt: "desc" }
    })
  ]);
}

function publicLicense(license) {
  const plan = getPlan(license.plan);
  const expiresAt = license.expiresAt ? license.expiresAt.toISOString() : null;
  const remainingSeconds = license.lifetime
    ? null
    : Math.max(0, Math.floor(((license.expiresAt?.getTime() || Date.now()) - Date.now()) / 1000));
  const { licenseKey: _licenseKey, customerEmail: _customerEmail, ...safePayload } = licensePayload(license);

  return {
    ...safePayload,
    id: license.id,
    hasLicenseKey: Boolean(license.licenseKey),
    licenseKey: null,
    licenseKeyMasked: maskCode(license.licenseKey),
    customerEmail: maskEmail(license.customerEmail),
    customerEmailMasked: maskEmail(license.customerEmail),
    status: license.status,
    planLabel: plan?.name?.replace(/^Fima Macro\s+/i, "") || license.plan,
    durationDays: plan?.durationDays ?? null,
    expiresAt,
    remainingSeconds,
    expired: !license.lifetime && Boolean(license.expiresAt) && license.expiresAt.getTime() < Date.now(),
    source: licenseSource(license),
    canExtend: license.status !== "banned" && !license.lifetime,
    validationCount: license.validationCount || 0,
    downloadCount: license.downloadCount || 0,
    lastValidatedAt: license.lastValidatedAt ? license.lastValidatedAt.toISOString() : null,
    lastDownloadedAt: license.lastDownloadedAt ? license.lastDownloadedAt.toISOString() : null,
    createdAt: license.createdAt ? license.createdAt.toISOString() : null
  };
}

function buildAccountProducts(purchases, licenses) {
  const purchaseCards = purchases.map((purchase) => ({
    id: `purchase:${purchase.id}`,
    type: "purchase",
    name: purchase.product?.name || "Fima Product",
    category: purchase.product?.category || "Product",
    status: purchase.status,
    amountTotal: purchase.amountTotal,
    currency: purchase.currency,
    createdAt: purchase.createdAt,
    product: purchase.product ? publicProduct(purchase.product) : null,
    license: null
  }));

  const licenseCards = licenses.map((license) => {
    const plan = getPlan(license.plan);
    return {
      id: `license:${license.id}`,
      type: "license",
      name: plan?.name || `Fima Macro ${license.plan}`,
      category: "License",
      status: license.status,
      amountTotal: null,
      currency: "eur",
      createdAt: license.createdAt,
      product: null,
      license: publicLicense(license)
    };
  });

  return [...licenseCards, ...purchaseCards].sort((left, right) =>
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  );
}

function sanitizeProductInput(input) {
  return {
    name: String(input.name || "").trim().slice(0, 120),
    description: String(input.description || "").trim().slice(0, 2000) || null,
    category: String(input.category || "").trim().slice(0, 80) || null,
    image: safeUrl(input.image),
    active: input.active !== false
  };
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function parseOptionalDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addCompensationDuration(baseDate, duration, customDays, customDateValue) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;
  if (duration === "1day" || duration === "1_day") {
    date.setDate(date.getDate() + 1);
  } else if (duration === "3days" || duration === "3_days") {
    date.setDate(date.getDate() + 3);
  } else if (duration === "1week") {
    date.setDate(date.getDate() + 7);
  } else if (duration === "2weeks") {
    date.setDate(date.getDate() + 14);
  } else if (duration === "15days" || duration === "15_days") {
    date.setDate(date.getDate() + 15);
  } else if (duration === "1month") {
    date.setMonth(date.getMonth() + 1);
  } else if (duration === "3months") {
    date.setMonth(date.getMonth() + 3);
  } else if (duration === "3months_2weeks" || duration === "3months+2weeks" || duration === "3_months_2_weeks") {
    date.setMonth(date.getMonth() + 3);
    date.setDate(date.getDate() + 14);
  } else if (duration === "6months" || duration === "6_months") {
    date.setMonth(date.getMonth() + 6);
  } else if (duration === "1year" || duration === "1_year") {
    date.setFullYear(date.getFullYear() + 1);
  } else if (duration === "custom") {
    const days = toOptionalInt(customDays);
    if (!days || days < 1 || days > 3650) return null;
    date.setDate(date.getDate() + days);
  } else if (duration === "custom_date" || duration === "customdate") {
    const customDate = parseOptionalDate(customDateValue);
    if (!customDate || customDate <= new Date()) return null;
    return customDate;
  } else {
    return null;
  }
  return date;
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

async function fulfillProductCheckoutSession(session) {
  if (session.payment_status && session.payment_status !== "paid") throw new Error("Session is not paid");
  const userId = String(session.metadata?.user_id || "").trim();
  const productId = String(session.metadata?.product_id || "").trim();
  if (!userId || !productId) throw new Error("Product checkout missing metadata");

  const existing = await prisma.purchase.findUnique({ where: { stripeCheckoutSessionId: session.id } });
  if (existing) return { purchase: existing };

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const again = await tx.purchase.findUnique({ where: { stripeCheckoutSessionId: session.id } });
      if (again) return { purchase: again };

      const [user, product] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        tx.product.findUnique({ where: { id: productId } })
      ]);
      if (!user) throw new Error("Product checkout user not found");
      if (!product) throw new Error("Product checkout product not found");

      const purchase = await tx.purchase.create({
        data: {
          userId,
          productId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          amountTotal: session.amount_total ?? 0,
          currency: String(session.currency || "eur").toLowerCase(),
          status: session.payment_status || "paid"
        }
      });

      await tx.customer.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          totalSpent: purchase.amountTotal,
          totalOrders: 1,
          firstPurchaseAt: new Date(),
          lastPurchaseAt: new Date()
        },
        update: {
          totalSpent: { increment: purchase.amountTotal },
          totalOrders: { increment: 1 },
          lastPurchaseAt: new Date()
        }
      });

      await tx.analyticsEvent.create({
        data: {
          type: "product_checkout_completed",
          amount: purchase.amountTotal,
          currency: purchase.currency,
          mode: session.livemode ? "live" : "test",
          metadata: { userId, productId, productName: product.name }
        }
      });

      return { purchase };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const purchase = await prisma.purchase.findUnique({ where: { stripeCheckoutSessionId: session.id } });
      if (purchase) return { purchase };
    }
    throw error;
  }
}

async function fulfillCheckoutSession(session) {
  const plan = getPlan(session.metadata?.plan);
  if (!plan) throw new Error("Invalid or missing session metadata plan");
  if (session.payment_status && session.payment_status !== "paid") throw new Error("Session is not paid");

  const existing = await findOrderBySession(session.id);
  if (existing?.license) return existing;

  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Checkout session missing customer email");

  const buyerUserId = String(session.metadata?.userId || session.metadata?.user_id || "").trim();
  const giftRecipientUserId = String(session.metadata?.giftRecipientUserId || "").trim();
  let recipientEmail = email;
  let recipientUser = null;
  let giftNote = null;
  if (giftRecipientUserId) {
    recipientUser = await prisma.user.findUnique({ where: { id: giftRecipientUserId } });
    if (!recipientUser || !isValidEmail(recipientUser.email)) throw new Error("Gift recipient user not found");
    recipientEmail = normalizeEmail(recipientUser.email);
    giftNote = `gift_purchase buyer:${email} buyerUser:${buyerUserId || "unknown"} recipientUser:${giftRecipientUserId}`;
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id || null;
  const extensionKey = normalizeLicenseKey(session.metadata?.extendLicenseKey);
  const isExtension = session.metadata?.checkoutType === "license_extension" && extensionKey;
  const isGiftCodePurchase = session.metadata?.checkoutType === "gift_code_purchase" || session.metadata?.giftCodePurchase === "true";

  try {
    return await prisma.$transaction(async (tx) => {
      const again = await tx.order.findUnique({
        where: { stripeSessionId: session.id },
        include: { license: true }
      });
      if (isGiftCodePurchase) {
        const existingGiftCode = await tx.giftCode.findUnique({
          where: { stripeSessionId: session.id },
          include: {
            redemptions: {
              include: { user: true, license: true },
              orderBy: { createdAt: "desc" },
              take: 5
            }
          }
        });
        if (again && existingGiftCode) return { order: again, giftCode: existingGiftCode };

        const buyerUser = buyerUserId ? await tx.user.findUnique({ where: { id: buyerUserId } }) : null;
        const code = await generateUniqueGiftCode(tx);
        const giftCode = await tx.giftCode.create({
          data: {
            codeHash: hashGiftCode(code),
            codeCipher: encryptToken(code),
            maskedCode: maskGiftCode(code),
            plan: plan.id,
            status: "unused",
            maxUses: 1,
            buyerUserId: buyerUser?.id || buyerUserId || null,
            buyerEmail: buyerUser?.email ? normalizeEmail(buyerUser.email) : email,
            buyerDiscordId: buyerUser?.discordUserId || null,
            buyerRobloxId: buyerUser?.robloxUserId || null,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            purchasedAt: new Date(),
            requiresDiscord: false,
            requiresRoblox: false,
            notes: `gift_code_purchase buyer:${email} buyerUser:${buyerUserId || "unknown"}`
          },
          include: { redemptions: { include: { user: true, license: true } } }
        });

        const order = await tx.order.upsert({
          where: { stripeSessionId: session.id },
          create: {
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            customerEmail: email,
            plan: plan.id,
            amount: session.amount_total ?? getPlanCommerce(plan).priceCents,
            currency: String(session.currency || getPlanCommerce(plan).currency).toLowerCase(),
            status: session.payment_status || "paid",
            mode: session.livemode ? "live" : "test",
            locale: session.locale || null,
            notes: `gift_code_purchase giftCodeId:${giftCode.id}`,
            licenseId: null
          },
          update: {
            stripePaymentIntentId: paymentIntentId,
            customerEmail: email,
            status: session.payment_status || "paid",
            mode: session.livemode ? "live" : "test",
            locale: session.locale || null,
            notes: `gift_code_purchase giftCodeId:${giftCode.id}`,
            licenseId: null
          },
          include: { license: true }
        });

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
            type: "gift_code_checkout_completed",
            plan: plan.id,
            amount: order.amount,
            currency: order.currency,
            mode: order.mode,
            metadata: { buyerEmail: email, buyerUserId: buyerUserId || null, giftCodeId: giftCode.id }
          }
        });
        await tx.auditLog.create({
          data: {
            action: "gift_code_purchased",
            targetType: "gift_code",
            targetId: giftCode.id,
            metadata: { orderId: order.id, plan: plan.id, buyerEmail: maskEmail(email), buyerUserId: buyerUserId || null }
          }
        });

        return { order, giftCode };
      }
      if (again?.license) return again;

      let license;
      if (isExtension) {
        const current = await tx.license.findFirst({
          where: { licenseKey: extensionKey, customerEmail: email }
        });
        if (!current) throw new Error("Extension target license not found");
        const baseDate = current.expiresAt && current.expiresAt > new Date() ? current.expiresAt : new Date();
        license = await tx.license.update({
          where: { id: current.id },
          data: {
            plan: plan.id,
            lifetime: plan.lifetime,
            expiresAt: plan.lifetime ? null : getPlanExpiry(plan, baseDate),
            stripePaymentIntentId: paymentIntentId,
            status: "active"
          }
        });
      } else {
        license = await tx.license.create({
          data: buildLicenseData({
            licenseKey: await generateUniqueLicenseKey(tx),
            email: recipientEmail,
            plan,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            notes: subscriptionId ? appendNote(giftNote, `stripe_subscription:${subscriptionId}`) : giftNote
          })
        });
      }

      const order = await tx.order.upsert({
        where: { stripeSessionId: session.id },
        create: {
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          customerEmail: recipientEmail,
          plan: plan.id,
          amount: session.amount_total ?? getPlanCommerce(plan).priceCents,
          currency: String(session.currency || getPlanCommerce(plan).currency).toLowerCase(),
          status: session.payment_status || "paid",
          mode: session.livemode ? "live" : "test",
          locale: session.locale || null,
          notes: giftNote,
          licenseId: license.id
        },
        update: {
          stripePaymentIntentId: paymentIntentId,
          customerEmail: recipientEmail,
          status: session.payment_status || "paid",
          mode: session.livemode ? "live" : "test",
          locale: session.locale || null,
          notes: giftNote,
          licenseId: license.id
        },
        include: { license: true }
      });

      if (!again) {
        await tx.customer.upsert({
          where: { email: recipientEmail },
          create: {
            email: recipientEmail,
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
            type: isExtension ? "license_extension_completed" : "checkout_completed",
            plan: plan.id,
            amount: order.amount,
            currency: order.currency,
            mode: order.mode,
            metadata: {
              priceSource: "stripe_webhook",
              extended: Boolean(isExtension),
              gift: Boolean(giftRecipientUserId),
              buyerEmail: email,
              buyerUserId: buyerUserId || null,
              recipientUserId: giftRecipientUserId || null
            }
          }
        });
      }

      return order;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const order = await findOrderBySession(session.id);
      const giftCode = await findGiftCodeBySession(session.id);
      if (order && giftCode) return { order, giftCode };
      if (order?.license) return order;
    }
    throw error;
  }
}

async function syncStripeSubscriptionState(subscription, eventType = "customer.subscription.updated") {
  const subscriptionId = String(subscription?.id || "");
  if (!subscriptionId) return null;
  const license = await findLicenseBySubscriptionId(subscriptionId);
  if (!license) {
    await createAnalyticsEvent("subscription_sync_no_license", {
      mode: subscription?.livemode ? "live" : "test",
      metadata: { subscriptionId, eventType, status: subscription?.status || null }
    });
    return { subscriptionId };
  }
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : license.expiresAt;
  const status = subscription.status === "canceled" || subscription.status === "unpaid" ? "expired" : "active";
  const notes = appendNote(license.notes, `stripe_subscription_status:${subscription.status || "unknown"}`);
  const updated = await prisma.license.update({
    where: { id: license.id },
    data: {
      status,
      expiresAt: license.lifetime ? null : periodEnd,
      notes
    }
  });
  await createAnalyticsEvent("subscription_synced", {
    mode: subscription?.livemode ? "live" : "test",
    metadata: {
      subscriptionId,
      eventType,
      status: subscription?.status || null,
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end)
    }
  });
  return { license: updated, subscriptionId };
}

async function handleSubscriptionInvoicePaid(invoice, eventId) {
  const subscriptionId = String(invoice?.subscription || invoice?.parent?.subscription_details?.subscription || "");
  if (!subscriptionId) return null;
  const invoiceId = String(invoice?.id || eventId || "");
  const license = await findLicenseBySubscriptionId(subscriptionId);
  if (!license) return { subscriptionId };
  if (invoiceId && String(license.notes || "").includes(`stripe_invoice_paid:${invoiceId}`)) {
    return { license, subscriptionId, duplicateInvoice: true };
  }
  let subscription = null;
  try {
    subscription = await stripe().subscriptions.retrieve(subscriptionId);
  } catch {
    subscription = null;
  }
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : (invoice?.lines?.data?.[0]?.period?.end ? new Date(invoice.lines.data[0].period.end * 1000) : getPlanExpiry(getPlan("monthly"), license.expiresAt && license.expiresAt > new Date() ? license.expiresAt : new Date()));
  const updated = await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "active",
      expiresAt: license.lifetime ? null : periodEnd,
      stripePaymentIntentId: typeof invoice?.payment_intent === "string" ? invoice.payment_intent : license.stripePaymentIntentId,
      notes: appendNote(license.notes, `stripe_invoice_paid:${invoiceId}`)
    }
  });
  await createAnalyticsEvent("subscription_invoice_paid", {
    amount: invoice?.amount_paid || 0,
    currency: String(invoice?.currency || "eur").toLowerCase(),
    mode: invoice?.livemode ? "live" : "test",
    metadata: { subscriptionId, invoiceId, licenseId: license.id }
  });
  return { license: updated, subscriptionId };
}

async function handleSubscriptionInvoiceFailed(invoice, eventId) {
  const subscriptionId = String(invoice?.subscription || invoice?.parent?.subscription_details?.subscription || "");
  const license = subscriptionId ? await findLicenseBySubscriptionId(subscriptionId) : null;
  await createAnalyticsEvent("subscription_invoice_failed", {
    amount: invoice?.amount_due || 0,
    currency: String(invoice?.currency || "eur").toLowerCase(),
    mode: invoice?.livemode ? "live" : "test",
    metadata: { subscriptionId, invoiceId: invoice?.id || eventId, licenseId: license?.id || null }
  });
  if (!license) return { subscriptionId };
  const updated = await prisma.license.update({
    where: { id: license.id },
    data: { notes: appendNote(license.notes, `stripe_invoice_failed:${invoice?.id || eventId}`) }
  });
  return { license: updated, subscriptionId };
}

async function findLicenseBySubscriptionId(subscriptionId) {
  return prisma.license.findFirst({
    where: {
      notes: { contains: `stripe_subscription:${subscriptionId}` }
    },
    orderBy: { createdAt: "desc" }
  });
}

function appendNote(current, addition) {
  const cleanAddition = String(addition || "").trim();
  if (!cleanAddition) return current || null;
  const cleanCurrent = String(current || "").trim();
  if (cleanCurrent.includes(cleanAddition)) return cleanCurrent || null;
  return [cleanCurrent, cleanAddition].filter(Boolean).join(" ");
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

function findGiftCodeBySession(sessionId) {
  return prisma.giftCode.findUnique({
    where: { stripeSessionId: sessionId },
    include: {
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: true, license: true }
      }
    }
  });
}

function invalid(res, reason, message, extra = {}) {
  return res.json({ valid: false, reason, message, ...extra });
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
