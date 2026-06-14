#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.render.com/v1";
const ARTIFACT_DIR = "artifacts/security-v1.0.130";
const LOW_RISK_ALLOWLIST = new Set(["ADMIN_SESSION_VERSION", "ADMIN_SESSION_REVOKED_BEFORE"]);
const KEYRING_REQUIRED = new Set([
  "JWT_SECRET",
  "COOKIE_SECRET",
  "SESSION_SECRET",
  "AUTH_SECRET",
  "ENTITLEMENT_SIGNING_SECRET",
  "DOWNLOAD_SIGNING_SECRET",
  "UPDATE_MANIFEST_SIGNING_SECRET"
]);
const PROVIDER_MANUAL = new Set([
  "STRIPE_SECRET_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_AGENT_API_KEY",
  "STRIPE_AGENT_TEST_API_KEY",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_SECRET",
  "ROBLOX_CLIENT_SECRET",
  "SMTP_PASS",
  "GITHUB_TOKEN",
  "RENDER_API_KEY",
  "OPENAI_API_KEY"
]);
const NEVER_ROTATE = new Set(["DATABASE_URL", "APP_ENCRYPTION_KEY"]);

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.code || "safe_rotation_failed", message: error.message, valuesPrinted: false }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const keys = options.keys;
  if (!keys.length) throw publicError("missing_keys", "Pass --keys KEY1,KEY2. Default mode is dry-run.");
  const refused = keys.filter((key) => !LOW_RISK_ALLOWLIST.has(key));
  const resultBase = {
    createdAt: new Date().toISOString(),
    script: "render-rotate-safe-secrets",
    dryRun: !options.confirm,
    confirmRequiredForWrites: true,
    valuesPrinted: false,
    requestedKeys: keys,
    refusedKeys: refused.map((key) => ({ key, reason: refusalReason(key) })),
    changedKeys: [],
    backupRedactsValues: true
  };
  if (refused.length) {
    const result = { ...resultBase, success: false, blocked: true };
    writeArtifact("render-rotate-safe-secrets-latest.json", result);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  const apiKey = requireEnv("RENDER_API_KEY");
  const serviceId = requireEnv("RENDER_SERVICE_ID");
  const planned = Object.fromEntries(keys.map((key) => [key, nextValue(key)]));
  const backup = {
    createdAt: new Date().toISOString(),
    serviceIdMasked: maskId(serviceId),
    keys,
    valueHashesBefore: {},
    valuesPrinted: false
  };
  for (const key of keys) {
    const current = await fetchOne({ apiKey, serviceId, key });
    backup.valueHashesBefore[key] = current.exists ? hash(current.value) : null;
  }
  writeArtifact(`render-env-rotation-backup-${timestamp()}.json`, backup);

  if (!options.confirm) {
    const result = {
      ...resultBase,
      success: true,
      serviceIdMasked: maskId(serviceId),
      plannedChanges: keys.map((key) => ({ key, oldState: backup.valueHashesBefore[key] ? "set" : "missing", newState: "set" })),
      deployNeeded: true
    };
    writeArtifact("render-rotate-safe-secrets-latest.json", result);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const [key, value] of Object.entries(planned)) {
    await putOne({ apiKey, serviceId, key, value });
  }
  const deploy = await triggerDeploy({ apiKey, serviceId });
  const result = {
    ...resultBase,
    dryRun: false,
    success: true,
    changedKeys: keys,
    deploy,
    valuesPrinted: false
  };
  writeArtifact("render-rotate-safe-secrets-latest.json", result);
  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args) {
  const options = { keys: [], confirm: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--confirm") options.confirm = true;
    if (arg === "--keys") options.keys = String(args[index + 1] || "").split(",").map((key) => key.trim()).filter(Boolean);
    if (arg.startsWith("--keys=")) options.keys = arg.slice("--keys=".length).split(",").map((key) => key.trim()).filter(Boolean);
  }
  return options;
}

function nextValue(key) {
  if (key === "ADMIN_SESSION_REVOKED_BEFORE") return new Date().toISOString();
  if (key === "ADMIN_SESSION_VERSION") return `admin-session-${new Date().toISOString()}-${crypto.randomBytes(8).toString("hex")}`;
  throw publicError("not_allowlisted", `${key} is not low-risk auto-rotatable.`);
}

async function fetchOne({ apiKey, serviceId, key }) {
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return { key, exists: false, value: "" };
  if (!response.ok) throw publicError("render_env_fetch_failed", renderError(body, response.status));
  const raw = body.envVar || body;
  return { key, exists: true, value: String(raw.value ?? "") };
}

async function putOne({ apiKey, serviceId, key, value }) {
  if (!LOW_RISK_ALLOWLIST.has(key)) throw publicError("not_allowlisted", `${key} is not allowed.`);
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ value })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw publicError("render_env_write_failed", renderError(body, response.status));
}

async function triggerDeploy({ apiKey, serviceId }) {
  const hook = String(process.env.FIMA_RENDER_DEPLOY_HOOK || process.env.RENDER_DEPLOY_HOOK_URL || "").trim();
  if (hook) {
    const response = await fetch(hook, { method: "POST" });
    return { attempted: true, triggered: response.ok, status: response.status, method: "deploy_hook", hookValuePrinted: false };
  }
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ clearCache: "do_not_clear" })
  });
  return { attempted: true, triggered: response.ok, status: response.status, method: "render_api_deploy", hookValuePrinted: false };
}

function refusalReason(key) {
  if (KEYRING_REQUIRED.has(key)) return "requires current+previous key-ring/grace support before rotation";
  if (PROVIDER_MANUAL.has(key)) return "rotate in provider dashboard first, then update Render";
  if (NEVER_ROTATE.has(key)) return "never auto-rotate without a tested migration/restore process";
  return "not in low-risk auto-rotation allowlist";
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw publicError("missing_env", `Missing required env: ${name}`);
  return value;
}

function writeArtifact(name, data) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function maskId(value) {
  const text = String(value || "");
  return text.length > 8 ? `${text.slice(0, 4)}***${text.slice(-4)}` : "***";
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function renderError(body, status) {
  return body?.message || body?.error || `Render API returned ${status}`;
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
