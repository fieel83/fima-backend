import "dotenv/config";
import crypto from "node:crypto";
import dns from "node:dns/promises";
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
import { PLANS, getPlan, getPlanCommerce, getPlanExpiry, getPlanPriceOptions, planIds } from "./plans.js";
import {
  buildLicenseData,
  generateUniqueLicenseKey,
  licensePayload,
  normalizeHwid,
  normalizeLicenseKey
} from "./license.js";
import { adminPage, loginPage } from "./adminHtml.js";
import { clearAdminCookie, createAdminToken, requireAdmin, setAdminCookie } from "./adminAuth.js";
import {
  discordBotHealth,
  giveDiscordRole,
  removeDiscordRole,
  sendPaymentSubmissionLog,
  startDiscordBot
} from "./discordBot.js";
import { assertStripeSecretKeyAllowed, stripeConfigSummary, stripePriceEnvState, stripeSessionPrefix } from "./stripeSafety.js";

const app = express();
const port = Number(env("PORT", "8080"));
const stripePriceEnvNames = [...new Set(Object.values(PLANS).flatMap((plan) => getPlanPriceOptions(plan).map((option) => option.priceEnv)))];
let lastStripePriceValidation = {
  checkedAt: null,
  results: Object.fromEntries(stripePriceEnvNames.map((name) => [name, { status: "unchecked" }]))
};

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const validateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const passwordResetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const storeCheckoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false });
const oauthLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const manualPaymentLimiter = rateLimit({ windowMs: 30 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const trialLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const USER_SESSION_COOKIE = "fima_user_session";
const OAUTH_STATE_COOKIE = "fima_oauth_state";
const OAUTH_PKCE_COOKIE = "fima_oauth_pkce";
const MONTHLY_TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const MONTHLY_TRIAL_CLEANUP_MS = 15 * 60 * 1000;

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
      const session = event.data.object;
      fulfillment = isProductCheckoutSession(session)
        ? await fulfillProductCheckoutSession(session)
        : await fulfillCheckoutSession(session);
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

app.get("/api/public/site-settings", async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({ success: true, settings: publicSiteSettings(settings) });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const emailCheck = await validateSignupEmail(email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.reason });
    if (!isStrongPassword(password)) return res.status(400).json({ error: "weak_password" });

    const emailNormalized = normalizeAccountEmail(email);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { emailNormalized }] }
    });
    if (existing) return res.status(409).json({ error: "email_already_registered" });

    const wantsRobloxProfile = String(req.body?.robloxUsername || "").trim().length > 0;
    const robloxProfile = await resolveRobloxProfile(req.body?.robloxUsername);
    if (wantsRobloxProfile && !robloxProfile) return res.status(400).json({ error: "invalid_roblox_username" });
    const stripeCustomerId = await createStripeCustomerIfPossible(email);
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized,
        passwordHash: await hashPassword(password),
        stripeCustomerId,
        robloxUsername: robloxProfile?.username || null,
        robloxUserId: robloxProfile?.id || null,
        robloxAvatarUrl: robloxProfile?.avatarUrl || null,
        emailVerifiedAt: null
      }
    });
    await ensureCustomer(email);
    await createAuditLog("user_registered", "user", user.id, {
      email,
      emailDomainChecked: emailCheck.mxVerified,
      robloxLinked: Boolean(robloxProfile)
    });
    await issueUserSession(res, user.id);
    return res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("User registration failed", publicError(error));
    return res.status(500).json({ error: "registration_failed" });
  }
});

app.post("/api/auth/roblox-preview", authLimiter, async (req, res) => {
  try {
    const profile = await resolveRobloxProfile(req.body?.robloxUsername);
    if (!profile) return res.status(404).json({ success: false, error: "roblox_user_not_found" });
    return res.json({ success: true, profile });
  } catch (error) {
    console.warn("Roblox profile preview failed", publicError(error));
    return res.status(502).json({ success: false, error: "roblox_lookup_failed" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
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
      returnTo: safeFrontendPath(req.query?.returnTo, "/dashboard.html")
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
    return res.redirect(`${frontendUrl()}/login.html?error=discord_oauth_unavailable`);
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
    await issueUserSession(res, linked.user.id);
    await createAuditLog(state.userId ? "discord_account_linked" : "discord_login_success", "user", linked.user.id, {
      discordUserId: profile.id,
      created: linked.created
    });
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}${state.returnTo || "/dashboard.html"}?discord=connected`);
  } catch (error) {
    console.error("Discord OAuth callback failed", publicError(error));
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}/login.html?error=discord_oauth_failed`);
  }
});

app.get("/auth/roblox/start", oauthLimiter, requireUser, async (req, res) => {
  try {
    const pkce = createPkcePair();
    const state = createOAuthState("roblox", {
      userId: req.user.id,
      returnTo: safeFrontendPath(req.query?.returnTo, "/dashboard.html")
    });
    setOAuthCookie(res, OAUTH_STATE_COOKIE, state);
    setOAuthCookie(res, OAUTH_PKCE_COOKIE, pkce.verifier);

    const discovery = await getRobloxOidcDiscovery();
    const redirectUri = robloxRedirectUri();
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", requiredEnv("ROBLOX_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return res.redirect(url.toString());
  } catch (error) {
    console.error("Roblox OAuth start failed", publicError(error));
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}/dashboard.html?error=roblox_oauth_unavailable`);
  }
});

app.get("/auth/roblox/callback", oauthLimiter, async (req, res) => {
  try {
    const result = await finishRobloxOAuth(req, res, req.query || {});
    return res.redirect(result.redirectUrl);
  } catch (error) {
    console.error("Roblox OAuth callback failed", publicError(error));
    clearOAuthCookies(res);
    return res.redirect(`${frontendUrl()}/dashboard.html?error=roblox_oauth_failed`);
  }
});

app.post("/auth/roblox/finish", oauthLimiter, async (req, res) => {
  try {
    const result = await finishRobloxOAuth(req, res, req.body || {});
    return res.json({ success: true, redirectUrl: result.redirectUrl, user: publicUser(result.user) });
  } catch (error) {
    console.error("Roblox OAuth finish failed", publicError(error));
    clearOAuthCookies(res);
    return res.status(400).json({
      success: false,
      error: error.code || "roblox_oauth_failed",
      redirectUrl: `${frontendUrl()}/dashboard.html?error=roblox_oauth_failed`
    });
  }
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
  const email = normalizeEmail(req.body?.email);
  try {
    const emailNormalized = normalizeAccountEmail(email);
    const user = isValidEmail(email)
      ? await prisma.user.findFirst({ where: { OR: [{ email }, { emailNormalized }] } })
      : null;
    let devResetToken = null;
    if (user) {
      const token = randomToken();
      devResetToken = token;
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });
      await createAuditLog("password_reset_requested", "user", user.id, {});
    }

    const response = {
      success: true,
      message: "If that email exists, a password reset link will be prepared."
    };
    if (env("NODE_ENV", "development") !== "production" && devResetToken) {
      response.resetUrl = `${frontendUrl()}/reset-password.html?token=${encodeURIComponent(devResetToken)}`;
    }
    return res.json(response);
  } catch (error) {
    console.error("Password reset request failed", publicError(error));
    return res.status(500).json({ error: "password_reset_failed" });
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

app.get("/api/me/products", requireUser, async (req, res) => {
  const [purchases, licenses] = await getAccountAccess(req.user);
  return res.json({
    success: true,
    purchases: purchases.map(publicPurchase),
    licenses: licenses.map(publicLicense),
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
  const [access, trial] = await Promise.all([
    getAccountAccess(req.user),
    buildMonthlyTrialSummary(req.user, new Date(), integrations)
  ]);
  const [purchases, licenses] = access;
  return res.json({
    success: true,
    user: publicUser(req.user),
    integrations,
    trial,
    purchases: purchases.map(publicPurchase),
    licenses: licenses.map(publicLicense),
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
    if (!integrations.roblox.connected) return res.status(403).json({ error: "roblox_not_connected" });

    const now = new Date();
    const activeTrial = await findActiveMonthlyTrial(freshUser, now);
    if (activeTrial) {
      return res.status(409).json({
        error: "trial_already_active",
        trial: await buildMonthlyTrialSummary(freshUser)
      });
    }
    if (freshUser.nextTrialAvailableAt && freshUser.nextTrialAvailableAt > now) {
      return res.status(429).json({
        error: "trial_cooldown_active",
        nextTrialAvailableAt: freshUser.nextTrialAvailableAt.toISOString(),
        trial: await buildMonthlyTrialSummary(freshUser)
      });
    }

    const plan = getPlan("1day");
    if (!plan) return res.status(500).json({ error: "trial_plan_missing" });
    const expiresAt = new Date(now.getTime() + MONTHLY_TRIAL_DURATION_MS);
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
          notes: `monthly_trial user:${freshUser.id} discord:${freshUser.discordUserId} roblox:${freshUser.robloxUserId}`
        }
      });
      const nextUser = await tx.user.update({
        where: { id: freshUser.id },
        data: {
          trialUsedAt: now,
          trialExpiresAt: expiresAt,
          nextTrialAvailableAt,
          trialStatus: "active",
          monthlyTrialClaimCount: { increment: 1 }
        }
      });
      await tx.analyticsEvent.create({
        data: {
          type: "monthly_trial_claimed",
          plan: plan.id,
          amount: 0,
          currency: "eur",
          mode: "trial",
          metadata: { userId: freshUser.id, discordUserId: freshUser.discordUserId, robloxUserId: freshUser.robloxUserId }
        }
      });
      await tx.auditLog.create({
        data: {
          action: "monthly_trial_claimed",
          targetType: "license",
          targetId: createdLicense.id,
          metadata: { userId: freshUser.id, expiresAt: expiresAt.toISOString(), nextTrialAvailableAt: nextTrialAvailableAt.toISOString() }
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
      trial: await buildMonthlyTrialSummary(updatedUser),
      discordRole
    });
  } catch (error) {
    console.error("Monthly trial claim failed", publicError(error));
    return res.status(500).json({ error: "trial_claim_failed" });
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
      metadata: { licenseKey: license.licenseKey, priceSource: checkout.priceSource }
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

    const account = await ensureUserStripeCustomer(user);
    const customerEmail = String(account.email || "").trim().toLowerCase();
    if (!isValidEmail(customerEmail)) return res.status(400).json({ error: "invalid_email" });

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
        accountEmail: account.email
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
      return invalid(res, "hwid_mismatch", "This license key is already bound to another device. Please open a support ticket if this is your key.");
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
  const domain = oauthCookieDomain();
  if (domain) {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth", domain });
    res.clearCookie(OAUTH_PKCE_COOKIE, { path: "/auth", domain });
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
    returnTo: safeFrontendPath(data.returnTo, "/dashboard.html")
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

function safeFrontendPath(value, fallback = "/dashboard.html") {
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
  await createAuditLog("roblox_account_linked", "user", user.id, { robloxUserId: profile.sub });
  clearOAuthCookies(res);
  return {
    user,
    redirectUrl: `${frontendUrl()}${state.returnTo || "/dashboard.html"}?roblox=connected`
  };
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
  if (!response.ok) throw new Error(`roblox_token_exchange_failed_${response.status}`);
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

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(port, () => {
  console.log(`Fima payments API listening on ${port}`);
  console.info("Stripe configuration", stripeStatus());
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
    success_url: `${frontendUrl()}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/payment-cancelled.html`,
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
  const baseSession = {
    mode: "payment",
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/#pricing`,
    metadata: checkoutMetadata(plan, commerce, selectedCurrency, language, extraMetadata)
  };
  const normalizedCustomerId = String(customerId || "").trim();
  if (normalizedCustomerId.startsWith("cus_")) {
    baseSession.customer = normalizedCustomerId;
  } else {
    baseSession.customer_email = customerEmail;
  }

  const normalizedPriceId = String(priceId || "").trim();
  if (normalizedPriceId) {
    const priceCheck = await validateStripePriceForPlan(stripeClient, plan, normalizedPriceId, commerce);
    recordStripePriceCheck(priceCheck);
    if (priceCheck.ok) {
      const session = await stripeClient.checkout.sessions.create({
        ...baseSession,
        line_items: [{ price: normalizedPriceId, quantity: 1 }]
      });
      return { session, priceSource: "price_id" };
    }

    console.warn("Stripe price env invalid, using inline price data", sanitizePriceCheck(priceCheck));
  } else {
    const priceCheck = {
      ok: false,
      plan: plan.id,
      priceEnv: commerce.priceEnv,
      status: "missing_env",
      expected: expectedPriceForPlan(plan, commerce)
    };
    recordStripePriceCheck(priceCheck);
    console.warn("Stripe price env missing, using inline price data", sanitizePriceCheck(priceCheck));
  }

  const session = await stripeClient.checkout.sessions.create({
    ...baseSession,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: commerce.currency,
        unit_amount: commerce.priceCents,
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
  for (const plan of Object.values(PLANS)) {
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
    if (actual.type !== "one_time") return { ...base, ok: false, status: "not_one_time_price", actual };
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

function licenseSource(license) {
  if (license?.stripeSessionId) return "Stripe/Website";
  const notes = String(license?.notes || "").toLowerCase();
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
    userEmail: license.customerEmail,
    robloxUsername: user?.robloxUsername || null,
    robloxUserId: user?.robloxUserId || null,
    robloxAvatarUrl: user?.robloxAvatarUrl || null,
    stripeCustomerId: user?.stripeCustomerId || null,
    hwidStatus: license.hwid ? "Bound" : "Unbound",
    enabled: license.status === "active",
    expires: license.lifetime ? "Lifetime" : license.expiresAt,
    timeLeft: timeLeft.label,
    timeLeftSeconds: timeLeft.seconds,
    timeLeftState: timeLeft.state,
    paymentSessionId: license.stripeSessionId || order?.stripeSessionId || null,
    paymentIntentId: license.stripePaymentIntentId || order?.stripePaymentIntentId || null,
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

function hashToken(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex");
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

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    stripeCustomerId: user.stripeCustomerId || null,
    discordUserId: user.discordUserId || null,
    discordUsername: user.discordUsername || null,
    discordEmail: user.discordEmail || null,
    discordAvatarUrl: user.discordAvatarUrl || null,
    robloxUsername: user.robloxUsername || null,
    robloxUserId: user.robloxUserId || null,
    robloxAvatarUrl: user.robloxAvatarUrl || null,
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
  const links = user?.id
    ? await prisma.oAuthLink.findMany({
        where: { userId: user.id, provider: { in: ["discord", "roblox"] } },
        orderBy: { updatedAt: "desc" }
      }).catch(() => [])
    : [];
  const byProvider = Object.fromEntries(links.map((link) => [link.provider, link]));
  const discordConnected = Boolean(user?.discordUserId && byProvider.discord);
  const robloxConnected = Boolean(user?.robloxUserId && byProvider.roblox);

  return {
    discord: {
      connected: discordConnected,
      id: user?.discordUserId || null,
      username: user?.discordUsername || null,
      email: user?.discordEmail || null,
      avatar: user?.discordAvatarUrl || null,
      connectedAt: byProvider.discord?.createdAt || null,
      updatedAt: byProvider.discord?.updatedAt || null
    },
    roblox: {
      connected: robloxConnected,
      id: user?.robloxUserId || null,
      username: user?.robloxUsername || null,
      displayName: byProvider.roblox?.metadata?.displayName || user?.robloxUsername || null,
      avatar: user?.robloxAvatarUrl || null,
      connectedAt: byProvider.roblox?.createdAt || null,
      updatedAt: byProvider.roblox?.updatedAt || null
    }
  };
}

async function buildMonthlyTrialSummary(user, now = new Date(), integrations = null) {
  const linked = integrations || await buildIntegrationSummary(user);
  const activeTrial = await findActiveMonthlyTrial(user, now);
  const requirements = [
    { id: "account", label: "Fima account logged in", complete: Boolean(user?.id), action: null },
    { id: "discord", label: "Discord connected", complete: Boolean(linked.discord?.connected), action: "connect_discord" },
    { id: "roblox", label: "Roblox connected", complete: Boolean(linked.roblox?.connected), action: "connect_roblox" }
  ];
  const missing = requirements.filter((item) => !item.complete).map((item) => item.id);
  const nextTrialAvailableAt = user?.nextTrialAvailableAt || null;
  const cooldownActive = Boolean(nextTrialAvailableAt && nextTrialAvailableAt > now);
  const cooldownSeconds = cooldownActive ? Math.ceil((nextTrialAvailableAt.getTime() - now.getTime()) / 1000) : 0;
  const activeSeconds = activeTrial?.expiresAt ? Math.max(0, Math.ceil((activeTrial.expiresAt.getTime() - now.getTime()) / 1000)) : 0;
  const paidAccessActive = await hasActivePaidLicense(user, now);

  let disabledReason = null;
  if (activeTrial) disabledReason = "trial_already_active";
  else if (missing.includes("discord")) disabledReason = "discord_not_connected";
  else if (missing.includes("roblox")) disabledReason = "roblox_not_connected";
  else if (cooldownActive) disabledReason = "trial_cooldown_active";

  return {
    requirements,
    missing,
    eligible: requirements.every((item) => item.complete) && !activeTrial && !cooldownActive,
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
      notes: { contains: "monthly_trial", mode: "insensitive" }
    },
    orderBy: { expiresAt: "desc" }
  });
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

  return {
    ...licensePayload(license),
    id: license.id,
    status: license.status,
    planLabel: plan?.name?.replace(/^Fima Macro\s+/i, "") || license.plan,
    durationDays: plan?.durationDays ?? null,
    expiresAt,
    remainingSeconds,
    expired: !license.lifetime && Boolean(license.expiresAt) && license.expiresAt.getTime() < Date.now(),
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

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const extensionKey = normalizeLicenseKey(session.metadata?.extendLicenseKey);
  const isExtension = session.metadata?.checkoutType === "license_extension" && extensionKey;

  try {
    return await prisma.$transaction(async (tx) => {
      const again = await tx.order.findUnique({
        where: { stripeSessionId: session.id },
        include: { license: true }
      });
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
            email,
            plan,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId
          })
        });
      }

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
            type: isExtension ? "license_extension_completed" : "checkout_completed",
            plan: plan.id,
            amount: order.amount,
            currency: order.currency,
            mode: order.mode,
            metadata: { priceSource: "stripe_webhook", extended: Boolean(isExtension) }
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
