import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const discordSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("FIMA Bot profile exposes read-only status and a separately guarded apply route", () => {
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/actions\/fima-bot-profile", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/fima-bot-profile", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /x-paradise-owner-action/);
  assert.match(serverSource, /fresh_owner_proof_required/);
  assert.match(serverSource, /verifyOwnerFreshProof/);
  assert.match(serverSource, /const dryRun = req\.body\?\.apply !== true/);
});

test("Discord runtime bridge keeps status non-mutating and passes exact owner authorization to apply", () => {
  assert.match(discordSource, /export async function fimaBotProfileSyncStatus\(\)/);
  assert.match(discordSource, /inspectFimaBotProfileSync\(client/);
  assert.match(discordSource, /export async function applyFimaBotProfileFromDashboard/);
  assert.match(discordSource, /ownerVerified: Boolean\(String\(ownerDiscordId/);
  assert.match(discordSource, /previousAssetDigests: fimaBotProfileAssetDigests/);
});

test("Discord readiness reports the owner-vault blocker without exposing credential material", () => {
  assert.match(discordSource, /function discordCredentialStatus\(\)/);
  assert.match(discordSource, /source: "owner-vault-runtime"/);
  assert.match(discordSource, /owner_vault_runtime_injection_required/);
  assert.match(discordSource, /secretPolicy: "token_value_never_exposed"/);
  assert.match(discordSource, /credential,\s*\n\s*guildConfigured/);
  assert.doesNotMatch(discordSource, /credential\.token/);
  assert.doesNotMatch(discordSource, /credential\.secret/);
});
