import { prepareDeviceReplacement } from './accountDeviceRebind.js';

// Candidate only: schema and authenticated PostgreSQL acceptance remain gated.
export function registerAccountDeviceRoutes(app, {
  prisma, requireUser, authLimiter, isOwnerManagedLicense, createAuditLog,
  logError = () => {}
}) {
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const guarded = handler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { return await handler(req, res); }
    catch (error) {
      logError(error);
      return res.status(503).json({ error: 'device_management_unavailable' });
    }
  };
  app.get('/api/me/devices', noStore, requireUser, guarded(async (req, res) => {
    const sessions = await prisma.desktopAuthSession.findMany({
      where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, deviceIdHash: true, createdAt: true, revokedAt: true }
    });
    return res.json({ success: true, devices: sessions.map(session => ({
      id: session.id, label: `Desktop ${session.id.slice(0, 8)}`,
      fingerprint: `${session.deviceIdHash.slice(0, 6)}…${session.deviceIdHash.slice(-4)}`,
      createdAt: session.createdAt, revokedAt: session.revokedAt, active: !session.revokedAt
    })) });
  }));
  app.post('/api/me/devices/rebind', noStore, authLimiter, requireUser, guarded(async (req, res) => {
    const result = await prepareDeviceReplacement({ client: prisma, userId: req.user.id,
      password: req.body?.password, isOwnerLicense: isOwnerManagedLicense });
    await createAuditLog('desktop_device_rebind', 'user', req.user.id, { result: result.error || 'success' });
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    return res.status(result.error ? (result.retryAfter ? 429 : 403) : 200).json(result);
  }));
  app.post('/api/me/devices/:id/revoke', noStore, authLimiter, requireUser, guarded(async (req, res) => {
    const result = await prisma.$transaction(async tx => {
      // Use the same account-before-session order as login, recovery and refresh.
      const rows = await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${req.user.id} FOR UPDATE`;
      if (rows.length !== 1) return { error: 'device_not_found' };
      const session = await tx.desktopAuthSession.findFirst({
        where: { id: String(req.params.id || ''), userId: req.user.id },
        select: { id: true, revokedAt: true }
      });
      if (!session) return { error: 'device_not_found' };
      if (!session.revokedAt) {
        const updated = await tx.desktopAuthSession.updateMany({
          where: { id: session.id, userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() }
        });
        if (updated.count !== 1) throw new Error('device_revoke_conflict');
        await tx.auditLog.create({ data: { action: 'desktop_device_revoked', targetType: 'user',
          targetId: req.user.id, metadata: { sessionId: session.id } } });
      }
      return { success: true, revoked: true };
    });
    return res.status(result.error ? 404 : 200).json(result);
  }));
}
