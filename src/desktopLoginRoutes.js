import {
  createDesktopLoginRequest,
  desktopDeviceCodeHash,
  desktopLoginPolicy,
  desktopUserCodeHash,
  normalizeDesktopUserCode,
  verifyDesktopLoginProof
} from "./desktopLogin.js";

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
  onConsumed = async () => {}
}) {
  if (!prisma?.desktopLoginRequest) throw new TypeError("desktopLoginRequest persistence is required");
  if (typeof prisma.$transaction !== "function") throw new TypeError("transactional persistence is required");
  if (typeof resolveEntitlementForUser !== "function") throw new TypeError("resolveEntitlementForUser is required");
  if (typeof assertInitiatingSession !== "function") throw new TypeError("assertInitiatingSession is required");

  return {
    initiate: async (req, res) => {
      noStore(res);
      try {
        const hwid = normalizeHwid(req.body?.hwid);
        const deviceIdHash = hashDeviceId(hwid);
        if (!hwid || !deviceIdHash) return publicFailure(res);

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
          verificationUri: `${String(frontendUrl()).replace(/\/$/, "")}${desktopLoginPolicy.verificationPath}`,
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
      const userCode = normalizeDesktopUserCode(req.body?.userCode);
      const userCodeHash = desktopUserCodeHash(userCode);
      if (!userCodeHash) return publicFailure(res);
      const request = await prisma.desktopLoginRequest.findUnique({ where: { userCodeHash } });
      const now = new Date();
      if (!request || requestExpired(request, now)) return publicFailure(res);
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
      const userCode = normalizeDesktopUserCode(req.body?.userCode);
      const userCodeHash = desktopUserCodeHash(userCode);
      if (!userCodeHash || !req.user?.id) return publicFailure(res);
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
          const request = await db.desktopLoginRequest.findUnique({ where: { userCodeHash } });
          if (!request || requestExpired(request, now)) throw loginFailure(400);
          if (request.status === "approved" && request.userId === req.user.id) {
            return { success: true, status: "approved", expiresAt: request.expiresAt.toISOString() };
          }
          if (request.status !== "pending" || request.userId) throw loginFailure(400);
          const updated = await db.desktopLoginRequest.updateMany({
            where: { id: request.id, status: "pending", userId: null, expiresAt: { gt: now } },
            data: { status: "approved", userId: req.user.id, approvedAt: now }
          });
          if (updated.count !== 1) throw loginFailure(400);
          return { success: true, status: "approved", expiresAt: request.expiresAt.toISOString() };
        });
        return res.json(approval);
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
      if (request.status === "pending") {
        return res.status(202).json({ success: true, status: "pending", intervalMs: POLL_INTERVAL_MS, expiresAt: request.expiresAt.toISOString() });
      }
      if (request.status !== "approved" || !request.userId) return publicFailure(res, 410);

      const result = await prisma.$transaction(async (db) => {
        // Password reset and approval take this same account lock. Never issue a
        // token from the stale pre-lock request or user snapshot.
        await lockAccount(db, request.userId);
        const current = await db.desktopLoginRequest.findUnique({ where: { deviceCodeHash } });
        const lockedNow = new Date();
        if (!current || current.id !== request.id || current.userId !== request.userId ||
            current.status !== "approved" || requestExpired(current, lockedNow) ||
            !epochProof(current, req.body, deviceIdHash).ok) throw loginFailure();
        const user = await db.user.findUnique({ where: { id: current.userId } });
        if (!user) throw loginFailure();
        const consumed = await db.desktopLoginRequest.updateMany({
          where: { id: current.id, status: "approved", userId: current.userId, expiresAt: { gt: lockedNow } },
          data: { status: "consumed", consumedAt: lockedNow }
        });
        if (consumed.count !== 1) throw loginFailure();
        // All binding writes must use this transaction; failure rolls both
        // request consumption and device/license binding back together.
        const session = await resolveEntitlementForUser({ user, hwid, appVersion: current.appVersion, db });
        if (requestExpired(current, new Date())) throw loginFailure();
        return { request: current, user, session, hwid };
      });

      await onConsumed(result).catch(() => {});
      // A reset already waiting on issuance must finish before the response's
      // credential check. A global read could observe its pre-commit snapshot.
      const latestUser = await prisma.$transaction(async (db) => {
        await lockAccount(db, result.user.id);
        return db.user.findUnique({ where: { id: result.user.id } });
      });
      if (!latestUser || latestUser.passwordHash !== result.user.passwordHash) return publicFailure(res, 410);
      return res.json({ ...result.session, success: true, status: "consumed" });
      } catch (error) {
        return publicFailure(res, error.desktopStatus || 503, error.desktopCode || "desktop_login_unavailable");
      }
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
