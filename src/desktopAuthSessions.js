import crypto from "node:crypto";

export class DesktopAuthSessionError extends Error {
  constructor(code = "entitlement_session_revoked") {
    super(code);
    this.code = code;
  }
}

export async function activateDesktopAuthSession({ prisma, db, request, userId, deviceIdHash, retry = false }) {
  if (!request?.id || !userId || !deviceIdHash || request.status !== "consumed"
      || request.userId !== userId || request.deviceIdHash !== deviceIdHash) throw new DesktopAuthSessionError();
  const activate = async (tx) => {
    const current = await tx.desktopAuthSession.findUnique({ where: { loginRequestId: request.id } });
    if (current) {
      if (current.revokedAt || current.userId !== userId || current.deviceIdHash !== deviceIdHash) throw new DesktopAuthSessionError();
      return current.id;
    }
    // A recovery poll must never create a replacement for a missing/revoked session.
    if (retry) throw new DesktopAuthSessionError();
    await tx.desktopAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    const created = await tx.desktopAuthSession.create({ data: { id: crypto.randomUUID(), loginRequestId: request.id, userId, deviceIdHash } });
    return created.id;
  };
  // The route already holds the account lock and passes its transaction client.
  if (db) return activate(db);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!Array.isArray(rows) || rows.length !== 1) throw new DesktopAuthSessionError();
    return activate(tx);
  });
}

export async function assertActiveDesktopAuthSession({ prisma, payload, deviceIdHash }) {
  if (!payload?.desktopAuthSession) return null;
  if (!payload.sessionId || !payload.userId || !deviceIdHash || payload.hwidHash !== deviceIdHash) {
    throw new DesktopAuthSessionError();
  }
  const session = await prisma.desktopAuthSession.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt || session.userId !== payload.userId || session.deviceIdHash !== deviceIdHash) {
    throw new DesktopAuthSessionError();
  }
  return session.id;
}

export async function revokeDesktopAuthSession({ prisma, payload, deviceIdHash }) {
  const id = await assertActiveDesktopAuthSession({ prisma, payload, deviceIdHash });
  if (!id) throw new DesktopAuthSessionError();
  const revoked = await prisma.desktopAuthSession.updateMany({
    where: { id, userId: payload.userId, deviceIdHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (revoked.count !== 1) throw new DesktopAuthSessionError();
  return id;
}

export function createDesktopLogoutHandler({ prisma, normalizeHwid, hashDeviceId, verifyAppEntitlement, extractEntitlementToken, logError = () => {} }) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const token = extractEntitlementToken(req);
    const hwid = normalizeHwid(req.body?.hwid);
    if (!token || !hwid) return res.status(401).json({ success: false, error: "entitlement_session_revoked" });
    try {
      const verified = verifyAppEntitlement(token);
      if (!verified.ok || !verified.payload?.desktopAuthSession) {
        return res.status(401).json({ success: false, error: "entitlement_session_revoked" });
      }
      await revokeDesktopAuthSession({ prisma, payload: verified.payload, deviceIdHash: hashDeviceId(hwid) });
      return res.json({ success: true, status: "revoked" });
    } catch (error) {
      if (error?.code === "entitlement_session_revoked") {
        return res.status(401).json({ success: false, error: "entitlement_session_revoked" });
      }
      logError(error);
      return res.status(503).json({ success: false, error: "desktop_login_unavailable" });
    }
  };
}
