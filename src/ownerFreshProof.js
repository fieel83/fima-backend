import crypto from "node:crypto";

export const OWNER_FRESH_PROOF_MAX_AGE_MS = 10 * 60 * 1000;

function nonEmptyString(value, maximum = 512) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maximum ? text : "";
}

function validSecret(value) {
  // A short or missing secret would turn the proof into a guessable bearer
  // credential. The proof is intentionally unavailable until it is configured.
  return typeof value === "string" && value.length >= 32 ? value : "";
}

function validTimestamp(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value) {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function proofClaims({ userId, sessionTokenHash, discordUserId, now, ttlMs }) {
  const user = nonEmptyString(userId);
  const session = nonEmptyString(sessionTokenHash);
  const discord = nonEmptyString(discordUserId);
  const issuedAt = validTimestamp(now);
  if (!user || !session || !discord || issuedAt === null) return null;

  const requestedTtl = Number(ttlMs);
  const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0
    ? Math.min(Math.floor(requestedTtl), OWNER_FRESH_PROOF_MAX_AGE_MS)
    : OWNER_FRESH_PROOF_MAX_AGE_MS;
  return { v: 1, u: user, s: session, d: discord, i: issuedAt, e: issuedAt + ttl };
}

/**
 * Creates a short-lived proof only after a successful owner Discord callback.
 * The raw browser session token is never placed in the proof.
 */
export function createOwnerFreshProof({ secret, userId, sessionTokenHash, discordUserId, now = Date.now(), ttlMs } = {}) {
  const signingSecret = validSecret(secret);
  const claims = proofClaims({ userId, sessionTokenHash, discordUserId, now, ttlMs });
  if (!signingSecret || !claims) return "";
  const payload = encode(claims);
  return `${payload}.${sign(payload, signingSecret)}`;
}

/**
 * Returns only a boolean so malformed or expired bearer data cannot leak a
 * reason to callers. Every comparison is bound to the live session identity.
 */
export function verifyOwnerFreshProof({ token, secret, userId, sessionTokenHash, discordUserId, now = Date.now() } = {}) {
  const signingSecret = validSecret(secret);
  const expectedUser = nonEmptyString(userId);
  const expectedSession = nonEmptyString(sessionTokenHash);
  const expectedDiscord = nonEmptyString(discordUserId);
  const currentTime = validTimestamp(now);
  if (!signingSecret || !expectedUser || !expectedSession || !expectedDiscord || currentTime === null) return false;

  const [payload, signature, ...extra] = String(token || "").split(".");
  if (!payload || !signature || extra.length) return false;
  if (!signaturesMatch(sign(payload, signingSecret), signature)) return false;

  const claims = decode(payload);
  if (!claims || claims.v !== 1) return false;
  const issuedAt = validTimestamp(claims.i);
  const expiresAt = validTimestamp(claims.e);
  if (issuedAt === null || expiresAt === null
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > OWNER_FRESH_PROOF_MAX_AGE_MS
    || issuedAt > currentTime
    || expiresAt <= currentTime) return false;

  return claims.u === expectedUser
    && claims.s === expectedSession
    && claims.d === expectedDiscord;
}
