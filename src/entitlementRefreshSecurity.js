import { verifyEntitlementAccountGeneration } from "./entitlements.js";

export function entitlementRefreshFailure(reason = "entitlement_session_revoked", status = 401) {
  return Object.assign(new Error(reason), { entitlementReason: reason, entitlementStatus: status });
}

function assertUnexpired(payload) {
  const expiry = new Date(payload?.expiresAt || 0).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw entitlementRefreshFailure("entitlement_expired");
}

async function lockedUser(db, payload) {
  if (!payload.userId || payload.accountId !== payload.userId || typeof db.$queryRaw !== "function") throw entitlementRefreshFailure();
  await db.$queryRaw`SELECT id FROM users WHERE id = ${payload.userId} FOR UPDATE`;
  const user = await db.user.findUnique({ where: { id: payload.userId } });
  if (!verifyEntitlementAccountGeneration(payload, user).ok) throw entitlementRefreshFailure();
  assertUnexpired(payload);
  return user;
}

// The immutable signed account is retained when a legacy email-mapped license
// changes owner. An old license-only token may not acquire account/owner rights.
export function assertRefreshLicenseAccount(payload, accountAccess) {
  if ((accountAccess?.user?.id || null) !== (payload.userId || null)) throw entitlementRefreshFailure();
}

export async function runEntitlementRefreshWithAccountLock({ db, payload, operation, beforeResponse }) {
  if (typeof db?.$transaction !== "function" || typeof operation !== "function") throw entitlementRefreshFailure("entitlement_unavailable", 503);
  const accountBound = Boolean(payload?.userId || payload?.accountId);
  const transactionOptions = { maxWait: 5000, timeout: 15000 };
  const result = await db.$transaction(async (tx) => {
    assertUnexpired(payload);
    const user = accountBound ? await lockedUser(tx, payload) : null;
    const response = await operation(tx, user);
    assertUnexpired(payload);
    return response;
  }, transactionOptions);
  // Independent audit/pool work must finish outside the issuing transaction
  // and before the last credential check, never after that check.
  if (beforeResponse) await beforeResponse(result);
  if (accountBound) {
    // A reset queued during issuance must commit before this response barrier.
    // Rechecking inside the issuing transaction would miss that queued reset.
    await db.$transaction(async (tx) => { await lockedUser(tx, payload); }, transactionOptions);
  }
  assertUnexpired(payload);
  return result;
}
