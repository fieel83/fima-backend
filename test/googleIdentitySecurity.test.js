import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
}
const executable = [
  extract("async function loginOrLinkGoogleAccount(", "async function getRobloxOidcDiscovery("),
  extract("function normalizeEmail(", "async function validateSignupEmail("),
  extract("function isValidEmail(", "function publicError("),
  "loginOrLinkGoogleAccount;"
].join("\n");
const user = (id, email = `${id}@example.com`) => ({ id, email, emailNormalized: email, passwordHash: "existing" });
const link = (userId, providerSubject = "google-one", provider = "google") => ({ userId, providerSubject, provider });
const input = (extra = {}) => ({ subject: "google-one", email: "new@example.com", name: "Name", ...extra });
function fixture({ users = [], links = [], failCreate = false } = {}) {
  let state = structuredClone({ users, links });
  const options = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const prisma = { async $transaction(callback, config) {
    options.push(config);
    const draft = structuredClone(state);
    const tx = {
      user: {
        async findUnique({ where }) { return draft.users.find(row => matches(row, where)) || null; },
        async findFirst({ where }) { return draft.users.find(row => where.OR.some(clause => matches(row, clause))) || null; },
        async create({ data }) { const created = { id: "new-user", ...data }; draft.users.push(created); return created; },
        async update({ where, data }) { const found = draft.users.find(row => matches(row, where)); assert.ok(found); Object.assign(found, data); return found; }
      },
      oAuthLink: {
        async findUnique({ where, include }) {
          const found = draft.links.find(row => matches(row, where.provider_providerSubject));
          return found ? { ...found, ...(include?.user ? { user: draft.users.find(row => row.id === found.userId) } : {}) } : null;
        },
        async findFirst({ where }) { return draft.links.find(row => matches(row, where)) || null; },
        async create({ data }) {
          if (failCreate) throw new Error("fixture_link_failure");
          assert.equal(draft.links.some(row => row.provider === data.provider && row.providerSubject === data.providerSubject), false);
          draft.links.push(data); return data;
        }
      }
    };
    const result = await callback(tx);
    state = draft;
    return result;
  } };
  const login = runInNewContext(executable, {
    prisma, Date, hashPassword: async () => "hashed-random", randomToken: () => "random",
    stripe: { customers: { create() { throw new Error("payment_side_effect_forbidden"); } } },
    assertOAuthInitiatingSession: async () => { throw new Error("unexpected_session_fixture"); }
  });
  return { login, state: () => structuredClone(state), options };
}
test("second Google identity cannot attach to an account already linked to Google", async () => {
  const f = fixture({ users: [user("owner")], links: [link("owner", "other-google")] });
  const before = f.state();
  await assert.rejects(f.login(input({ preferredUserId: "owner" })), /provider_already_linked/);
  assert.deepEqual(f.state(), before);
});
test("provider identity belonging to another account cannot be reassigned", async () => {
  const f = fixture({ users: [user("owner"), user("victim")], links: [link("victim")] });
  await assert.rejects(f.login(input({ preferredUserId: "owner" })), /provider_already_linked/);
  assert.equal(f.state().links[0].userId, "victim");
});
test("matching email does not implicitly merge an account", async () => {
  const f = fixture({ users: [user("victim", "new@example.com")] });
  await assert.rejects(f.login(input()), /provider_link_requires_login/);
  assert.equal(f.state().links.length, 0);
});
test("Gmail aliases do not bypass email collision protection", async () => {
  const f = fixture({ users: [user("victim", "name@gmail.com")] });
  await assert.rejects(f.login(input({ email: "n.a.me+alias@googlemail.com" })), /provider_link_requires_login/);
});
test("existing provider subject remains authoritative when email changes", async () => {
  const f = fixture({ users: [user("original")], links: [link("original")] });
  const result = await f.login(input());
  assert.equal(result.user.id, "original");
  assert.equal(result.created, false);
  assert.equal(result.user.emailVerifiedAt, undefined);
});
test("an explicit account link preserves a different provider and does not create an account", async () => {
  const f = fixture({ users: [user("owner")], links: [link("owner", "discord-id", "discord")] });
  const result = await f.login(input({ preferredUserId: "owner" }));
  assert.equal(result.created, false);
  assert.equal(f.state().users.length, 1);
  assert.equal(f.state().links.length, 2);
  assert.equal(f.state().links[1].userId, "owner");
});
test("new provider account stores identity only and a hashed random credential", async () => {
  const f = fixture();
  const result = await f.login(input());
  assert.equal(result.created, true);
  assert.equal(result.user.passwordHash, "hashed-random");
  assert.equal(f.state().links[0].accessTokenEncrypted, undefined);
  assert.equal(f.state().links[0].refreshTokenEncrypted, undefined);
  assert.equal(f.options[0].isolationLevel, "Serializable");
});
test("failed identity creation rolls back account creation", async () => {
  const f = fixture({ failCreate: true });
  await assert.rejects(f.login(input()), /fixture_link_failure/);
  assert.deepEqual(f.state(), { users: [], links: [] });
});
test("existing identity lookup also uses serializable isolation", async () => {
  const f = fixture({ users: [user("owner")], links: [link("owner")] });
  await f.login(input());
  assert.equal(f.options[0].isolationLevel, "Serializable");
});
test("invalid provider identity is rejected before database work", async () => {
  const f = fixture();
  await assert.rejects(f.login(input({ subject: "" })), /google_identity_invalid/);
  await assert.rejects(f.login(input({ email: "invalid" })), /google_identity_invalid/);
  assert.equal(f.options.length, 0);
});
