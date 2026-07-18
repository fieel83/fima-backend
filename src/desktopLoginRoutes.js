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

export function createDesktopLoginHandlers({
  prisma,
  normalizeHwid,
  hashDeviceId,
  frontendUrl,
  resolveEntitlementForUser,
  onConsumed = async () => {}
}) {
  if (!prisma?.desktopLoginRequest) throw new TypeError("desktopLoginRequest persistence is required");
  if (typeof resolveEntitlementForUser !== "function") throw new TypeError("resolveEntitlementForUser is required");

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
      if (!userCodeHash) return publicFailure(res);
      const now = new Date();
      const request = await prisma.desktopLoginRequest.findUnique({ where: { userCodeHash } });
      if (!request || requestExpired(request, now)) return publicFailure(res);

      if (request.status === "approved" && request.userId === req.user.id) {
        return res.json({ success: true, status: "approved", expiresAt: request.expiresAt.toISOString() });
      }
      if (request.status !== "pending" || request.userId) return publicFailure(res);

      const updated = await prisma.desktopLoginRequest.updateMany({
        where: {
          id: request.id,
          status: "pending",
          userId: null,
          expiresAt: { gt: now }
        },
        data: { status: "approved", userId: req.user.id, approvedAt: now }
      });
      if (updated.count !== 1) return publicFailure(res);
      return res.json({ success: true, status: "approved", expiresAt: request.expiresAt.toISOString() });
    },

    poll: async (req, res) => {
      noStore(res);
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

      const user = await prisma.user.findUnique({ where: { id: request.userId } });
      if (!user) {
        await prisma.desktopLoginRequest.updateMany({
          where: { id: request.id, status: "approved", userId: request.userId },
          data: { status: "cancelled", cancelledAt: now }
        });
        return publicFailure(res, 410);
      }

      const session = await resolveEntitlementForUser({ user, hwid, appVersion: request.appVersion });
      const consumed = await prisma.desktopLoginRequest.updateMany({
        where: {
          id: request.id,
          status: "approved",
          userId: request.userId,
          expiresAt: { gt: new Date() }
        },
        data: { status: "consumed", consumedAt: new Date() }
      });
      if (consumed.count !== 1) return publicFailure(res, 410);

      await onConsumed({ request, user, session, hwid }).catch(() => {});
      return res.json({ success: true, status: "consumed", ...session });
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
