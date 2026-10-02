import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { adminPage } from "../src/adminHtml.js";
import { csrfTokenPayload, requireCsrfForCookieMutations, verifyCsrfToken } from "../src/csrf.js";
import { ADMIN_COOKIE_NAME, createAdminToken, clearAdminCookie, requireAdmin } from "../src/adminAuth.js";

const html = adminPage();
const clientSource = html.slice(html.indexOf("let csrfTokenPromise = null;"), html.indexOf("async function api(path"));

function client(fetch, submit = () => {}) {
  const button = { disabled: false };
  const input = { value: "old-token" };
  const error = { hidden: true, textContent: "" };
  let listener;
  let submissions = 0;
  const form = {
    querySelector(selector) {
      return selector.startsWith("button") ? button : selector.startsWith("input") ? input : error;
    },
    addEventListener(event, handler) { assert.equal(event, "submit"); listener = handler; }
  };
  const context = vm.createContext({
    fetch,
    $: (id) => { assert.equal(id, "adminLogout"); return form; },
    HTMLFormElement: { prototype: { submit() { assert.equal(this, form); submissions += 1; submit(input.value); } } }
  });
  vm.runInContext(clientSource, context);
  return {
    context, button, input, error,
    get submissions() { return submissions; },
    submit() {
      let prevented = false;
      const result = listener({ currentTarget: form, preventDefault() { prevented = true; } });
      assert.equal(prevented, true, "The unprotected native submission must be prevented synchronously");
      return result;
    }
  };
}

test("generated admin page supplies a POST logout form, hidden CSRF input and accessible failure", () => {
  assert.match(html, /<form class="logout" id="adminLogout" method="post" action="\/admin\/logout">/);
  assert.match(html, /<input type="hidden" name="csrfToken" value="">/);
  assert.match(html, /role="alert" hidden/);
  assert.doesNotMatch(html, /action="\/admin\/logout\?/);
});

test("logout refreshes cached CSRF and submits only the fresh token via the native form", async () => {
  let calls = 0;
  const ui = client(async (url, options) => {
    calls += 1;
    assert.equal(url, "/admin/api/csrf-token");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => ({ csrfToken: "fresh-session-bound-token" }) };
  });
  vm.runInContext("csrfTokenPromise = Promise.resolve('expired-cached-token')", ui.context);
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(ui.submissions, 1);
  assert.equal(ui.input.value, "fresh-session-bound-token");
  assert.equal(ui.button.disabled, true, "Button remains disabled during browser navigation");
  assert.equal(ui.error.hidden, true);
});

for (const failure of ["network", "unauthorized", "missing-token", "invalid-json"]) {
  test(`logout fails closed for ${failure}, hides credentials and permits retry`, async () => {
    let fail = true;
    const ui = client(async () => {
      if (!fail) return { ok: true, json: async () => ({ csrfToken: "retry-token" }) };
      if (failure === "network") throw new Error("secret-network-detail");
      return {
        ok: failure !== "unauthorized",
        json: async () => {
          if (failure === "invalid-json") throw new Error("secret-parser-detail");
          return failure === "unauthorized" ? { csrfToken: "must-not-submit" } : {};
        }
      };
    });
    await ui.submit();
    assert.equal(ui.submissions, 0);
    assert.equal(ui.input.value, "");
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.error.hidden, false);
    assert.equal(ui.error.textContent, "Could not sign out securely. Please try again.");
    fail = false;
    await ui.submit();
    assert.equal(ui.submissions, 1);
    assert.equal(ui.input.value, "retry-token");
    assert.equal(ui.error.hidden, true);
  });
}

test("double logout click cannot fetch or submit twice while CSRF is pending", async () => {
  let resolve;
  let calls = 0;
  const ui = client(() => {
    calls += 1;
    return new Promise((done) => { resolve = done; });
  });
  const first = ui.submit();
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(ui.submissions, 0);
  resolve({ ok: true, json: async () => ({ csrfToken: "one-token" }) });
  await first;
  assert.equal(ui.submissions, 1);
});

test("real generated logout handler obtains signed CSRF then reaches actual redirect/cookie-clear callback over HTTP", async () => {
  const fixture = { ADMIN_PASSWORD: "logout-fixture-only", CSRF_SECRET: "logout-csrf-fixture-only", ADMIN_SESSION_VERSION: "", ADMIN_SESSION_REVOKED_BEFORE: "" };
  const previous = new Map(Object.keys(fixture).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixture);
  let server;
  try {
    const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
    const logoutMatch = source.match(/app\.post\("\/admin\/logout", requireAdmin, ([\s\S]*?)\r?\n\}\);/);
    const csrfMatch = source.match(/app\.get\("\/admin\/api\/csrf-token", requireAdmin, ([\s\S]*?)\r?\n\}\);/);
    assert.ok(logoutMatch && csrfMatch, "Extract exact current server callbacks without importing the monolith");
    let audits = 0;
    const deps = { ADMIN_COOKIE_NAME, clearAdminCookie, csrfTokenPayload, createAuditLog: () => { audits += 1; } };
    const logout = vm.runInNewContext(`(${logoutMatch[1]}\n})`, deps);
    const csrfEndpoint = vm.runInNewContext(`(${csrfMatch[1]}\n})`, deps);
    const app = express();
    app.use(express.urlencoded({ extended: false }), cookieParser());
    app.get("/admin/api/csrf-token", requireAdmin, csrfEndpoint);
    app.use(requireCsrfForCookieMutations({ adminCookieName: ADMIN_COOKIE_NAME, userCookieName: "fima_user_session" }));
    app.post("/admin/logout", requireAdmin, logout);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = createAdminToken();
    const cookie = `${ADMIN_COOKIE_NAME}=${session}`;
    let submission;
    const ui = client((path, options) => fetch(base + path, { ...options, headers: { cookie } }), (token) => {
      assert.equal(verifyCsrfToken(token, "admin", session), true);
      submission = fetch(base + "/admin/logout", {
        method: "POST", redirect: "manual",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken: token }).toString()
      });
    });
    await ui.submit();
    assert.equal(ui.submissions, 1);
    const response = await submission;
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/admin/login");
    assert.match(response.headers.get("set-cookie"), /fima_admin_session=;/);
    assert.equal(audits, 1);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
