import assert from "node:assert/strict";
import test from "node:test";
import {
  paradiseApplicationRedirectPath,
  paradiseFrontendRedirectUrl
} from "../src/paradiseDashboardRoute.js";

test("Paradise dashboard does not redirect to its own preview URL", () => {
  assert.equal(paradiseFrontendRedirectUrl({
    requestHostname: "127.0.0.1",
    requestHost: "127.0.0.1:4173",
    frontendBaseUrl: "http://127.0.0.1:4173",
    apiBaseUrl: "http://127.0.0.1:4173"
  }), null);
});

test("legacy dashboard requests redirect a distinct API host to the canonical FIMA Bot frontend", () => {
  assert.equal(paradiseFrontendRedirectUrl({
    requestHostname: "api.fimamacro.com",
    requestHost: "api.fimamacro.com",
    frontendBaseUrl: "https://fimamacro.com",
    apiBaseUrl: "https://api.fimamacro.com"
  }), "https://fimamacro.com/fima-bot/dashboard");
});

test("Paradise dashboard ignores malformed route configuration", () => {
  assert.equal(paradiseFrontendRedirectUrl({
    requestHostname: "api.fimamacro.com",
    requestHost: "api.fimamacro.com",
    frontendBaseUrl: "not a URL",
    apiBaseUrl: "not a URL"
  }), null);
});

test("legacy application aliases preserve only supported workflow and type", () => {
  assert.equal(
    paradiseApplicationRedirectPath({ workflow: " BUSINESS ", type: "Creator" }),
    "/fima-bot/apply?workflow=business&type=creator"
  );
  assert.equal(
    paradiseApplicationRedirectPath({ workflow: "staff", type: "content_creator", ignored: "secret" }),
    "/fima-bot/apply?workflow=staff&type=content_creator"
  );
  assert.equal(
    paradiseApplicationRedirectPath({ workflow: "evil", type: "../../account" }),
    "/fima-bot/apply"
  );
});
