import assert from "node:assert/strict";
import test from "node:test";
import {
  isUpdatingModeApiRequest,
  isUpdatingModeEnabled,
  isUpdatingModeOpenPath,
  updatingModeHeaders
} from "../src/siteUpdatingMode.js";

test("updating mode defaults can fail closed", () => {
  assert.equal(isUpdatingModeEnabled("owner_only"), true);
  assert.equal(isUpdatingModeEnabled("maintenance"), true);
  assert.equal(isUpdatingModeEnabled("off"), false);
  assert.equal(isUpdatingModeEnabled(undefined), false);
});

test("only maintenance delivery and owner sign-in paths remain reachable", () => {
  assert.equal(isUpdatingModeOpenPath("/healthz"), true);
  assert.equal(isUpdatingModeOpenPath("/owner-sign-in.html"), true);
  assert.equal(isUpdatingModeOpenPath("/assets/css/updating.css?v=1"), true);
  assert.equal(isUpdatingModeOpenPath("/assets/js/app.js"), false);
  assert.equal(isUpdatingModeOpenPath("/dashboard"), false);
  assert.equal(isUpdatingModeOpenPath("/api/billing/checkout"), false);
  assert.equal(isUpdatingModeOpenPath("//api/billing/checkout"), false);
});

test("public APIs receive machine-readable maintenance responses", () => {
  assert.equal(isUpdatingModeApiRequest({ originalUrl: "/api/billing/checkout" }), true);
  assert.equal(isUpdatingModeApiRequest({ originalUrl: "/dashboard", accept: "application/json" }), true);
  assert.equal(isUpdatingModeApiRequest({ originalUrl: "/", accept: "text/html" }), false);
  assert.equal(isUpdatingModeApiRequest({ originalUrl: "/api/auth/login" }), false);
});

test("maintenance headers prevent stale public availability", () => {
  const headers = updatingModeHeaders();
  assert.match(headers["Cache-Control"], /no-store/);
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow, noarchive");
});
