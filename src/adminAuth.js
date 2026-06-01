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

export function createAdminToken() {
  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
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
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
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
  if (verifyAdminToken(req.cookies?.[COOKIE_NAME])) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "unauthorized" });
  return res.redirect("/admin/login");
}
