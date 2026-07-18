import crypto from "node:crypto";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MIN_TTL_MS = 2 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DEVICE_HASH_PATTERN = /^[a-f0-9]{64}$/;

function secretHash(namespace, value) {
  return crypto
    .createHash("sha256")
    .update(`fima-desktop-login:${namespace}:`)
    .update(String(value || ""))
    .digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function boundedTtl(ttlMs) {
  const value = Number(ttlMs);
  if (!Number.isFinite(value)) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.trunc(value)));
}

function randomBase64Url(randomBytes, length) {
  return randomBytes(length).toString("base64url");
}

function generateUserCode(randomBytes) {
  const bytes = randomBytes(8);
  let compact = "";
  for (const byte of bytes) compact += USER_CODE_ALPHABET[byte & 31];
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeDesktopUserCode(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8 || [...compact].some((character) => !USER_CODE_ALPHABET.includes(character))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeDesktopDeviceCode(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

export function normalizeDesktopState(value) {
  const normalized = String(value || "").trim();
  return STATE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePkceChallenge(value) {
  const normalized = String(value || "").trim();
  return PKCE_CHALLENGE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePkceVerifier(value) {
  const normalized = String(value || "").trim();
  return PKCE_VERIFIER_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeDesktopDeviceHash(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return DEVICE_HASH_PATTERN.test(normalized) ? normalized : null;
}

export function desktopPkceChallenge(verifier) {
  const normalized = normalizePkceVerifier(verifier);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("base64url");
}

export function desktopDeviceCodeHash(value) {
  const normalized = normalizeDesktopDeviceCode(value);
  return normalized ? secretHash("device-code", normalized) : null;
}

export function desktopUserCodeHash(value) {
  const normalized = normalizeDesktopUserCode(value);
  return normalized ? secretHash("user-code", normalized) : null;
}

export function createDesktopLoginRequest({
  pkceChallenge,
  deviceIdHash,
  state,
  appVersion,
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
  randomBytes = crypto.randomBytes
}) {
  const challenge = normalizePkceChallenge(pkceChallenge);
  const normalizedDeviceHash = normalizeDesktopDeviceHash(deviceIdHash);
  const normalizedState = normalizeDesktopState(state);
  const normalizedVersion = String(appVersion || "").trim().slice(0, 80);
  const createdAt = now instanceof Date ? new Date(now) : new Date(now);
  if (!challenge) throw Object.assign(new Error("Invalid PKCE challenge."), { code: "invalid_pkce_challenge" });
  if (!normalizedDeviceHash) throw Object.assign(new Error("Invalid device identity."), { code: "invalid_device_id" });
  if (!normalizedState) throw Object.assign(new Error("Invalid desktop login state."), { code: "invalid_state" });
  if (!normalizedVersion) throw Object.assign(new Error("Invalid app version."), { code: "invalid_app_version" });
  if (!Number.isFinite(createdAt.getTime())) throw Object.assign(new Error("Invalid request time."), { code: "invalid_request_time" });
  if (typeof randomBytes !== "function") throw new TypeError("randomBytes must be a function");

  const deviceCode = randomBase64Url(randomBytes, 32);
  const userCode = generateUserCode(randomBytes);
  return {
    deviceCode,
    userCode,
    record: {
      deviceCodeHash: secretHash("device-code", deviceCode),
      userCodeHash: secretHash("user-code", userCode),
      pkceChallenge: challenge,
      deviceIdHash: normalizedDeviceHash,
      stateHash: secretHash("state", normalizedState),
      appVersion: normalizedVersion,
      status: "pending",
      expiresAt: new Date(createdAt.getTime() + boundedTtl(ttlMs))
    }
  };
}

export function verifyDesktopLoginProof(request, {
  deviceCode,
  pkceVerifier,
  state,
  deviceIdHash,
  now = new Date()
} = {}) {
  const normalizedDeviceCode = normalizeDesktopDeviceCode(deviceCode);
  const verifier = normalizePkceVerifier(pkceVerifier);
  const normalizedState = normalizeDesktopState(state);
  const normalizedDeviceHash = normalizeDesktopDeviceHash(deviceIdHash);
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const expiresAt = new Date(request?.expiresAt || 0).getTime();

  if (!Number.isFinite(currentTime) || !Number.isFinite(expiresAt) || expiresAt <= currentTime) {
    return { ok: false, reason: "desktop_login_expired" };
  }
  if (!normalizedDeviceCode || !safeEqual(secretHash("device-code", normalizedDeviceCode), request?.deviceCodeHash)) {
    return { ok: false, reason: "desktop_login_invalid_proof" };
  }
  if (!normalizedDeviceHash || !safeEqual(normalizedDeviceHash, request?.deviceIdHash)) {
    return { ok: false, reason: "desktop_login_device_mismatch" };
  }
  if (!normalizedState || !safeEqual(secretHash("state", normalizedState), request?.stateHash)) {
    return { ok: false, reason: "desktop_login_state_mismatch" };
  }
  const challenge = desktopPkceChallenge(verifier);
  if (!challenge || !safeEqual(challenge, request?.pkceChallenge)) {
    return { ok: false, reason: "desktop_login_pkce_mismatch" };
  }
  return { ok: true };
}

export function isStrictAccountOnlyEntitlementPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
  if (!userId || payload.accountId !== userId) return false;
  if (payload.licenseId !== null || payload.plan !== null || payload.licenseStatus !== "account_only") return false;
  if (!Array.isArray(payload.allowedFeatures) || payload.allowedFeatures.length !== 0) return false;
  if (!Array.isArray(payload.capabilities) || payload.capabilities.length !== 0) return false;
  return payload.ownerAdminAccess === false &&
    payload.isOwner === false &&
    payload.isAdmin === false &&
    payload.adminTools === false;
}

export const desktopLoginPolicy = Object.freeze({
  defaultTtlMs: DEFAULT_TTL_MS,
  minimumTtlMs: MIN_TTL_MS,
  maximumTtlMs: MAX_TTL_MS,
  userCodeLength: 8,
  verificationPath: "/desktop-login"
});
