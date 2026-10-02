import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
const apiSource = source.slice(source.indexOf("  let csrfTokenPromise ="), source.indexOf("  const post ="));
const logoutSource = source.slice(source.indexOf("  const initLogout ="), source.indexOf("  const initAuthForm ="));
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
function client(fetch) {
  let now = 100;
  let handler;
  const messages = [];
  const button = { disabled: false };
  const window = { location: { href: "/dashboard" } };
  const context = vm.createContext({
    fetch, apiBase: "https://local-ui.invalid", Date: { now: () => now },
    t: (key) => `localized:${key}`, formatError: (key) => key,
    setMessage: (...args) => messages.push(args), window,
    document: { addEventListener(event, callback) { assert.equal(event, "click"); handler = callback; } }
  });
  vm.runInContext(`${apiSource}\nconst post = (path, body) => api(path, {method: 'POST', body: JSON.stringify(body)});
    let currentUserPromise = null; ${logoutSource}\ninitLogout(); globalThis.callApi = api;`, context);
  return { call: context.callApi, advance: () => { now += 51 * 60 * 1000; }, button, messages, window,
    logout: () => handler({ target: { closest: () => button }, preventDefault() {} }) };
}
test("cached CSRF token refreshes before server expiration", async () => {
  let tokens = 0; const headers = [];
  const c = client(async (url, options) => url.endsWith("/api/csrf-token")
    ? response(200, { csrfToken: `token-${++tokens}` })
    : (headers.push(options.headers["x-fima-csrf"]), response(200, {})));
  await c.call("/api/action", { method: "POST" }); await c.call("/api/action", { method: "POST" });
  c.advance(); await c.call("/api/action", { method: "POST" });
  assert.equal(tokens, 2); assert.deepEqual(headers, ["token-1", "token-1", "token-2"]);
});
test("canonical CSRF rejection refreshes and retries a mutation once", async () => {
  let tokens = 0; let writes = 0;
  const c = client(async (url) => url.endsWith("/api/csrf-token")
    ? response(200, { csrfToken: `token-${++tokens}` })
    : response(++writes === 1 ? 403 : 200, writes === 1 ? { error: "csrf_required" } : { success: true }));
  assert.equal((await c.call("/api/action", { method: "POST" })).success, true);
  assert.equal(tokens, 2); assert.equal(writes, 2);
});
test("persistent CSRF rejection stops after one retry", async () => {
  let writes = 0;
  const c = client(async (url) => url.endsWith("/api/csrf-token") ? response(200, { csrfToken: "fresh" })
    : (writes++, response(403, { error: "csrf_required" })));
  await assert.rejects(c.call("/api/action", { method: "POST" }), /csrf_required/); assert.equal(writes, 2);
});
for (const status of [401, 403, 409, 500]) {
  test(`non-CSRF ${status} is never retried`, async () => {
    let writes = 0;
    const c = client(async (url) => url.endsWith("/api/csrf-token") ? response(200, { csrfToken: "fresh" })
      : (writes++, response(status, { error: "other_error" })));
    await assert.rejects(c.call("/api/action", { method: "POST" }), /other_error/); assert.equal(writes, 1);
  });
}
test("network error never retries a mutation", async () => {
  let writes = 0;
  const c = client(async (url) => { if (url.endsWith("/api/csrf-token")) return response(200, { csrfToken: "fresh" });
    writes++; throw new Error("offline"); });
  await assert.rejects(c.call("/api/action", { method: "POST" }), /localized:networkError/); assert.equal(writes, 1);
});
test("failed logout exposes localized error and re-enables control", async () => {
  const c = client(async (url) => { if (url.endsWith("/api/csrf-token")) return response(200, { csrfToken: "fresh" });
    throw new Error("offline"); });
  await c.logout(); assert.equal(c.button.disabled, false);
  assert.equal(c.window.location.href, "/dashboard");
  assert.deepEqual(c.messages, [["localized:networkError", "error"]]);
});
test("successful logout navigates and duplicate click cannot submit", async () => {
  let release; let writes = 0;
  const c = client(async (url) => { if (url.endsWith("/api/csrf-token")) return response(200, { csrfToken: "fresh" });
    writes++; await new Promise((resolve) => { release = resolve; }); return response(200, {}); });
  const pending = c.logout(); while (!release) await new Promise((resolve) => setImmediate(resolve));
  await c.logout(); assert.equal(writes, 1); release(); await pending;
  assert.equal(c.window.location.href, "/login"); assert.equal(c.button.disabled, false);
});
