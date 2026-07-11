import assert from "node:assert/strict";
import test from "node:test";
import { assertParadiseEnvironmentReady, buildParadiseEnvironmentReadiness } from "../src/paradiseEnvironmentReadiness.js";

const staging = {
  PARADISE_RUNTIME_ENV: "staging",
  NODE_ENV: "staging",
  DATABASE_URL: "postgresql://user:private-password@db.example.test:5432/paradise",
  FRONTEND_URL: "https://staging.fimamacro.test/path-not-returned",
  API_BASE_URL: "https://api-staging.fimamacro.test/private-path",
  DISCORD_CLIENT_ID: "1234567890",
  DISCORD_CLIENT_SECRET: "never-return-this",
  SESSION_SECRET: "never-return-this-either"
};

test("environment readiness is redacted, explicit and fixed to the approved test guild", () => {
  const result = buildParadiseEnvironmentReadiness(staging);
  assert.equal(result.ready, true);
  assert.equal(result.environment, "staging");
  assert.equal(result.identity.frontendHost, "staging.fimamacro.test");
  assert.equal(result.identity.apiHost, "api-staging.fimamacro.test");
  assert.equal(result.identity.testGuildIds[0], "1520519015661961257");
  const encoded = JSON.stringify(result);
  assert.doesNotMatch(encoded, /private-password|never-return-this|private-path/);
});

test("production/staging readiness fails closed when identity or required configuration is incomplete", () => {
  const result = buildParadiseEnvironmentReadiness({ PARADISE_RUNTIME_ENV: "production", NODE_ENV: "production" });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes("DATABASE_URL"));
  assert.throws(() => assertParadiseEnvironmentReady({ PARADISE_RUNTIME_ENV: "staging", NODE_ENV: "production" }), { code: "paradise_environment_not_ready" });
});
