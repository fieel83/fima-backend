import {
  createDesktopLoginRequest,
  desktopDeviceCodeHash,
  desktopLoginPolicy,
  desktopUserCodeHash,
  desktopStateHash,
  createDesktopAuthorizationCode,
  desktopAuthorizationCodeHash,
  normalizeDesktopAuthorizationCode,
  normalizeDesktopUserCode,
  verifyDesktopLoginProof
} from "./desktopLogin.js";

import { normalizeDeviceEnvironmentRisk } from "./deviceEnvironmentRisk.js";

const POLL_INTERVAL_MS = 3000;
const MAX_CREATE_ATTEMPTS = 4;

function cleanDeviceLabel(value, fallback, maximumLength = 80) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
  return normalized || fallback;
}

function noStore(res) {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function publicFailure(res, status = 400, error = "desktop_login_invalid_or_expired") {
  noStore(res);
  return res.status(status).json({
    success: false,
    error,
    message: "This desktop sign-in request is invalid, expired, or no longer available."
  });
}

// Loopback port is cryptographically bound by the existing state hash. No schema change.
function loopbackTarget(state) {
  if (!/^[A-Za-z0-9_-]{47}$/.test(String(state || ""))) return null;
  const bytes = Buffer.from(state, "base64url");
  if (bytes.length !== 35 || bytes[0] !== 1 || bytes.toString("base64url") !== state) return null;
  const port = bytes.readUInt16BE(1);
  return port >= 1024 ? `http://127.0.0.1:${port}/auth/callback` : null;
}
function browserLookup(body) {
  if (body?.requestId) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(body.requestId)) return null;
    return { id: body.requestId };
  }
  const userCodeHash = desktopUserCodeHash(normalizeDesktopUserCode(body?.userCode));
  return userCodeHash ? { userCodeHash } : null;
}

function epochProof(request, body, deviceIdHash) {
  return verifyDesktopLoginProof(request, {
    deviceCode: body?.deviceCode,
    pkceVerifier: body?.pkceVerifier,
    state: body?.state,
    deviceIdHash,
    now: new Date(0)
  });
}

function requestExpired(request, now) {
  const expiresAt = new Date(request?.expiresAt || 0).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

function loginFailure(status = 410, code = "desktop_login_invalid_or_expired") {
  return Object.assign(new Error(code), { desktopStatus: status, desktopCode: code });
}

async function lockAccount(db, userId) {
  await db.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

export function createDesktopLoginHandlers({
  prisma,
  normalizeHwid,
  hashDeviceId,
  frontendUrl,
  resolveEntitlementForUser,
  assertInitiatingSession,
  resolveAuthSession,
  onConsumed = async () => {}
}) {
  if (!prisma?.desktopLoginRequest) throw new TypeError("desktopLoginRequest persistence is required");
  if (typeof prisma.$transaction !== "function") throw new TypeError("transactional persistence is required");
  if (typeof resolveEntitlementForUser !== "function") throw new TypeError("resolveEntitlementForUser is required");
  if (typeof assertInitiatingSession !== "function") throw new TypeError("assertInitiatingSession is required");

  async function issueLocked({ request, req, hwid, deviceIdHash, exchangeCodeHash = null }) {
    const result = await prisma.$transaction(async (db) => {
      await lockAccount(db, request.userId);
      const current = await db.desktopLoginRequest.findUnique({ where: { id: request.id } });
      const now = new Date();
      if (!current || current.userId !== request.userId || requestExpired(current, now) ||
          !epochProof(current, req.body, deviceIdHash).ok) throw loginFailure();
      const retry = current.status === "consumed";
      if (exchangeCodeHash) {
        if (retry || !current.callbackRequired || current.status !== "approved" ||
            current.authorizationCodeHash !== exchangeCodeHash || current.authorizationCodeConsumedAt ||
            !current.authorizationCodeExpiresAt || !Number.isFinite(new Date(current.authorizationCodeExpiresAt).getTime()) ||
            new Date(current.authorizationCodeExpiresAt) <= now) throw loginFailure();
      } else if (current.callbackRequired || (current.status !== "approved" && !retry) ||
                 (retry && (typeof resolveAuthSession !== "function" || !current.consumedAt || !Number.isFinite(new Date(current.consumedAt).getTime()) ||
                   new Date(current.consumedAt) > now))) throw loginFailure();
      const user = await db.user.findUnique({ where: { id: current.userId } });
      if (!user) throw loginFailure();
      if (!retry) {
        const consumed = await db.desktopLoginRequest.updateMany({
          where: { id: current.id, status: "approved", userId: current.userId, expiresAt: { gt: now },
            ...(exchangeCodeHash ? { authorizationCodeHash: exchangeCodeHash, authorizationCodeConsumedAt: null,
              authorizationCodeExpiresAt: { gt: now } } : {}) },
          data: { status: "consumed", consumedAt: now,
            ...(exchangeCodeHash ? { authorizationCodeConsumedAt: now } : {}) }
        });
        if (consumed.count !== 1) throw loginFailure();
      }
      const consumedRequest = await db.desktopLoginRequest.findUnique({ where: { id: current.id } });
      let authSessionId = null;
      if (typeof resolveAuthSession === "function") {
        // Callback must use db; retry may only recover an existing active session.
        try {
          authSessionId = await resolveAuthSession({ request: consumedRequest, user, deviceIdHash, db, retry });
        } catch (error) {
          if (error?.code === "entitlement_session_revoked") throw loginFailure();
          throw error;
        }
        if (!authSessionId) throw loginFailure();
      }
      const session = await resolveEntitlementForUser({ user, hwid, appVersion: current.appVersion, db, authSessionId });
      if (requestExpired(current, new Date())) throw loginFailure();
      return { request: consumedRequest, user, session, hwid, authSessionId, retry };
    });
    if (!result.retry) await onConsumed(result).catch(() => {});
    const valid = await prisma.$transaction(async (db) => {
      await lockAccount(db, result.user.id);
      const user = await db.user.findUnique({ where: { id: result.user.id } });
      if (!user || user.passwordHash !== result.user.passwordHash) return false;
      if (result.authSessionId) {
        const session = await db.desktopAuthSession.findUnique({ where: { id: result.authSessionId } });
        if (!session || session.revokedAt || session.userId !== user.id || session.deviceIdHash !== deviceIdHash) return false;
      }
      return true;
    });
    if (!valid) throw loginFailure();
    return { ...result.session, success: true, status: "consumed", ...(result.authSessionId ? { authSessionId: result.authSessionId } : {}) };
  }

  return {
    initiate: async (req, res) => {
      noStore(res);
      try {
        const hwid = normalizeHwid(req.body?.hwid);
        const deviceIdHash = hashDeviceId(hwid);
        if (!hwid || !deviceIdHash) return publicFailure(res);

        if (req.body?.responseMode === "loopback" && !loopbackTarget(req.body?.state)) return publicFailure(res);
        let created = null;
        let publicCodes = null;
        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
          const request = createDesktopLoginRequest({
            pkceChallenge: req.body?.pkceChallenge,
            deviceIdHash,
            state: req.body?.state,
            appVersion: req.body?.appVersion
          });
          try {
            created = await prisma.desktopLoginRequest.create({
              data: {
                ...request.record,
                callbackRequired: ["authorization_code", "loopback"].includes(req.body?.responseMode),
                environmentRisk: normalizeDeviceEnvironmentRisk(req.body?.environmentRisk),
                deviceName: cleanDeviceLabel(req.body?.deviceName, "Windows PC"),
                devicePlatform: cleanDeviceLabel(req.body?.devicePlatform, "Windows", 48)
              }
            });
            publicCodes = request;
            break;
          } catch (error) {
            if (error?.code !== "P2002" || attempt === MAX_CREATE_ATTEMPTS - 1) throw error;
          }
        }

        return res.status(201).json({
          success: true,
          deviceCode: publicCodes.deviceCode,
          userCode: publicCodes.userCode,
          verificationUri: `${String(frontendUrl()).replace(/\/$/, "")}${desktopLoginPolicy.verificationPath}${created.callbackRequired ? `?request=${encodeURIComponent(created.id)}&state=${encodeURIComponent(publicCodes.state)}` : ""}`,
          expiresAt: created.expiresAt.toISOString(),
          intervalMs: POLL_INTERVAL_MS
        });
      } catch (error) {
        if (String(error?.code || "").startsWith("invalid_")) return publicFailure(res);
        return res.status(503).json({ success: false, error: "desktop_login_unavailable" });
      }
    },

    context: async (req, res) => {
      noStore(res);
      const lookup = browserLookup(req.body);
      if (!lookup) return publicFailure(res);
      const request = await prisma.desktopLoginRequest.findUnique({ where: lookup });
      const now = new Date();
      if (!request || requestExpired(request, now)) return publicFailure(res);
      if (req.body?.requestId && !request.callbackRequired) return publicFailure(res);
      if (request.callbackRequired && desktopStateHash(req.body?.state) !== request.stateHash) return publicFailure(res);
      if (request.status === "approved" && request.userId !== req.user.id) return publicFailure(res);
      if (!(["pending", "approved"].includes(request.status))) return publicFailure(res);

      return res.json({
        success: true,
        status: request.status,
        canApprove: request.status === "pending",
        appVersion: request.appVersion,
        device: {
          name: request.deviceName || "Windows PC",
          platform: request.devicePlatform || "Windows"
        },
        expiresAt: request.expiresAt.toISOString()
      });
    },

    approve: async (req, res) => {
      noStore(res);
      const lookup = browserLookup(req.body);
      if (!lookup || !req.user?.id) return publicFailure(res);
      try {
        const approval = await prisma.$transaction(async (db) => {
          await lockAccount(db, req.user.id);
          let authority;
          try {
            authority = await assertInitiatingSession({ req, db, userId: req.user.id });
          } catch {
            throw loginFailure(403, "desktop_login_authorization_expired");
          }
          if (authority !== true && authority?.userId !== req.user.id) {
            throw loginFailure(403, "desktop_login_authorization_expired");
          }
          const now = new Date();
          const request = await db.desktopLoginRequest.findUnique({ where: lookup });
          if (!request || requestExpired(request, now)) throw loginFailure(400);
          if (req.body?.requestId && !request.callbackRequired) throw loginFailure(400);
          const callbackState = String(req.body?.state || "").trim();
          if (request.callbackRequired && desktopStateHash(callbackState) !== request.stateHash) throw loginFailure(400);
          if (request.status === "approved" && request.userId === req.user.id) {
            return { success: true, status: "approved", expiresAt: request.expiresAt.toISOString() };
          }
          if (request.status !== "pending" || request.userId) throw loginFailure(400);
          const authorizationCode = request.callbackRequired ? createDesktopAuthorizationCode() : null;
          const updated = await db.desktopLoginRequest.updateMany({
            where: { id: request.id, status: "pending", userId: null, expiresAt: { gt: now } },
            data: { status: "approved", userId: req.user.id, approvedAt: now,
              ...(authorizationCode ? { authorizationCodeHash: desktopAuthorizationCodeHash(authorizationCode),
                authorizationCodeConsumedAt: null, authorizationCodeExpiresAt: new Date(Math.min(request.expiresAt.getTime(), now.getTime() + 60_000)) } : {}) }
          });
          if (updated.count !== 1) throw loginFailure(400);
          return { success: true, status: "approved", expiresAt: request.expiresAt.toISOString(),
            ...(authorizationCode && loopbackTarget(callbackState) ? { callbackUri: `${loopbackTarget(callbackState) || "fima://auth/callback"}?code=${encodeURIComponent(authorizationCode)}&state=${encodeURIComponent(callbackState)}` } : {}) };
        });
        return res.json(approval);
      } catch (error) {
        return publicFailure(res, error.desktopStatus || 503, error.desktopCode || "desktop_login_unavailable");
      }
    },

    exchange: async (req, res) => {
      noStore(res);
      try {
        const code = normalizeDesktopAuthorizationCode(req.body?.code);
        const hwid = normalizeHwid(req.body?.hwid);
        const deviceIdHash = hashDeviceId(hwid);
        if (!code || !hwid || !deviceIdHash) return publicFailure(res);
        const exchangeCodeHash = desktopAuthorizationCodeHash(code);
        const request = await prisma.desktopLoginRequest.findUnique({ where: { authorizationCodeHash: exchangeCodeHash } });
        if (!request || !request.userId) return publicFailure(res, 410);
        if (!epochProof(request, req.body, deviceIdHash).ok) return publicFailure(res);
        return res.json(await issueLocked({ request, req, hwid, deviceIdHash, exchangeCodeHash }));
      } catch (error) {
        return publicFailure(res, error.desktopStatus || 503, error.desktopCode || "desktop_login_unavailable");
      }
    },

    poll: async (req, res) => {
      noStore(res);
      try {
      const deviceCodeHash = desktopDeviceCodeHash(req.body?.deviceCode);
      const hwid = normalizeHwid(req.body?.hwid);
      const deviceIdHash = hashDeviceId(hwid);
      if (!deviceCodeHash || !hwid || !deviceIdHash) return publicFailure(res);

      const request = await prisma.desktopLoginRequest.findUnique({ where: { deviceCodeHash } });
      if (!request || !epochProof(request, req.body, deviceIdHash).ok) return publicFailure(res);

      const now = new Date();
      if (requestExpired(request, now)) {
        await prisma.desktopLoginRequest.updateMany({
          where: { id: request.id, status: { in: ["pending", "approved"] }, expiresAt: { lte: now } },
          data: { status: "expired", cancelledAt: now }
        });
        return res.status(410).json({ success: false, status: "expired", error: "desktop_login_expired" });
      }
      if (request.callbackRequired && request.status === "approved" && request.userId &&
          new Date(request.authorizationCodeExpiresAt || 0) <= now) {
        // Recover only after the original callback code expires; never rotate a live code.
        const code = createDesktopAuthorizationCode();
        const changed = await prisma.desktopLoginRequest.updateMany({
          where: { id: request.id, status: "approved", userId: request.userId,
            authorizationCodeHash: request.authorizationCodeHash, authorizationCodeConsumedAt: null,
            authorizationCodeExpiresAt: { lte: now }, expiresAt: { gt: now } },
          data: { authorizationCodeHash: desktopAuthorizationCodeHash(code),
            authorizationCodeExpiresAt: new Date(Math.min(request.expiresAt.getTime(), now.getTime() + 60_000)) }
        });
        if (changed.count === 1) return res.json({ success: true, status: "authorization_code", code });
      }
      if (request.callbackRequired && request.status === "consumed") return publicFailure(res, 410);
      if (request.status === "pending" || (request.callbackRequired && request.status === "approved")) {
        return res.status(202).json({ success: true, status: "pending", intervalMs: POLL_INTERVAL_MS, expiresAt: request.expiresAt.toISOString() });
      }
      if (!["approved", "consumed"].includes(request.status) || !request.userId) return publicFailure(res, 410);
      return res.json(await issueLocked({ request, req, hwid, deviceIdHash }));
      } catch (error) {
        return publicFailure(res, error.desktopStatus || 503, error.desktopCode || "desktop_login_unavailable");
      }
    },

    deny: async (req, res) => {
      noStore(res);
      const lookup = browserLookup(req.body);
      if (!lookup || !req.user?.id) return publicFailure(res);
      const request = await prisma.desktopLoginRequest.findUnique({ where: lookup });
      if (!request || !request.callbackRequired || desktopStateHash(req.body?.state) !== request.stateHash) return publicFailure(res);
      const now = new Date();
      const changed = await prisma.desktopLoginRequest.updateMany({
        where: { id: request.id, status: "pending", userId: null, expiresAt: { gt: now } },
        data: { status: "cancelled", cancelledAt: now }
      });
      if (changed.count !== 1) return publicFailure(res, 410);
      return res.json({ success: true, status: "cancelled" });
    },

    cancel: async (req, res) => {
      noStore(res);
      const deviceCodeHash = desktopDeviceCodeHash(req.body?.deviceCode);
      const hwid = normalizeHwid(req.body?.hwid);
      const deviceIdHash = hashDeviceId(hwid);
      if (!deviceCodeHash || !hwid || !deviceIdHash) return publicFailure(res);
      const request = await prisma.desktopLoginRequest.findUnique({ where: { deviceCodeHash } });
      if (!request || !epochProof(request, req.body, deviceIdHash).ok) return publicFailure(res);

      const now = new Date();
      const cancelled = await prisma.desktopLoginRequest.updateMany({
        where: { id: request.id, status: { in: ["pending", "approved"] }, expiresAt: { gt: now } },
        data: { status: "cancelled", cancelledAt: now }
      });
      if (cancelled.count !== 1) return publicFailure(res, 410);
      return res.json({ success: true, status: "cancelled" });
    }
  };
}
