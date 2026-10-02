import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Execute the actual server functions without starting listeners, Stripe or a database.
const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source boundary: ${start}`);
  return source.slice(first, last);
}
const executable = [
  extract("async function loginOrLinkDiscordAccount(", "async function loginOrLinkGoogleAccount("),
  extract("function normalizeEmail(", "async function validateSignupEmail("),
  extract("function isValidEmail(", "function publicError("),
  "loginOrLinkDiscordAccount;"
].join("\n");
const subject = "1511058472748454019";
const otherSubject = "1511058472748454020";
const profile = (overrides = {}) => ({ id: subject, username: "discord-user", email: "new@example.com", verified: true, ...overrides });
const token = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, scope: "identify email" };
const account = (id, overrides = {}) => ({ id, email: `${id}@example.com`, emailNormalized: `${id}@example.com`, passwordHash: "existing-hash", ...overrides });
const identity = (userId, overrides = {}) => ({ id: `link-${userId}`, provider: "discord", providerSubject: subject, userId, ...overrides });
const copy = (value) => structuredClone(value);

function fixture({ users = [], links = [], failLinkCreate = false } = {}) {
  let state = copy({ users, links });
  const writes = [];
  const transactionOptions = [];
  let stripeCalls = 0;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const forbiddenStripe = () => { stripeCalls += 1; throw new Error("stripe_not_allowed_in_identity_login"); };
  const prisma = {
    async $transaction(callback, options) {
      transactionOptions.push(copy(options));
      const draft = copy(state);
      const tx = {
        user: {
          async findUnique({ where }) { return copy(draft.users.find((row) => matches(row, where)) || null); },
          async findFirst({ where }) { return copy(draft.users.find((row) => where.OR ? where.OR.some((clause) => matches(row, clause)) : matches(row, where)) || null); },
          async create({ data }) {
            writes.push({ model: "user", operation: "create", data: copy(data) });
            const row = { id: "new-account", ...copy(data) };
            draft.users.push(row);
            return copy(row);
          },
          async update({ where, data }) {
            writes.push({ model: "user", operation: "update", where: copy(where), data: copy(data) });
            const row = draft.users.find((entry) => matches(entry, where));
            assert.ok(row, "User update must reference an existing account");
            Object.assign(row, copy(data));
            return copy(row);
          }
        },
        oAuthLink: {
          async findUnique({ where }) { return copy(draft.links.find((row) => matches(row, where.provider_providerSubject)) || null); },
          async findFirst({ where }) { return copy(draft.links.find((row) => matches(row, where)) || null); },
          async create({ data }) {
            writes.push({ model: "oAuthLink", operation: "create", data: copy(data) });
            if (failLinkCreate) throw new Error("fixture_link_write_failed");
            assert.ok(!draft.links.some((row) => row.provider === data.provider && row.providerSubject === data.providerSubject), "Duplicate provider subject");
            const row = { id: "new-link", ...copy(data) };
            draft.links.push(row);
            return copy(row);
          },
          async update({ where, data }) {
            writes.push({ model: "oAuthLink", operation: "update", where: copy(where), data: copy(data) });
            const row = draft.links.find((entry) => matches(entry, where.provider_providerSubject));
            assert.ok(row, "Link update must reference an existing identity");
            Object.assign(row, copy(data));
            return copy(row);
          }
        }
      };
      const result = await callback(tx);
      state = draft;
      return result;
    }
  };
  // No root Prisma delegates: any database access outside the transaction fails.
  const login = runInNewContext(executable, {
    prisma, ensureStripeCustomer: forbiddenStripe,
    stripe: { customers: { create: forbiddenStripe, update: forbiddenStripe } },
    hashPassword: async () => "hashed-random-setup-password",
    randomToken: () => "fixture-random-setup-secret",
    encryptToken: (value) => value ? `encrypted:${value}` : null
  }, { filename: "actual-server-discord-identity.js" });
  return { login, writes, transactionOptions, state: () => copy(state), stripeCalls: () => stripeCalls };
}

async function rejectsWithoutWrites(f, expected, preferred = null, input = profile()) {
  const before = f.state();
  await assert.rejects(f.login(input, token, preferred), (error) => error.message === expected);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.state(), before);
  assert.equal(f.stripeCalls(), 0);
}

test("verified Discord email collision does not merge accounts or mutate either account", async () => {
  const f = fixture({ users: [account("existing", { email: "new@example.com", emailNormalized: "new@example.com" })] });
  await rejectsWithoutWrites(f, "provider_link_requires_login");
});

test("normalized Gmail alias collision also requires proof of existing account ownership", async () => {
  const f = fixture({ users: [account("existing", { email: "name@gmail.com", emailNormalized: "name@gmail.com" })] });
  await rejectsWithoutWrites(f, "provider_link_requires_login", null, profile({ email: "n.a.me+discord@googlemail.com" }));
});

test("preferred account cannot take another account's immutable Discord identity", async () => {
  const f = fixture({ users: [account("a"), account("b")], links: [identity("a")] });
  await rejectsWithoutWrites(f, "provider_already_linked", "b");
});

test("existing provider logs into its account regardless of a foreign email match; ownership remains immutable", async () => {
  const f = fixture({ users: [account("a", { discordUserId: subject }), account("b", { email: "new@example.com", emailNormalized: "new@example.com" })], links: [identity("a")] });
  const result = await f.login(profile(), token, "a");
  assert.equal(result.created, false);
  assert.equal(result.user.id, "a");
  assert.equal(f.state().users.length, 2);
  assert.equal(f.state().users.find((row) => row.id === "a").email, "a@example.com");
  assert.deepEqual(f.state().users.find((row) => row.id === "b"), account("b", { email: "new@example.com", emailNormalized: "new@example.com" }));
  const write = f.writes.find((entry) => entry.model === "oAuthLink");
  assert.equal(write.operation, "update");
  for (const key of ["userId", "provider", "providerSubject"]) assert.equal(Object.hasOwn(write.data, key), false);
  assert.equal(f.state().links[0].userId, "a");
  assert.equal(f.state().links[0].providerSubject, subject);
  assert.equal(f.state().links[0].accessTokenCipher, "encrypted:fixture-access");
  assert.equal(f.stripeCalls(), 0);
  assert.deepEqual(f.transactionOptions, [{ isolationLevel: "Serializable" }]);
});

test("OAuth link and legacy numeric Discord field disagreement fails before writes", async () => {
  const f = fixture({ users: [account("a"), account("b", { discordUserId: subject })], links: [identity("a")] });
  await rejectsWithoutWrites(f, "provider_identity_conflict");
});

test("account with a different legacy Discord identity cannot replace it via linking", async () => {
  const f = fixture({ users: [account("a", { discordUserId: otherSubject })] });
  await rejectsWithoutWrites(f, "provider_already_linked", "a");
});

test("account with a different Discord OAuth link cannot receive a second identity", async () => {
  const f = fixture({ users: [account("a")], links: [identity("a", { providerSubject: otherSubject })] });
  await rejectsWithoutWrites(f, "provider_already_linked", "a");
});

test("new identity creates one account and link atomically without Stripe mutation", async () => {
  const f = fixture();
  const result = await f.login(profile(), token);
  assert.equal(result.created, true);
  assert.equal(f.state().users.length, 1);
  assert.equal(f.state().links.length, 1);
  assert.equal(result.user.passwordHash, "hashed-random-setup-password");
  assert.ok(result.user.emailVerifiedAt);
  assert.equal(f.state().links[0].userId, result.user.id);
  assert.equal(f.state().links[0].providerSubject, subject);
  assert.equal(f.stripeCalls(), 0);
  assert.deepEqual(f.transactionOptions, [{ isolationLevel: "Serializable" }]);
});

test("legacy numeric identity backfills a link to the same immutable account without creating an account", async () => {
  const f = fixture({ users: [account("a", { discordUserId: subject })] });
  const result = await f.login(profile({ email: null }), token);
  assert.equal(result.created, false);
  assert.equal(result.user.id, "a");
  assert.equal(f.state().users.length, 1);
  assert.equal(f.state().links[0].userId, "a");
});

test("dangling provider link cannot silently create a replacement account", async () => {
  const f = fixture({ links: [identity("deleted-account")] });
  await rejectsWithoutWrites(f, "provider_account_missing");
});

test("new identity without email fails closed without account writes", async () => {
  await rejectsWithoutWrites(fixture(), "discord_email_required", null, profile({ email: null }));
});

test("display names and nonnumeric IDs never establish ownership", async () => {
  const f = fixture();
  await rejectsWithoutWrites(f, "discord_identity_invalid", null, profile({ id: "discord-user" }));
  assert.equal(f.transactionOptions.length, 0);
});

test("link write failure rolls back the new account and profile update", async () => {
  const f = fixture({ failLinkCreate: true });
  await assert.rejects(f.login(profile(), token), (error) => error.message === "fixture_link_write_failed");
  assert.deepEqual(f.state(), { users: [], links: [] });
  assert.equal(f.stripeCalls(), 0);
});
