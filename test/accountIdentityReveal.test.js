import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { revealAccountIdentity } from "../src/accountIdentityReveal.js";
import { createCsrfToken, requireCsrfForCookieMutations } from "../src/csrf.js";

function response() {
  return { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } };
}
function reveal(user, body) {
  const res = response();
  revealAccountIdentity({ user, body }, res);
  return res;
}

test("own authenticated email reveals authoritative value with no-store", () => {
  const res = reveal({ id: "own", email: "person@example.invalid" },
    { field: "email", userId: "other", email: "injected@example.invalid" });
  assert.equal(res.body.value, "person@example.invalid");
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.equal(res.headers.Pragma, "no-cache");
});
test("explicit username is separate from provider email", () => {
  const res = reveal({ id: "own", username: "fieel", email: "person@example.invalid" }, { field: "username" });
  assert.deepEqual(res.body, { success: true, field: "username", value: "fieel" });
});
test("missing FIMA username never presents provider email as username", () => {
  const res = reveal({ id: "own", email: "person@example.invalid" }, { field: "username" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "identity_not_available");
});
test("legacy synthetic username can reveal without exposing fake email", () => {
  const user = { id: "own", email: "fieel@username.fimamacro.local" };
  assert.equal(reveal(user, { field: "username" }).body.value, "fieel");
  assert.equal(reveal(user, { field: "email" }).statusCode, 409);
});
test("invalid field and unauthenticated identity requests reject", () => {
  assert.equal(reveal({ id: "own", email: "person@example.invalid" }, { field: "passwordHash" }).statusCode, 400);
  assert.equal(reveal(undefined, { field: "email" }).statusCode, 401);
});
test("cookie identity reveal requires CSRF tied to its authenticated session", () => {
  const guard = requireCsrfForCookieMutations({ adminCookieName: "admin", userCookieName: "session" });
  function check(token) {
    const res = response();
    let passed = false;
    guard({ method: "POST", path: "/api/me/identity/reveal", cookies: { session: "own-session" },
      get: () => token, body: { field: "email" } }, res, () => { passed = true; });
    return { res, passed };
  }
  assert.equal(check("").res.statusCode, 403);
  assert.equal(check(createCsrfToken("user", "other-session")).res.statusCode, 403);
  assert.equal(check(createCsrfToken("user", "own-session")).passed, true);
});
test("production wiring keeps authentication and reversible reveal behavior", () => {
  const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /app\.post\("\/api\/me\/identity\/reveal", authLimiter, requireUser, revealAccountIdentity\)/);
  const script = readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  assert.match(script, /const username = user\.username \|\| t\("usernameNotSet"\)/);
  assert.match(script, /post\("\/api\/me\/identity\/reveal"/);
  assert.match(script, /getAttribute\("aria-pressed"\) === "true"/);
  assert.match(script, /finally \{\s*revealButton\.disabled = false/);
});
