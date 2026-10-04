import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const discordSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");
const syncSource = fs.readFileSync(new URL("../src/ftCommunityProfileSync.js", import.meta.url), "utf8");
const envExampleSource = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");

function routeBlock(method, path, nextPath) {
  const start = serverSource.indexOf(`app.${method}("${path}"`);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${path} route missing`);
  const end = serverSource.indexOf(`app.${nextPath.method}("${nextPath.path}"`, start + 1);
  assert.notEqual(end, -1, `route boundary after ${method.toUpperCase()} ${path} missing`);
  return serverSource.slice(start, end);
}

test("FT Community profile routes separate read-only status from guarded apply", () => {
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/actions\/ft-community-profile", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/ft-community-profile", requireUser, requireParadiseOwner/);

  const applyRoute = routeBlock("post", "/api/fima-bot/actions/ft-community-profile", {
    method: "post",
    path: "/api/fima-bot/actions/rebuild-fima-community/preflight"
  });
  assert.match(applyRoute, /x-paradise-owner-action/);
  assert.match(applyRoute, /isTrustedParadiseOrigin/);
  assert.match(applyRoute, /verifyOwnerFreshProof/);
  assert.match(applyRoute, /fresh_owner_proof_required/);
  assert.match(applyRoute, /const dryRun = req\.body\?\.apply !== true/);
  assert.match(applyRoute, /req\.paradiseOwnerDiscord\?\.providerSubject/);
  assert.match(applyRoute, /confirmation: String\(req\.body\?\.confirmation/);
});

test("Discord bridge keeps status non-mutating and preserves digest idempotency", () => {
  assert.match(discordSource, /export async function ftCommunityProfileSyncStatus\(\)/);
  assert.match(discordSource, /inspectFtCommunityProfileSync\(client/);
  assert.match(discordSource, /export async function applyFtCommunityProfileFromDashboard/);
  assert.match(discordSource, /applyFtCommunityProfileSync\(client/);
  assert.match(discordSource, /previousAssetDigests: ftCommunityProfileAssetDigests/);
  assert.match(discordSource, /ftCommunityProfileAssetDigests = Object\.freeze/);
  assert.match(discordSource, /splash: result\.assetDigests\.splash \|\| null/);
});

test("profile sync keeps immutable production and test guild allowlist", () => {
  assert.match(syncSource, /FT_COMMUNITY_PRODUCTION_GUILD_ID = "1419335632324657306"/);
  assert.match(syncSource, /FT_COMMUNITY_TEST_GUILD_ID = "1520519015661961257"/);
  assert.match(syncSource, /FT_COMMUNITY_PROFILE_ALLOWED_GUILD_IDS\.includes\(targetGuildId\)/);
  assert.match(syncSource, /exactGuildScope/);
});

test("deployment example remains disabled and requires reviewed asset digests", () => {
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_SYNC_ENABLED=false$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_GUILD_ID=$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_OWNER_USER_ID=$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_ICON_ASSET=v5\/ft-community-server-icon-v5\.png$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_ICON_SHA256=$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_BANNER_ASSET=v5\/ft-community-server-banner-v5\.png$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_BANNER_SHA256=$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_SPLASH_ASSET=v5\/ft-community-invite-splash-v5\.png$/m);
  assert.match(envExampleSource, /^FT_COMMUNITY_PROFILE_SPLASH_SHA256=$/m);
});
