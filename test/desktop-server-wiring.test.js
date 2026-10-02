import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
function actual(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function load(names, dependencies) {
  const context = { Date, console, ...dependencies };
  runInNewContext(names.map(actual).join('\n') + `\nthis.exports = {${names.join(',')}};`, context);
  return context.exports;
}
const user = { id: 'account-a', email: 'a@example.test', passwordHash: 'fresh-hash' };
const globalTrap = new Proxy({}, { get() { throw new Error('global Prisma escaped transaction'); } });
function sessionDb(overrides = {}) {
  return { userSession: { async findUnique() { return { id: 'session-a', userId: user.id, tokenHash: 'hash', user, expiresAt: new Date(Date.now() + 60000), ...overrides }; } } };
}
const capture = load(['captureOAuthInitiatingSession'], { prisma: globalTrap, hashToken: value => value ? 'hash' : null, USER_SESSION_COOKIE: 'session', oauthInitiatingSessionProof: () => 'opaque-proof' }).captureOAuthInitiatingSession;
for (const [name, snapshot, override] of [
  ['stale password snapshot', { ...user, passwordHash: 'old-hash' }, {}],
  ['wrong session account', user, { userId: 'account-b' }],
  ['expired session', user, { expiresAt: new Date(0) }]
]) test(`actual initiating-session capture rejects ${name}`, async () => {
  await assert.rejects(capture({ cookies: { session: 'cookie' } }, snapshot, sessionDb(override)), /oauth_initiating_session_invalid/);
});
test('actual initiating-session capture uses locked transaction and fresh credential', async () => {
  const result = await capture({ cookies: { session: 'cookie' } }, user, sessionDb());
  assert.equal(result.sessionId, 'session-a'); assert.equal(result.proof, 'opaque-proof');
});
test('actual desktop factory supplies fresh-session assertion before handlers start', async () => {
  const start = source.indexOf('const desktopLoginHandlers = createDesktopLoginHandlers({');
  const end = source.indexOf('\napp.post(', start);
  let options, captured, asserted;
  const context = { prisma: {}, normalizeHwid: x => x, hashDeviceId: x => x, frontendUrl: () => '/', resolveDesktopEntitlementForUser: () => {}, USER_SESSION_COOKIE: 'session', hashToken: () => 'hash',
    createDesktopLoginHandlers: value => { options = value; return {}; },
    captureOAuthInitiatingSession: async (req, snapshot, db) => { captured = { req, snapshot, db }; return { sessionId: 'session-a', proof: 'proof' }; },
    assertOAuthInitiatingSession: async (db, authority, lock) => { asserted = { db, authority, lock }; }
  };
  runInNewContext(source.slice(start, end), context);
  const db = {}, req = { user, cookies: { session: 'cookie' } };
  const result = await options.assertInitiatingSession({ req, db, userId: user.id });
  assert.equal(captured.db, db); assert.equal(captured.snapshot, user); assert.equal(asserted.db, db);
  assert.equal(asserted.lock, true); assert.equal(asserted.authority.userId, user.id); assert.equal(result.userId, user.id);
});
test('actual license account helper chain keeps every lookup in provided transaction', async () => {
  let users = 0, links = 0;
  const db = { user: { async findFirst() { users++; return { ...user, discordUserId: '123456789012345678' }; } },
    oAuthLink: { async findMany() { links++; return [{ provider: 'discord', createdAt: new Date(), updatedAt: new Date() }]; } } };
  const functions = load(['buildLicenseAccountAccess', 'findUserForLicense', 'findUserByLoginEmail', 'buildIntegrationSummary'], {
    prisma: globalTrap, normalizeEmail: x => x, normalizeAccountEmail: x => x, isValidEmail: () => true, maskEmail: x => x,
    maskDiscordId: x => x, maskExternalId: x => x, publicRobloxPendingLink: () => null, robloxProfileUrl: () => null
  });
  const result = await functions.buildLicenseAccountAccess({ customerEmail: user.email }, db);
  assert.equal(result.user.id, user.id); assert.equal(result.discordLinked, true); assert.equal(users, 1); assert.equal(links, 1);
});
test('actual desktop resolver binds and rereads license only through provided transaction', async () => {
  let bound = 0, lookups = 0, issued;
  const license = { id: 'license-a', customerEmail: user.email, status: 'active', hwid: null };
  const db = { license: { async findMany() { return [license]; }, async updateMany() { bound++; return { count: 1 }; }, async findUnique() { return { ...license, hwid: 'DEVICE123' }; } } };
  const { resolveDesktopEntitlementForUser } = load(['resolveDesktopEntitlementForUser'], {
    prisma: globalTrap, normalizeHwid: x => x, env: (_name, fallback) => fallback, DEFAULT_MIN_SUPPORTED_APP_VERSION: '1.0.0',
    buildLicenseAccountAccess: async (_license, client) => { assert.equal(client, db); lookups++; return { user }; },
    isOwnerManagedLicense: () => false, ownerAdminAccessForLicense: () => false,
    issueAppEntitlement: options => { issued = options; return { token: 'signed', expiresAt: 'expiry' }; },
    publicEntitlementPayload: () => ({}), licenseValidationPayload: () => ({})
  });
  const result = await resolveDesktopEntitlementForUser({ user, hwid: 'DEVICE123', appVersion: '1.0.1', db });
  assert.equal(bound, 1); assert.equal(lookups, 2); assert.equal(issued.user, user); assert.equal(result.entitlementToken, 'signed');
});
