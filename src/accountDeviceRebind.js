import { verifyPassword } from "./passwordCredentials.js";
import { takeAccountAttempt } from "./accountRateLimit.js";

// This is an operational reset, not a new trial grant or an owner-key reset.
// The caller must authenticate an administrator and audit the support reason.
export async function resetAccountDevice({ client, userId, isOwnerLicense }) {
  return client.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return { error: "account_not_found" };
    const licenses = await tx.license.findMany({ where: { customerEmail: user.email } });
    const ids = licenses.filter(license => !isOwnerLicense(license)).map(license => license.id);
    if (ids.length) await tx.license.updateMany({ where: { id: { in: ids } }, data: { hwid: null } });
    const now = new Date();
    await tx.desktopAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.desktopLoginRequest.updateMany({ where: { userId, status: { in: ["pending", "approved"] } }, data: { status: "cancelled", cancelledAt: now } });
    await tx.runtimeHandoffGrant.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    // A support reset never clears abuse history or the customer rebind budget.
    return { success: true, resetLicenses: ids.length };
  });
}

// Account lock serializes resets with password recovery and desktop sign-in.
export async function prepareDeviceReplacement({ client, userId, password, isOwnerLicense }) {
  const budget = await takeAccountAttempt({ client, scope: "device_rebind_password", identity: userId, limit: 5, windowSeconds: 900 });
  if (!budget.allowed) return { error: "rebind_rate_limited", retryAfter: budget.retryAfter };
  return client.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.credentialSetupRequired || !await verifyPassword(password, user.passwordHash)) return { error: "invalid_credentials" };
    const cooldown = await takeAccountAttempt({ client: tx, scope: "device_rebind", identity: userId, limit: 1, windowSeconds: 86400 });
    if (!cooldown.allowed) return { error: "rebind_cooldown", retryAfter: cooldown.retryAfter };
    const licenses = await tx.license.findMany({ where: { customerEmail: user.email } });
    const ids = licenses.filter(license => !isOwnerLicense(license)).map(license => license.id);
    if (ids.length) await tx.license.updateMany({ where: { id: { in: ids } }, data: { hwid: null } });
    const now = new Date();
    // Durable velocity evidence survives recovery/support resets. Advisory
    // only: paid customers retain the normal replacement/cooldown behavior.
    const previousReplacements = await tx.auditLog.count({ where: {
      action: "desktop_device_replacement_completed", targetType: "user", targetId: userId,
      createdAt: { gte: new Date(now.getTime() - 30 * 86400000) }
    } });
    await tx.desktopAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.desktopLoginRequest.updateMany({ where: { userId, status: { in: ["pending", "approved"] } }, data: { status: "cancelled", cancelledAt: now } });
    await tx.runtimeHandoffGrant.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.auditLog.create({ data: {
      action: "desktop_device_replacement_completed", targetType: "user", targetId: userId,
      metadata: { replacements30Days: previousReplacements + 1, suspiciousVelocity: previousReplacements >= 3 }
    } });
    return { success: true, nextReplacementAfter: new Date(now.getTime() + 86400000).toISOString() };
  });
}
