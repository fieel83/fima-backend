import crypto from "node:crypto";
import { env } from "./env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_TTL_MS = 60 * 60 * 1000;

function csrfSecret() {
  const configured = env("CSRF_SECRET", env("SESSION_SECRET", env("AUTH_SECRET", env("JWT_SECRET", env("ADMIN_PASSWORD", ""))))).trim();
  if (configured) return configured;
  if (env("NODE_ENV") === "production") {
    throw new Error("CSRF secret is not configured.");
  }
  return "fima-dev-csrf-secret";
}

function hmac(value) {
  return crypto.createHmac("sha256", csrfSecret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("base64url");
}

function tokenFromRequest(req) {
  return String(
    req.get("x-fima-csrf") ||
    req.get("x-csrf-token") ||
    req.body?.csrfToken ||
    req.body?._csrf ||
    ""
  ).trim();
}

function requestHasAdminApiKey(req) {
  if (String(req.get("x-admin-api-key") || "").trim()) return true;
  return /^Bearer\s+.+$/i.test(String(req.get("authorization") || "").trim());
}

function isExemptMutationPath(pathname) {
  return pathname === "/admin/login" ||
    pathname === "/admin/logout" ||
    pathname === "/api/auth/register" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/auth/roblox/finish" ||
    pathname === "/api/license/validate" ||
    pathname === "/api/license/refresh-entitlement";
}

export function createCsrfToken(scope, sessionValue) {
  const payload = {
    scope,
    sessionHash: sessionHash(sessionValue),
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomBytes(12).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyCsrfToken(token, scope, sessionValue) {
  if (!token || !token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(hmac(encoded), signature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.scope === scope &&
      payload.sessionHash === sessionHash(sessionValue) &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function csrfTokenPayload(scope, sessionValue) {
  return {
    success: true,
    csrfToken: createCsrfToken(scope, sessionValue),
    expiresInSeconds: Math.floor(TOKEN_TTL_MS / 1000)
  };
}

export function requireCsrfForCookieMutations({ adminCookieName, userCookieName }) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (requestHasAdminApiKey(req)) return next();
    if (isExemptMutationPath(req.path)) return next();

    const adminSession = req.cookies?.[adminCookieName];
    const userSession = req.cookies?.[userCookieName];
    const scope = adminSession ? "admin" : userSession ? "user" : "";
    const sessionValue = adminSession || userSession || "";
    if (!scope) return next();

    if (verifyCsrfToken(tokenFromRequest(req), scope, sessionValue)) return next();

    return res.status(403).json({
      success: false,
      error: "csrf_required",
      message: "Security token missing or expired. Refresh the page and try again."
    });
  };
}
