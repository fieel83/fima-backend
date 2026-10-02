import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { issueAppEntitlement } from '../src/entitlements.js';
import { assertRefreshLicenseAccount, runEntitlementRefreshWithAccountLock } from '../src/entitlementRefreshSecurity.js';

process.env.ENTITLEMENT_SIGNING_SECRET = 'isolated-credential-barrier-test-secret';
const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
function extract(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
}
function adminFixture(failure) {
  let state = {
    users: [{ id: 'a', passwordHash: 'old', email: 'a@example.com' }],
    resets: [{ userId: 'a', usedAt: null }, { userId: 'b', usedAt: null }],
    sessions: [{ userId: 'a' }, { userId: 'b' }],
    desktop: ['pending', 'approved', 'consumed'].map(status => ({ userId: 'a', status })),
    links: [{ userId: 'a', provider: 'roblox_profile_verify' }, { userId: 'a', provider: 'roblox' }, { userId: 'b', provider: 'roblox_profile_verify' }]
  };
  let handler, transactions = 0;
  const prisma = {
    user: { findUnique: async () => structuredClone(state.users[0]) },
    async $transaction(fn) {
      transactions++;
      const draft = structuredClone(state);
      let locked = false;
      const check = stage => { assert.ok(locked); if (failure === stage) throw new Error(`${stage} failed`); };
      const tx = {
        $queryRaw: async (parts, id) => { assert.match(parts.join('?'), /users.*FOR UPDATE/); assert.equal(id, 'a'); locked = true; },
        user: { update: async ({ data }) => { check('password'); Object.assign(draft.users[0], data); } },
        passwordResetToken: { updateMany: async ({ where, data }) => { check('reset'); draft.resets.filter(r => r.userId === where.userId && r.usedAt === null).forEach(r => Object.assign(r, data)); } },
        userSession: { deleteMany: async ({ where }) => { check('session'); draft.sessions = draft.sessions.filter(r => r.userId !== where.userId); } },
        desktopLoginRequest: { updateMany: async ({ where, data }) => { check('desktop'); draft.desktop.filter(r => r.userId === where.userId && where.status.in.includes(r.status)).forEach(r => Object.assign(r, data)); } },
        oAuthLink: { deleteMany: async ({ where }) => { check('roblox'); draft.links = draft.links.filter(r => r.userId !== where.userId || r.provider !== where.provider); } }
      };
      const result = await fn(tx); state = draft; return result;
    }
  };
  const executable = extract('async function revokeAccountCredentialProofs(', 'async function consumePasswordReset(') + extract('app.post(["/admin/api/users/:id/temporary-password",', 'app.get("/admin/api/downloads",');
  runInNewContext(executable, { prisma, app: { post: (_paths, _guard, fn) => { handler = fn; } }, requireAdmin: {}, generateTemporaryPassword: () => 'temporary', hashPassword: async () => 'new', createAuditLog: async () => {}, maskEmail: () => 'masked' });
  return { state: () => structuredClone(state), transactions: () => transactions, invoke: () => handler({ params: { id: 'a' } }, { json: value => value }) };
}
test('actual admin reset atomically revokes all prior credential proofs and preserves unrelated identities', async () => {
  const f = adminFixture();
  assert.equal((await f.invoke()).success, true);
  const s = f.state();
  assert.equal(f.transactions(), 1);
  assert.equal(s.users[0].passwordHash, 'new');
  assert.ok(s.resets[0].usedAt instanceof Date);
  assert.equal(s.resets[1].usedAt, null);
  assert.deepEqual(s.sessions, [{ userId: 'b' }]);
  assert.deepEqual(s.desktop.map(r => r.status), ['cancelled', 'cancelled', 'consumed']);
  assert.deepEqual(s.links, [{ userId: 'a', provider: 'roblox' }, { userId: 'b', provider: 'roblox_profile_verify' }]);
});
for (const stage of ['password', 'reset', 'session', 'desktop', 'roblox']) {
  test(`actual admin reset rolls back password and proofs if ${stage} revocation fails`, async () => {
    const f = adminFixture(stage), original = f.state();
    await assert.rejects(f.invoke(), new RegExp(`${stage} failed`));
    assert.deepEqual(f.state(), original);
  });
}
function refreshFixture() {
  let user = { id: 'a', passwordHash: 'old' }, active = false;
  const order = [];
  const db = { async $transaction(fn) {
    assert.equal(active, false, 'no nested pool transaction'); active = true;
    try {
      const result = await fn({ $queryRaw: async () => {}, user: { findUnique: async () => ({ ...user }) } });
      order.push('commit'); return result;
    } finally { active = false; }
  } };
  return { db, order, user: () => ({ ...user }), audit(reset) { assert.equal(active, false, 'audit must run outside transaction'); order.push('audit'); if (reset) user.passwordHash = 'new'; } };
}
test('audit pool work precedes final refresh authority barrier without nesting transactions', async () => {
  const f = refreshFixture(), payload = issueAppEntitlement({ license: { id: 'l', plan: 'monthly' }, user: f.user(), hwid: 'DEVICE123' }).payload;
  const response = await runEntitlementRefreshWithAccountLock({ db: f.db, payload, operation: async () => 'response', beforeResponse: async () => f.audit(false) });
  assert.equal(response, 'response');
  assert.deepEqual(f.order, ['commit', 'audit', 'commit']);
});
test('credential reset while awaiting audit prevents signed refresh response delivery', async () => {
  const f = refreshFixture(), payload = issueAppEntitlement({ license: { id: 'l', plan: 'monthly' }, user: f.user(), hwid: 'DEVICE123' }).payload;
  await assert.rejects(runEntitlementRefreshWithAccountLock({ db: f.db, payload, operation: async (_tx, user) => issueAppEntitlement({ license: { id: 'l', plan: 'monthly' }, user, hwid: 'DEVICE123' }), beforeResponse: async () => f.audit(true) }), e => e.entitlementReason === 'entitlement_session_revoked');
  assert.deepEqual(f.order, ['commit', 'audit']);
});
test('actual HTTP refresh route rejects a reset during validation audit instead of delivering a token', async () => {
  const f = refreshFixture(), payload = issueAppEntitlement({ license: { id: 'l', plan: 'monthly' }, user: f.user(), hwid: 'DEVICE123' }).payload;
  const license = { id: 'l', plan: 'monthly', hwid: 'DEVICE123', lifetime: false, expiresAt: new Date(Date.now() + 86400000) };
  const transaction = f.db.$transaction;
  f.db.$transaction = fn => transaction(tx => { tx.license = { findUnique: async () => license }; return fn(tx); });
  f.db.validationLog = { create: async () => f.audit(true) };
  let handler;
  runInNewContext(extract('app.post("/api/license/refresh-entitlement",', 'app.get("/admin/login",'), {
    app: { post: (_path, _limiter, fn) => { handler = fn; } }, entitlementRefreshLimiter: {},
    extractEntitlementToken: () => 'signed', normalizeHwid: value => value, env: (_key, fallback) => fallback,
    DEFAULT_MIN_SUPPORTED_APP_VERSION: '1.0.130', minimumAppVersionStatus: () => ({ updateRequired: false }),
    entitlementSecretStatus: () => ({ configured: true }), licenseReasonMessage: value => value,
    verifyAppEntitlement: () => ({ ok: true, payload }), hashDeviceId: () => payload.hwidHash,
    runEntitlementRefreshWithAccountLock, assertRefreshLicenseAccount, prisma: f.db,
    buildLicenseAccountAccess: async () => ({ user: f.user() }),
    licenseBlockedReason: () => null, ownerLicenseBindingState: () => ({ ok: true }), ownerAdminAccessForLicense: () => false,
    issueAppEntitlement, publicEntitlementPayload: e => e.payload, licenseValidationPayload: () => ({}),
    validationLogLicenseKey: () => 'redacted', hashHwid: () => 'hashed', publicError: () => 'redacted', console: { error() {} }
  });
  const result = {}, res = { status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handler({ body: { hwid: 'DEVICE123', appVersion: '1.0.131' } }, res);
  assert.equal(result.status, 401);
  assert.equal(result.body.reason, 'entitlement_session_revoked');
  assert.equal(result.body.entitlementToken, undefined);
  assert.deepEqual(f.order, ['commit', 'audit']);
});
