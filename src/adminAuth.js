import crypto from "node:crypto";
import { env, requiredEnv } from "./env.js";

const COOKIE_NAME = "fima_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function hmac(value) {
  return crypto
    .createHmac("sha256", requiredEnv("ADMIN_PASSWORD"))
    .update(value)
    .digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function timingSafeTextEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left || "")).digest();
  const b = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(a, b);
}

function adminApiKeyFromRequest(req) {
  const headerKey = String(req.get("x-admin-api-key") || "").trim();
  if (headerKey) return headerKey;

  const authorization = String(req.get("authorization") || "").trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : "";
}

function isJsonRequest(req) {
  return req.path.startsWith("/api/") ||
    req.path.startsWith("/admin/api/") ||
    req.is("application/json") ||
    String(req.get("accept") || "").includes("application/json");
}

export function createAdminToken() {
  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    sessionVersion: env("ADMIN_SESSION_VERSION", ""),
    nonce: crypto.randomBytes(16).toString("base64url")
  });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyAdminToken(token) {
  if (!token || !token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(hmac(encoded), signature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return false;
    const revokedBefore = env("ADMIN_SESSION_REVOKED_BEFORE", "").trim();
    if (revokedBefore) {
      const cutoff = Number.isFinite(Number(revokedBefore)) ? Number(revokedBefore) : Date.parse(revokedBefore);
      if (Number.isFinite(cutoff) && typeof payload.iat === "number" && payload.iat < cutoff) return false;
    }
    const requiredVersion = env("ADMIN_SESSION_VERSION", "").trim();
    if (requiredVersion && payload.sessionVersion !== requiredVersion) return false;
    return true;
  } catch {
    return false;
  }
}

export function isAdminAuthenticated(req) {
  const submittedApiKey = adminApiKeyFromRequest(req);
  const expectedApiKey = env("FIMA_ADMIN_API_KEY", env("ADMIN_API_KEY", "")).trim();
  if (submittedApiKey) {
    return Boolean(expectedApiKey && timingSafeTextEqual(submittedApiKey, expectedApiKey));
  }
  return verifyAdminToken(req.cookies?.[COOKIE_NAME]);
}

export function setAdminCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env("NODE_ENV") === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/"
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie(COOKIE_NAME, { path: "/admin" });
}

export function requireAdmin(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  if (isJsonRequest(req)) return res.status(401).json({ error: "unauthorized" });
  return res.redirect("/admin/login");
}
