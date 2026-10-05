import { entitlementVersionStatus } from "../src/appVersionPolicy.js";
import { ownerIdentityStatus } from '../src/ownerAccess.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { issueAppEntitlement, verifyAppEntitlement, verifyEntitlementAccountGeneration } from '../src/entitlements.js';
import { assertRefreshLicenseAccount, runEntitlementRefreshWithAccountLock } from '../src/entitlementRefreshSecurity.js';
process.env.ENTITLEMENT_SIGNING_SECRET = 'isolated-refresh-security-test-secret-only';
const originalUser = { id: 'account-a', passwordHash: 'old-password-hash' };
const issue = (user = originalUser, extra = {}) => issueAppEntitlement({ license: { id: 'license-a', plan: 'monthly' }, user, hwid: 'DEVICE123', ...extra });
function signedPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'FIMA-ENTITLEMENT', v: 'v1' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ENTITLEMENT_SIGNING_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
function fixture(user = originalUser) {
  let state = { user: structuredClone(user), value: 0 };
  let tail = Promise.resolve();
  let locks = 0;
  const db = { async $transaction(fn) {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    const draft = structuredClone(state);
    let locked = false;
    const tx = {
      async $queryRaw(parts, id) { assert.match(parts.join('?'), /SELECT id FROM users WHERE id = \? FOR UPDATE/); assert.equal(id, 'account-a'); locked = true; locks++; },
      user: { async findUnique({ where }) { assert.equal(locked, true); return draft.user?.id === where.id ? structuredClone(draft.user) : null; } },
      setPassword(hash) { assert.equal(locked, true); draft.user.passwordHash = hash; },
      mutate() { assert.equal(locked, true); draft.value++; }
    };
    try { const result = await fn(tx); state = draft; return result; } finally { release(); }
  } };
  return { db, state: () => structuredClone(state), locks: () => locks,
    reset: () => db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM users WHERE id = ${originalUser.id} FOR UPDATE`; tx.setPassword('new-password-hash'); }) };
}
const run = (f, payload, operation = async (_tx, user) => issue(user)) => runEntitlementRefreshWithAccountLock({ db: f.db, payload, operation });
const revoked = error => error.entitlementStatus === 401 && error.entitlementReason === 'entitlement_session_revoked';
test('signed generation exposes neither password nor password hash and reset changes it', () => {
  const first = issue(); const second = issue({ ...originalUser, passwordHash: 'new-password-hash' });
  assert.match(first.payload.accountGeneration, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.payload.accountGeneration, second.payload.accountGeneration);
  assert.equal(JSON.stringify(first.payload).includes(originalUser.passwordHash), false);
  assert.equal(verifyAppEntitlement(first.token).ok, true);
  assert.equal(verifyEntitlementAccountGeneration(first.payload, originalUser).ok, true);
});
for (const [name, edit] of [
  ['missing generation', p => delete p.accountGeneration],
  ['forged generation', p => p.accountGeneration = 'x'.repeat(43)],
  ['wrong account', p => p.accountId = 'account-b'],
  ['missing immutable user', p => p.userId = null]
]) test(`${name} cannot refresh account authority`, async () => {
  const f = fixture(); const payload = { ...issue().payload }; edit(payload);
  if (name !== 'forged generation') assert.equal(verifyAppEntitlement(signedPayload(payload)).ok, false);
  await assert.rejects(run(f, payload), revoked);
  assert.equal(f.state().value, 0);
});
test('reset before refresh revokes an otherwise correctly signed token', async () => {
  const f = fixture(); const payload = issue().payload;
  await f.reset();
  assert.equal(verifyAppEntitlement(signedPayload(payload)).ok, true);
  let called = false;
  await assert.rejects(run(f, payload, async () => { called = true; }), revoked);
  assert.equal(called, false);
});
test('refresh signs the locked authoritative account and rechecks before response', async () => {
  const f = fixture(); const result = await run(f, issue().payload);
  assert.equal(verifyAppEntitlement(result.token).ok, true);
  assert.equal(result.payload.userId, originalUser.id);
  assert.equal(f.locks(), 2);
});
test('reset queued during refresh issuance prevents token delivery', async () => {
  const f = fixture(); let queuedReset;
  await assert.rejects(run(f, issue().payload, async (_tx, user) => {
    queuedReset = f.reset();
    return issue(user);
  }), revoked);
  await queuedReset;
  assert.equal(f.state().user.passwordHash, 'new-password-hash');
});
test('a deleted account cannot refresh', async () => {
  const f = fixture(null); await assert.rejects(run(f, issue().payload), revoked);
});
test('expiry checked inside transaction rolls back attempted changes', async () => {
  const f = fixture(); const payload = issue().payload;
  await assert.rejects(run(f, payload, async tx => { tx.mutate(); payload.expiresAt = new Date(0).toISOString(); }), error => error.entitlementReason === 'entitlement_expired');
  assert.equal(f.state().value, 0);
});
test('issuance failure rolls back and releases account lock', async () => {
  const f = fixture(); await assert.rejects(run(f, issue().payload, async tx => { tx.mutate(); throw new Error('signing failed'); }), /signing failed/);
  assert.equal(f.state().value, 0); await f.reset();
});
for (const [name, payloadUser, accessUser, allowed] of [
  ['same account', 'account-a', 'account-a', true],
  ['license reassigned', 'account-a', 'account-b', false],
  ['orphaned license', 'account-a', null, false],
  ['legacy token cannot gain account', null, 'account-a', false],
  ['unlinked legacy license stays unlinked', null, null, true]
]) test(`license refresh account check: ${name}`, () => {
  const call = () => assertRefreshLicenseAccount({ userId: payloadUser }, { user: accessUser ? { id: accessUser } : null });
  if (allowed) assert.doesNotThrow(call); else assert.throws(call, revoked);
});
test('owner privileges cannot exist in an account-less signed token', () => {
  assert.throws(() => issue(null, { ownerAdminAccess: true }), /entitlement_owner_account_required/);
  const payload = issue(null).payload; payload.ownerAdminAccess = true;
  assert.equal(verifyAppEntitlement(signedPayload(payload)).ok, false);
});
const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const start = source.indexOf('app.post("/api/license/refresh-entitlement",');
const end = source.indexOf('app.get("/admin/login",', start);
assert.ok(start >= 0 && end > start);
function routeFixture({ user = originalUser, accessUser = user, payload = issue(user).payload, licenseId = 'license-a', ownerRequirements = null } = {}) {
  const f = fixture(user); let handler; let signed = false;
  const license = { id: 'license-a', plan: 'monthly', lifetime: false, hwid: 'DEVICE123', expiresAt: new Date(Date.now() + 86400000) };
  const nativeTransaction = f.db.$transaction;
  f.db.$transaction = callback => nativeTransaction(async tx => {
    tx.license = { async findUnique() { return license; } };
    const accountQuery = tx.$queryRaw;
    tx.$queryRaw = async (parts, ...args) => {
      if (parts.join('?').includes('desktop_auth_sessions')) return;
      return accountQuery(parts, ...args);
    };
    tx.desktopAuthSession = { async findUnique() {
      return { userId: payload.userId, deviceIdHash: payload.hwidHash, revokedAt: null };
    } };
    return callback(tx);
  });
  f.db.validationLog = { async create() {} };
  const context = { entitlementVersionStatus, app: { post(_path, _limiter, fn) { handler = fn; } }, entitlementRefreshLimiter: {},
    extractEntitlementToken: () => 'signed-fixture', normalizeHwid: value => value, env: (_key, fallback) => fallback,
    DEFAULT_MIN_SUPPORTED_APP_VERSION: '1.0.130', minimumAppVersionStatus: () => ({ updateRequired: false }),
    entitlementSecretStatus: () => ({ configured: true }), licenseReasonMessage: value => value,
    verifyAppEntitlement: () => ({ ok: true, payload: { ...payload, licenseId } }), hashDeviceId: () => payload.hwidHash,
    runEntitlementRefreshWithAccountLock, assertRefreshLicenseAccount, prisma: f.db,
    buildLicenseAccountAccess: async (_license, tx) => { assert.notEqual(tx, f.db); return { user: accessUser }; },
    isStrictAccountOnlyEntitlementPayload: () => true,
    resolveDesktopEntitlementForUser: async ({ user: authoritativeUser, db }) => { assert.notEqual(db, f.db); signed = true; return { valid: true, userId: authoritativeUser.id }; },
    licenseBlockedReason: () => null, ownerLicenseBindingState: () => ({ ok: true }),
    ownerAdminAccessForLicense: (_license, _hwid, _reason, access) => ownerRequirements ? ownerIdentityStatus(access, ownerRequirements).ok : false,
    issueAppEntitlement: args => { signed = true; return issueAppEntitlement(args); }, publicEntitlementPayload: e => e.payload,
    licenseValidationPayload: () => ({}), validationLogLicenseKey: () => 'redacted', hashHwid: () => 'hashed',
    publicError: () => 'redacted', console: { error() {} }
  };
  runInNewContext(source.slice(start, end), context);
  return { f, signed: () => signed, async request() {
    const result = { status: 200, body: null };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    await handler({ body: { hwid: 'DEVICE123', appVersion: '1.0.131' } }, res); return result;
  } };
}
test('actual licensed refresh handler rejects reset token as 401 rather than generic 500', async () => {
  const f = routeFixture(); await f.f.reset(); const result = await f.request();
  assert.equal(result.status, 401); assert.equal(result.body.reason, 'entitlement_session_revoked'); assert.equal(f.signed(), false);
});
test('actual licensed handler refuses a license mapped to another account', async () => {
  const f = routeFixture({ accessUser: { id: 'account-b' } }); const result = await f.request();
  assert.equal(result.status, 401); assert.equal(f.signed(), false);
});
test('actual licensed handler successfully refreshes the same immutable account', async () => {
  const f = routeFixture(); const result = await f.request(); assert.equal(result.status, 200); assert.equal(f.signed(), true);
  assert.equal(verifyAppEntitlement(result.body.entitlementToken).payload.accountId, 'account-a');
});
test('actual account-only handler revokes stale generation before resolver', async () => {
  const f = routeFixture({ licenseId: null }); await f.f.reset(); const result = await f.request();
  assert.equal(result.status, 401); assert.equal(f.signed(), false);
});
test('actual account-only handler resolves through the locked transaction', async () => {
  const f = routeFixture({ licenseId: null }); const result = await f.request(); assert.equal(result.status, 200); assert.equal(f.signed(), true);
});

for (const licenseId of ['license-a', null]) test(`desktop refresh preserves auth session ID (${licenseId || 'account-only'})`, async () => {
  const authSessionId = '01234567-89ab-4cde-8fab-0123456789ab';
  const payload = issue(originalUser, { authSessionId }).payload;
  const result = await routeFixture({ payload, licenseId }).request();
  assert.equal(result.status, 200);
  assert.equal(result.body.authSessionId, authSessionId);
  if (licenseId) assert.equal(verifyAppEntitlement(result.body.entitlementToken).payload.sessionId, result.body.authSessionId);
});

test('legacy refresh does not invent a desktop auth session', async () => {
  const result = await routeFixture().request();
  assert.equal(result.status, 200);
  assert.equal(result.body.authSessionId, undefined);
});

test('licensed refresh preserves verified owner OAuth links with authoritative credential fields', async () => {
  const user = { ...originalUser, email: 'owner@example.com', discordUserId: 'discord-owner' };
  const accessUser = { ...user, passwordHash: 'stale-read', oauthLinks: [{ provider: 'discord', providerSubject: 'discord-owner' }] };
  const result = await routeFixture({ user, accessUser, ownerRequirements: { ownerEmail: user.email, ownerDiscordId: user.discordUserId } }).request();
  assert.equal(result.status, 200);
  const payload = verifyAppEntitlement(result.body.entitlementToken).payload;
  assert.equal(payload.ownerAdminAccess, true);
  assert.equal(verifyEntitlementAccountGeneration(payload, user).ok, true);
});
