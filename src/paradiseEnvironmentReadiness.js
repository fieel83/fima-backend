import crypto from "node:crypto";
import { PARADISE_TEST_GUILD_ID, resolveRuntimeEnvironment } from "./runtimeEnvironment.js";

const BASE_REQUIRED = Object.freeze([
  "PARADISE_RUNTIME_ENV",
  "DATABASE_URL",
  "FRONTEND_URL",
  "API_BASE_URL",
  "DISCORD_CLIENT_ID"
]);

const SECRET_REQUIRED = Object.freeze([
  "DISCORD_CLIENT_SECRET",
  "SESSION_SECRET"
]);

export const PARADISE_ENVIRONMENT_REQUIREMENTS = Object.freeze({
  development: BASE_REQUIRED,
  staging: Object.freeze([...BASE_REQUIRED, ...SECRET_REQUIRED]),
  production: Object.freeze([...BASE_REQUIRED, ...SECRET_REQUIRED])
});

function safeHost(value) {
  try { return new URL(String(value || "")).host || null; } catch { return null; }
}

function fingerprint(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

export function buildParadiseEnvironmentReadiness(source = process.env) {
  const environment = resolveRuntimeEnvironment(source);
  const required = PARADISE_ENVIRONMENT_REQUIREMENTS[environment.name] || BASE_REQUIRED;
  const missing = required.filter(key => !String(source[key] || "").trim());
  const expectedNodeEnv = environment.name === "production" ? "production" : environment.name;
  const nodeEnv = String(source.NODE_ENV || "").trim().toLowerCase();
  const nodeEnvMatches = environment.name === "development"
    ? !nodeEnv || nodeEnv === "development"
    : nodeEnv === expectedNodeEnv;
  return Object.freeze({
    schemaVersion: 1,
    environment: environment.name,
    markerValid: environment.markerValid,
    ready: environment.markerValid && missing.length === 0 && nodeEnvMatches,
    missing,
    nodeEnvMatches,
    expectedNodeEnv,
    identity: Object.freeze({
      databaseFingerprint: fingerprint(source.DATABASE_URL),
      frontendHost: safeHost(source.FRONTEND_URL),
      apiHost: safeHost(source.API_BASE_URL),
      discordApplicationId: String(source.DISCORD_CLIENT_ID || "").trim() || null,
      testGuildIds: [PARADISE_TEST_GUILD_ID],
      productionMutationGuard: true
    }),
    outputPolicy: "No secret, raw URL path, cookie, token or database URL is returned."
  });
}

export function assertParadiseEnvironmentReady(source = process.env) {
  const readiness = buildParadiseEnvironmentReadiness(source);
  if (readiness.ready) return readiness;
  const error = new Error("paradise_environment_not_ready");
  error.code = "paradise_environment_not_ready";
  error.readiness = readiness;
  throw error;
}
