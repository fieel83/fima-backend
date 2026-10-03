import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import express from "express";
import cookieParser from "cookie-parser";
import { assignAccountUsername, revealAccountIdentity, usernameHandler } from "../src/accountIdentity.js";
import { createCsrfToken, requireCsrfForCookieMutations } from "../src/csrf.js";

function fixture(extra = []) {
  const users = [{ id: "self", email: "member@example.test", emailNormalized: "member@example.test", passwordHash: "unchanged", discordUserId: "linked", username: null }, ...extra];
  let locked = false;
  const client = { $transaction: async fn => fn({
    $queryRaw: async () => { locked = true; return [{ id: "self" }]; },
    user: {
      findUnique: async ({ where }) => users.find(user => user.id === where.id),
      findFirst: async ({ where }) => users.find(user => user.id !== where.id.not && where.OR.some(condition => Object.entries(condition).every(([key, value]) => user[key] === value))),
      update: async ({ where, data }) => { assert.ok(locked); assert.deepEqual(Object.keys(data), ["username"]); Object.assign(users.find(user => user.id === where.id), data); return users[0]; }
    }
  }) };
  return { users, client };
}

test("username assignment preserves email, recovery identity and password", async () => {
  const f = fixture(); const before = { ...f.users[0] };
  const user = await assignAccountUsername({ client: f.client, userId: "self", username: "sample_member" });
  assert.deepEqual(user, { ...before, username: "sample_member" });
});

test("modern and legacy namespace collisions, invalid input and setup accounts reject", async () => {
  for (const row of [{ username: "taken" }, { email: "taken@username.fimamacro.local" }, { emailNormalized: "taken@username.fimamacro.local" }]) {
    const f = fixture([{ id: "other", ...row }]);
    await assert.rejects(assignAccountUsername({ client: f.client, userId: "self", username: "taken" }), { code: "username_unavailable" });
    assert.equal(f.users[0].username, null);
  }
  const f = fixture();
  await assert.rejects(assignAccountUsername({ client: f.client, userId: "self", username: "!" }), { code: "invalid_username" });
  f.users[0].credentialSetupRequired = true;
  await assert.rejects(assignAccountUsername({ client: f.client, userId: "self", username: "member" }), { code: "account_setup_required" });
  f.users[0].credentialSetupRequired = false;
  f.users[0].email = "legacy@username.fimamacro.local";
  await assert.rejects(assignAccountUsername({ client: f.client, userId: "self", username: "member" }), { code: "legacy_username_change_unavailable" });
});

test("actual HTTP auth/CSRF, own-account scoping, reveal and unique-race mapping", async t => {
  const f = fixture(); const app = express(); app.use(express.json(), cookieParser());
  const authenticate = (req, res, next) => { if (req.cookies.session !== "test-session") return res.status(401).json({ error: "unauthorized" }); req.user = f.users[0]; next(); };
  const csrf = requireCsrfForCookieMutations({ userCookieName: "session", adminCookieName: "admin" });
  const options = { client: f.client, normalize: value => /^[a-z0-9_]{3,24}$/.test(String(value || "").toLowerCase()) ? value.toLowerCase() : "", reserved: new Set(["admin"]), serialize: user => ({ username: user.username }) };
  app.patch("/api/me/username", authenticate, csrf, usernameHandler(options));
  app.post("/api/me/identity/reveal", authenticate, csrf, revealAccountIdentity);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", cookie: "session=test-session", "x-fima-csrf": createCsrfToken("user", "test-session") };
  const request = (path, body, supplied = headers, method = "PATCH") => fetch(base + path, { method, headers: supplied, body: JSON.stringify(body) });
  assert.equal((await request("/api/me/username", { username: "member" }, { "content-type": "application/json" })).status, 401);
  assert.equal((await request("/api/me/username", { username: "member" }, { "content-type": "application/json", cookie: headers.cookie })).status, 403);
  assert.equal((await request("/api/me/username", { username: "admin" })).status, 400);
  assert.equal((await request("/api/me/username", { username: "Member", userId: "other" })).status, 200);
  assert.equal(f.users[0].username, "member");
  const response = await request("/api/me/identity/reveal", { field: "email", userId: "other" }, headers, "POST");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).value, f.users[0].email);
  assert.equal((await request("/api/me/identity/reveal", { field: "passwordHash" }, headers, "POST")).status, 400);
  options.client.$transaction = async () => { throw Object.assign(new Error("constraint"), { code: "P2002" }); };
  const raced = await request("/api/me/username", { username: "new_name" });
  assert.equal(raced.status, 409); assert.equal((await raced.json()).error, "username_unavailable");
});

function browserFixture(post) {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(new URL("../public/assets/js/account-identity.js", import.meta.url), "utf8"), context);
  const node = { textContent: "" }; const attrs = {};
  const button = { dataset: { revealTarget: "accountEmail" }, disabled: false, setAttribute: (key, value) => attrs[key] = value, getAttribute: key => attrs[key] };
  const errors = [];
  const controller = context.window.FimaAccountIdentity.create({ post, target: () => node, message: message => errors.push(message), label: (_, shown) => shown ? "Hide" : "Show" });
  controller.reset(button, "m***r@example.test");
  return { controller, node, button, attrs, errors };
}

test("reset invalidates stale eye responses and keeps unavailable fields hidden", async () => {
  let resolve;
  const f = browserFixture(() => new Promise(done => { resolve = done; }));
  const pending = f.controller.toggle(f.button);
  f.controller.reset(f.button, "Not set", false);
  resolve({ value: "member@example.test" });
  await pending;
  assert.equal(f.node.textContent, "Not set");
  assert.equal(f.button.disabled, true);
  assert.equal(f.attrs["aria-pressed"], "false");
  assert.deepEqual(f.errors, []);
});

test("eye reveals from API and re-hides locally, with no raw value cached", async () => {
  let calls = 0; const f = browserFixture(async () => { calls++; return { value: "member@example.test" }; });
  await f.controller.toggle(f.button); assert.equal(f.attrs["aria-pressed"], "true"); assert.equal(f.button.disabled, false);
  await f.controller.toggle(f.button); assert.equal(f.node.textContent, "m***r@example.test"); assert.equal(calls, 1);
  await f.controller.toggle(f.button); assert.equal(calls, 2);
});

test("eye failure recovers and in-flight double clicks issue one request", async () => {
  const failed = browserFixture(async () => { throw new Error("expired session"); });
  await failed.controller.toggle(failed.button);
  assert.equal(failed.node.textContent, "m***r@example.test"); assert.equal(failed.button.disabled, false); assert.deepEqual(failed.errors, ["expired session"]);
  let resolve; let calls = 0;
  const f = browserFixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = f.controller.toggle(f.button); await f.controller.toggle(f.button); assert.equal(calls, 1);
  resolve({ value: "member@example.test" }); await pending;
  f.controller.reset(f.button, "Not set", false); await f.controller.toggle(f.button); assert.equal(calls, 1);
});
