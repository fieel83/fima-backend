import crypto from "node:crypto";
import { env, requiredEnv } from "./env.js";

const TOKEN_TYPE = "app_entitlement";
const TOKEN_VERSION = "v1";
const DEFAULT_LIFETIME_MINUTES = 15;
const MIN_SECRET_LENGTH = 32;

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function hmac(input, secret) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function timingSafeTextEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left || "")).digest();
  const b = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(a, b);
}

function parseJsonPart(part) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function entitlementLifetimeMinutes() {
  const raw = Number.parseInt(env("ENTITLEMENT_LIFETIME_MINUTES", String(DEFAULT_LIFETIME_MINUTES)), 10);
  if (!Number.isFinite(raw)) return DEFAULT_LIFETIME_MINUTES;
  return Math.min(30, Math.max(10, raw));
}

function normalizeHwidForHash(hwid) {
  return String(hwid || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function hashDeviceId(hwid) {
  const normalized = normalizeHwidForHash(hwid);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function entitlementSecretStatus(environment = process.env) {
  const secret = String(environment.ENTITLEMENT_SIGNING_SECRET || "").trim();
  return {
    configured: secret.length >= MIN_SECRET_LENGTH,
    present: secret.length > 0,
    minLength: MIN_SECRET_LENGTH,
    lifetimeMinutes: entitlementLifetimeMinutes(),
    tokenType: TOKEN_TYPE,
    tokenVersion: TOKEN_VERSION,
    sessionVersionConfigured: Boolean(String(environment.ADMIN_SESSION_VERSION || environment.ADMIN_SESSION_REVOKED_BEFORE || "").trim())
  };
}

export function downloadSecretStatus(environment = process.env) {
  const secret = String(environment.DOWNLOAD_SIGNING_SECRET || "").trim();
  return {
    configured: secret.length >= MIN_SECRET_LENGTH,
    present: secret.length > 0,
    minLength: MIN_SECRET_LENGTH
  };
}

export function updateManifestSecretStatus(environment = process.env) {
  const secret = String(environment.UPDATE_MANIFEST_SIGNING_SECRET || "").trim();
  return {
    configured: secret.length >= MIN_SECRET_LENGTH,
    present: secret.length > 0,
    minLength: MIN_SECRET_LENGTH
  };
}

export function productionSecurityReadiness(environment = process.env) {
  const nodeEnv = String(environment.NODE_ENV || "development");
  const production = nodeEnv === "production";
  const entitlement = entitlementSecretStatus(environment);
  const download = downloadSecretStatus(environment);
  const updateManifest = updateManifestSecretStatus(environment);
  return {
    production,
    entitlement,
    download,
    updateManifest,
    dangerousFeaturesRefuseEntitlement: production && !entitlement.configured,
    protectedDownloadsDisabled: production && !download.configured
  };
}

export function allowedFeaturesForPlan(plan) {
  const normalized = String(plan || "").trim().toLowerCase();
  if (!normalized) return [];
  const base = ["macro_runtime", "official_macros", "macro_catalog"];
  if (normalized === "lifetime") return [...base, "lifetime_access", "priority_updates"];
  if (normalized === "monthly") return [...base, "subscription_access"];
  if (normalized === "3days" || normalized === "3day" || normalized === "3 days") return [...base, "short_access"];
  if (normalized.includes("trial") || normalized === "1day") return [...base, "trial_access"];
  return base;
}

export function issueAppEntitlement({
  license,
  user = null,
  hwid,
  appVersion = null,
  minSupportedAppVersion = "",
  licenseStatus = null,
  allowedFeatures = null,
  ownerAdminAccess = false
}) {
  const secret = requiredEnv("ENTITLEMENT_SIGNING_SECRET");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + entitlementLifetimeMinutes() * 60 * 1000);
  const sessionVersion = env("ADMIN_SESSION_VERSION", env("ADMIN_SESSION_REVOKED_BEFORE", ""));
  const plan = license?.plan || null;
  const baseFeatures = Array.isArray(allowedFeatures) ? allowedFeatures : allowedFeaturesForPlan(plan);
  const safeFeatures = ownerAdminAccess
    ? Array.from(new Set([...baseFeatures, "owner_admin", "admin_panel", "admin_macro_editor"]))
    : baseFeatures;
  const payload = {
    tokenType: TOKEN_TYPE,
    entitlementVersion: TOKEN_VERSION,
    entitlementId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    licenseId: license?.id || null,
    userId: user?.id || null,
    accountId: user?.id || null,
    plan,
    allowedFeatures: safeFeatures,
    ownerAdminAccess: Boolean(ownerAdminAccess),
    isOwner: Boolean(ownerAdminAccess),
    isAdmin: Boolean(ownerAdminAccess),
    adminTools: Boolean(ownerAdminAccess),
    capabilities: ownerAdminAccess ? ["owner_admin", "admin_panel", "admin_macro_editor"] : [],
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    appVersion: appVersion || null,
    minSupportedAppVersion: minSupportedAppVersion || "",
    hwidHash: hashDeviceId(hwid),
    deviceIdHash: hashDeviceId(hwid),
    nonce: crypto.randomBytes(16).toString("base64url"),
    licenseStatus: licenseStatus || license?.status || null,
    sessionVersion
  };

  const header = {
    alg: "HS256",
    typ: "FIMA-ENTITLEMENT",
    v: TOKEN_VERSION
  };
  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = hmac(signingInput, secret);
  return {
    token: `${signingInput}.${signature}`,
    payload,
    expiresAt: payload.expiresAt
  };
}

export function verifyAppEntitlement(token) {
  const text = String(token || "").trim();
  const parts = text.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid_entitlement_format" };

  const [headerPart, payloadPart, signature] = parts;
  const header = parseJsonPart(headerPart);
  const payload = parseJsonPart(payloadPart);
  if (!header || !payload) return { ok: false, reason: "invalid_entitlement_payload" };
  if (payload.tokenType !== TOKEN_TYPE || payload.entitlementVersion !== TOKEN_VERSION) {
    return { ok: false, reason: "invalid_entitlement_type" };
  }

  const secret = requiredEnv("ENTITLEMENT_SIGNING_SECRET");
  const expected = hmac(`${headerPart}.${payloadPart}`, secret);
  if (!timingSafeTextEqual(signature, expected)) return { ok: false, reason: "invalid_entitlement_signature" };

  const expiresAt = new Date(payload.expiresAt || 0);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "entitlement_expired", payload };
  }

  const sessionVersion = env("ADMIN_SESSION_VERSION", env("ADMIN_SESSION_REVOKED_BEFORE", ""));
  if (String(payload.sessionVersion || "") !== String(sessionVersion || "")) {
    return { ok: false, reason: "entitlement_session_revoked", payload };
  }

  return { ok: true, payload };
}

export function publicEntitlementPayload(entitlement) {
  const payload = entitlement?.payload || {};
  return {
    tokenType: payload.tokenType || TOKEN_TYPE,
    entitlementVersion: payload.entitlementVersion || TOKEN_VERSION,
    entitlementId: payload.entitlementId || null,
    sessionId: payload.sessionId || null,
    licenseId: payload.licenseId || null,
    userId: payload.userId || null,
    accountId: payload.accountId || null,
    plan: payload.plan || null,
    allowedFeatures: payload.allowedFeatures || [],
    ownerAdminAccess: Boolean(payload.ownerAdminAccess),
    isOwner: Boolean(payload.isOwner),
    isAdmin: Boolean(payload.isAdmin),
    adminTools: Boolean(payload.adminTools),
    capabilities: payload.capabilities || [],
    issuedAt: payload.issuedAt || null,
    expiresAt: payload.expiresAt || null,
    appVersion: payload.appVersion || null,
    minSupportedAppVersion: payload.minSupportedAppVersion || "",
    hwidHash: payload.hwidHash || null,
    deviceIdHash: payload.deviceIdHash || null,
    nonce: payload.nonce || null,
    licenseStatus: payload.licenseStatus || null
  };
}
