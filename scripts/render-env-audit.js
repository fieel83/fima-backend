#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const API_BASE = "https://api.render.com/v1";
const ARTIFACT_DIR = "artifacts/security-v1.0.130";
const CATEGORIES = {
  auto_low_risk: ["ADMIN_SESSION_VERSION", "ADMIN_SESSION_REVOKED_BEFORE"],
  keyring_required: [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "SESSION_SECRET",
    "AUTH_SECRET",
    "ENTITLEMENT_SIGNING_SECRET",
    "DOWNLOAD_SIGNING_SECRET",
    "UPDATE_MANIFEST_SIGNING_SECRET"
  ],
  provider_manual: [
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
  ],
  never_auto_rotate: ["DATABASE_URL", "APP_ENCRYPTION_KEY"]
};

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.code || "render_env_audit_failed", message: error.message, valuesPrinted: false }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const apiKey = requireEnv("RENDER_API_KEY");
  const serviceId = requireEnv("RENDER_SERVICE_ID");
  const rows = await fetchEnvVars({ apiKey, serviceId });
  const names = rows.map((row) => row.key).sort();
  const result = {
    createdAt: new Date().toISOString(),
    script: "render-env-audit",
    serviceIdMasked: maskId(serviceId),
    dryRun: true,
    valuesPrinted: false,
    envCount: names.length,
    envNameHash: hash(names.join("\n")),
    categories: Object.fromEntries(Object.entries(CATEGORIES).map(([category, keys]) => [
      category,
      keys.map((key) => ({ key, present: names.includes(key) }))
    ])),
    unknownKeys: names.filter((key) => !Object.values(CATEGORIES).flat().includes(key)),
    restoreNote: "This audit stores key names and presence metadata only. It does not contain env values."
  };
  writeArtifact("render-env-audit-latest.json", result);
  console.log(JSON.stringify(result, null, 2));
}

async function fetchEnvVars({ apiKey, serviceId }) {
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/env-vars`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw publicError("render_env_fetch_failed", renderError(body, response.status));
  const list = Array.isArray(body) ? body : body.envVars || body.env_vars || body.results || [];
  return list.map((item) => item.envVar || item)
    .map((item) => ({ key: String(item.key || "").trim() }))
    .filter((item) => item.key);
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
