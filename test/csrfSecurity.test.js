import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { createCsrfToken, requireCsrfForCookieMutations } from "../src/csrf.js";
import { ADMIN_COOKIE_NAME, createAdminToken, requireAdmin } from "../src/adminAuth.js";

const USER_COOKIE = "fima_user_session";
const USER_SESSION = "isolated-csrf-user-session";
const ADMIN_KEY = "isolated-csrf-admin-key";
const fixtureEnv = {
  ADMIN_PASSWORD: "isolated-csrf-admin-signing-secret",
  CSRF_SECRET: "isolated-csrf-signing-secret",
  FIMA_ADMIN_API_KEY: ADMIN_KEY,
  ADMIN_SESSION_VERSION: "isolated-csrf-test",
  ADMIN_SESSION_REVOKED_BEFORE: ""
};
const originalEnv = new Map(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
let server;
let baseUrl;
let adminSession;
let mutations = 0;

before(async () => {
  Object.assign(process.env, fixtureEnv);
  adminSession = createAdminToken();
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(requireCsrfForCookieMutations({ adminCookieName: ADMIN_COOKIE_NAME, userCookieName: USER_COOKIE }));
  const mutate = (_req, res) => { mutations += 1; res.json({ success: true }); };
  app.post("/api/account/mutate", (req, res, next) => {
    if (req.cookies[USER_COOKIE] !== USER_SESSION) return res.status(401).json({ error: "unauthorized" });
    next();
  }, mutate);
  app.post("/admin/api/mutate", requireAdmin, mutate);
  app.post("/admin/logout", requireAdmin, mutate);
  // Login authenticates explicit credentials itself and does not use the ambient session.
  app.post("/api/auth/login", (_req, res) => res.json({ success: true }));
  app.get("/admin/api/read", requireAdmin, (_req, res) => res.json({ success: true }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function request(path, headers = {}, method = "POST") {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { accept: "application/json", ...headers },
    ...(method === "POST" ? { body: "{}", headers: { accept: "application/json", "content-type": "application/json", ...headers } } : {})
  });
  return { status: response.status, body: await response.json() };
}

async function rejected(path, headers, status, error) {
  const previous = mutations;
  const result = await request(path, headers);
  assert.equal(result.status, status);
  assert.equal(result.body.error, error);
  assert.equal(mutations, previous, "Rejected request must not reach mutation handler");
}

for (const [kind, cookie, path] of [
  ["user", `${USER_COOKIE}=${USER_SESSION}`, "/api/account/mutate"],
  ["admin", () => `${ADMIN_COOKIE_NAME}=${adminSession}`, "/admin/api/mutate"]
]) {
  for (const [header, value] of [["authorization", "Bearer forged-key"], ["x-admin-api-key", "forged-key"]]) {
    test(`${kind} cookie plus forged ${header} cannot bypass CSRF`, async () => {
      await rejected(path, { cookie: typeof cookie === "function" ? cookie() : cookie, [header]: value }, 403, "csrf_required");
    });
  }
}

test("even a genuine admin key cannot bypass CSRF when an admin cookie is present", async () => {
  await rejected("/admin/api/mutate", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}`, "x-admin-api-key": ADMIN_KEY }, 403, "csrf_required");
});

test("even a genuine admin bearer cannot bypass CSRF when a user cookie is present", async () => {
  await rejected("/admin/api/mutate", { cookie: `${USER_COOKIE}=${USER_SESSION}`, authorization: `Bearer ${ADMIN_KEY}` }, 403, "csrf_required");
});

test("valid user session-bound CSRF authorizes the cookie mutation", async () => {
  const result = await request("/api/account/mutate", { cookie: `${USER_COOKIE}=${USER_SESSION}`, "x-fima-csrf": createCsrfToken("user", USER_SESSION) });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
});

test("valid admin session-bound CSRF authorizes the actual admin middleware", async () => {
  const result = await request("/admin/api/mutate", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}`, "x-fima-csrf": createCsrfToken("admin", adminSession) });
  assert.equal(result.status, 200);
});

test("valid CSRF does not make a forged admin key authoritative", async () => {
  await rejected("/admin/api/mutate", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}`, "x-fima-csrf": createCsrfToken("admin", adminSession), "x-admin-api-key": "forged-key" }, 401, "unauthorized");
});

test("CSRF issued for another user session is rejected", async () => {
  await rejected("/api/account/mutate", { cookie: `${USER_COOKIE}=${USER_SESSION}`, "x-fima-csrf": createCsrfToken("user", "other-session") }, 403, "csrf_required");
});

test("CSRF issued for another authority scope is rejected", async () => {
  await rejected("/api/account/mutate", { cookie: `${USER_COOKIE}=${USER_SESSION}`, "x-fima-csrf": createCsrfToken("admin", USER_SESSION) }, 403, "csrf_required");
});

for (const [header, value] of [["x-admin-api-key", ADMIN_KEY], ["authorization", `Bearer ${ADMIN_KEY}`]]) {
  test(`genuine non-cookie ${header} remains verified by requireAdmin`, async () => {
    const result = await request("/admin/api/mutate", { [header]: value });
    assert.equal(result.status, 200);
  });
}

for (const headers of [{}, { "x-admin-api-key": "forged-key" }, { authorization: "Bearer forged-key" }]) {
  test(`non-cookie ${Object.keys(headers)[0] || "missing credentials"} cannot impersonate admin`, async () => {
    await rejected("/admin/api/mutate", headers, 401, "unauthorized");
  });
}

test("cookie-authenticated admin logout now requires CSRF", async () => {
  await rejected("/admin/logout", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}` }, 403, "csrf_required");
  const result = await request("/admin/logout", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}`, "x-fima-csrf": createCsrfToken("admin", adminSession) });
  assert.equal(result.status, 200);
});

test("safe authenticated read does not require CSRF", async () => {
  const result = await request("/admin/api/read", { cookie: `${ADMIN_COOKIE_NAME}=${adminSession}` }, "GET");
  assert.equal(result.status, 200);
});

test("existing explicit-credential login exemption remains compatible", async () => {
  const result = await request("/api/auth/login", { cookie: `${USER_COOKIE}=${USER_SESSION}` });
  assert.equal(result.status, 200);
});
