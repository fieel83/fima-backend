import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildFtCommunityDeploymentReadiness,
  FT_COMMUNITY_DEPLOYMENT_ENV_NAMES,
  loadFtCommunityReviewedAssetBindings
} from "../src/ftCommunityDeploymentReadiness.js";
import { computeFtCommunityReleaseDigest } from "../src/ftCommunityReleaseAttestation.js";

const OWNER_ID = "123456789012345678";
const SECRET = "test-only-secret-material-longer-than-thirty-two-bytes";
const SYNTHETIC_REVIEWED_ASSETS = Object.freeze({
  "fima-bot-avatar": Object.freeze({ ready: true, digest: "a".repeat(64) }),
  "fima-bot-profile-banner": Object.freeze({ ready: true, digest: "b".repeat(64) }),
  "ft-community-server-icon": Object.freeze({ ready: true, digest: "c".repeat(64) }),
  "ft-community-server-banner": Object.freeze({ ready: true, digest: "d".repeat(64) }),
  "ft-community-invite-splash": Object.freeze({ ready: true, digest: "e".repeat(64) })
});
const REVIEWED_ASSETS = loadFtCommunityReviewedAssetBindings();

function readyEnvironment() {
  return {
    RENDER_GIT_COMMIT: "a".repeat(40),
    FT_COMMUNITY_APPROVED_RENDER_COMMIT: "a".repeat(40),
    FT_COMMUNITY_APPROVED_RELEASE_SHA256: computeFtCommunityReleaseDigest(),
    DISCORD_BOT_TOKEN: "never-return-token",
    DISCORD_CLIENT_ID: "987654321098765432",
    FIMA_OWNER_DISCORD_ID: OWNER_ID,
    FIMA_OWNER_PROOF_SECRET: SECRET,
    PARADISE_REHEARSAL_EVIDENCE_SECRET: SECRET,
    PARADISE_PRODUCTION_REBUILD_PLAN_SECRET: SECRET,
    FIEELS_COMMUNITY_GUILD_ID: "1419335632324657306",
    DISCORD_GUILD_ID: "1419335632324657306",
    FIMA_BOT_PROFILE_SYNC_ENABLED: "true",
    FIMA_BOT_EXPECTED_APPLICATION_ID: "987654321098765432",
    FIMA_BOT_PROFILE_OWNER_USER_ID: OWNER_ID,
    FIMA_BOT_PROFILE_GUILD_IDS: "1419335632324657306,1520519015661961257",
    FIMA_BOT_PROFILE_ASSET_ROOT: "public/assets/images/discord/v5",
    FIMA_BOT_PROFILE_AVATAR_ASSET: "fima-bot-avatar-v5.png",
    FIMA_BOT_PROFILE_AVATAR_SHA256: REVIEWED_ASSETS["fima-bot-avatar"].digest,
    FIMA_BOT_PROFILE_BANNER_ASSET: "fima-bot-profile-banner-v5.png",
    FIMA_BOT_PROFILE_BANNER_SHA256: REVIEWED_ASSETS["fima-bot-profile-banner"].digest,
    FT_COMMUNITY_PROFILE_SYNC_ENABLED: "true",
    FT_COMMUNITY_PROFILE_GUILD_ID: "1419335632324657306",
    FT_COMMUNITY_PROFILE_OWNER_USER_ID: OWNER_ID,
    FT_COMMUNITY_PROFILE_ASSET_ROOT: "public/assets/images/discord",
    FT_COMMUNITY_PROFILE_ICON_ASSET: "v5/ft-community-server-icon-v5.png",
    FT_COMMUNITY_PROFILE_ICON_SHA256: REVIEWED_ASSETS["ft-community-server-icon"].digest,
    FT_COMMUNITY_PROFILE_BANNER_ASSET: "v5/ft-community-server-banner-v5.png",
    FT_COMMUNITY_PROFILE_BANNER_SHA256: REVIEWED_ASSETS["ft-community-server-banner"].digest,
    FT_COMMUNITY_PROFILE_SPLASH_ASSET: "v5/ft-community-invite-splash-v5.png",
    FT_COMMUNITY_PROFILE_SPLASH_SHA256: REVIEWED_ASSETS["ft-community-invite-splash"].digest
  };
}

test("FT production readiness returns names and states without environment values", () => {
  const environment = readyEnvironment();
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.requiredCount, Object.values(FT_COMMUNITY_DEPLOYMENT_ENV_NAMES).flat().length);
  const serialized = JSON.stringify(readiness);
  for (const value of [environment.DISCORD_BOT_TOKEN, SECRET, OWNER_ID]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("Discord production readiness does not require an unrelated owner account email", () => {
  const environment = readyEnvironment();
  delete environment.FIMA_OWNER_ACCOUNT_EMAIL;
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.configured.includes("FIMA_OWNER_ACCOUNT_EMAIL"), false);
  assert.equal(readiness.missing.includes("FIMA_OWNER_ACCOUNT_EMAIL"), false);
});

test("missing and invalid FT production configuration fails closed with names-only evidence", () => {
  const environment = readyEnvironment();
  delete environment.DISCORD_BOT_TOKEN;
  environment.FT_COMMUNITY_PROFILE_GUILD_ID = "1520519015661961257";
  environment.FIMA_BOT_PROFILE_AVATAR_SHA256 = "not-a-digest";
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.includes("DISCORD_BOT_TOKEN"));
  assert.ok(readiness.invalid.includes("FT_COMMUNITY_PROFILE_GUILD_ID"));
  assert.ok(readiness.invalid.includes("FIMA_BOT_PROFILE_AVATAR_SHA256"));
  assert.equal(JSON.stringify(readiness).includes("not-a-digest"), false);
});

test("release commit and source digest drift block deployment readiness", () => {
  const environment = readyEnvironment();
  environment.FT_COMMUNITY_APPROVED_RENDER_COMMIT = "b".repeat(40);
  environment.FT_COMMUNITY_APPROVED_RELEASE_SHA256 = "c".repeat(64);
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.invalid.includes("FT_COMMUNITY_APPROVED_RENDER_COMMIT"));
  assert.ok(readiness.invalid.includes("FT_COMMUNITY_APPROVED_RELEASE_SHA256"));
  assert.equal(JSON.stringify(readiness).includes(environment.FT_COMMUNITY_APPROVED_RENDER_COMMIT), false);
});

test("bot application binding must match the validated Discord client id", () => {
  const environment = readyEnvironment();
  environment.FIMA_BOT_EXPECTED_APPLICATION_ID = "111111111111111111";
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.invalid.includes("FIMA_BOT_EXPECTED_APPLICATION_ID"));
  assert.equal(JSON.stringify(readiness).includes(environment.FIMA_BOT_EXPECTED_APPLICATION_ID), false);
});

test("bot profile guild scope is exactly the production and test guilds", () => {
  const acceptedEnvironment = readyEnvironment();
  acceptedEnvironment.FIMA_BOT_PROFILE_GUILD_IDS =
    "1520519015661961257 1419335632324657306 1419335632324657306";
  assert.equal(buildFtCommunityDeploymentReadiness(acceptedEnvironment).ready, true);

  const environment = readyEnvironment();
  environment.FIMA_BOT_PROFILE_GUILD_IDS += ",111111111111111111";
  const readiness = buildFtCommunityDeploymentReadiness(environment);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.invalid.includes("FIMA_BOT_PROFILE_GUILD_IDS"));
  assert.equal(JSON.stringify(readiness).includes("111111111111111111"), false);
});

test("profile roots, filenames and reviewed digests cannot be swapped", () => {
  const cases = [
    ["FIMA_BOT_PROFILE_ASSET_ROOT", "public/assets/images/discord"],
    ["FIMA_BOT_PROFILE_AVATAR_ASSET", "fima-bot-profile-banner-v5.png"],
    ["FIMA_BOT_PROFILE_AVATAR_SHA256", REVIEWED_ASSETS["fima-bot-profile-banner"].digest],
    ["FT_COMMUNITY_PROFILE_BANNER_ASSET", "v5/ft-community-server-icon-v5.png"],
    ["FT_COMMUNITY_PROFILE_BANNER_SHA256", REVIEWED_ASSETS["ft-community-server-icon"].digest]
  ];
  for (const [name, value] of cases) {
    const environment = readyEnvironment();
    environment[name] = value;
    const readiness = buildFtCommunityDeploymentReadiness(environment);
    assert.equal(readiness.ready, false, name);
    assert.ok(readiness.invalid.includes(name), name);
    assert.equal(JSON.stringify(readiness).includes(value), false, name);
  }
});

test("repository v5 manifest is approved and exactly matches profile asset files", () => {
  const reviewedAssets = loadFtCommunityReviewedAssetBindings();
  assert.equal(Object.values(reviewedAssets).every(asset => asset.ready), true);
  const environment = readyEnvironment();
  for (const [id, reviewed] of Object.entries(reviewedAssets)) {
    if (id === "fima-bot-avatar") environment.FIMA_BOT_PROFILE_AVATAR_SHA256 = reviewed.digest;
    if (id === "fima-bot-profile-banner") environment.FIMA_BOT_PROFILE_BANNER_SHA256 = reviewed.digest;
    if (id === "ft-community-server-icon") environment.FT_COMMUNITY_PROFILE_ICON_SHA256 = reviewed.digest;
    if (id === "ft-community-server-banner") environment.FT_COMMUNITY_PROFILE_BANNER_SHA256 = reviewed.digest;
    if (id === "ft-community-invite-splash") environment.FT_COMMUNITY_PROFILE_SPLASH_SHA256 = reviewed.digest;
  }
  assert.equal(buildFtCommunityDeploymentReadiness(environment).ready, true);
});

test("synthetic ready asset bindings cannot bypass canonical repository verification", () => {
  const environment = readyEnvironment();
  for (const [id, reviewed] of Object.entries(SYNTHETIC_REVIEWED_ASSETS)) {
    if (id === "fima-bot-avatar") environment.FIMA_BOT_PROFILE_AVATAR_SHA256 = reviewed.digest;
    if (id === "fima-bot-profile-banner") environment.FIMA_BOT_PROFILE_BANNER_SHA256 = reviewed.digest;
    if (id === "ft-community-server-icon") environment.FT_COMMUNITY_PROFILE_ICON_SHA256 = reviewed.digest;
    if (id === "ft-community-server-banner") environment.FT_COMMUNITY_PROFILE_BANNER_SHA256 = reviewed.digest;
    if (id === "ft-community-invite-splash") environment.FT_COMMUNITY_PROFILE_SPLASH_SHA256 = reviewed.digest;
  }
  const readiness = buildFtCommunityDeploymentReadiness(environment, {
    reviewedAssets: SYNTHETIC_REVIEWED_ASSETS
  });
  assert.equal(readiness.ready, false);
  assert.equal(
    readiness.invalid.filter(name => name.endsWith("_SHA256")).length,
    Object.keys(SYNTHETIC_REVIEWED_ASSETS).length
  );
});

test("reviewed manifest rejects changed approval, id, path, byte count and digest", () => {
  const manifestPath = "fixture-manifest-v5.json";
  const canonicalManifest = JSON.parse(fs.readFileSync(
    new URL("../public/assets/images/discord/v5/discord-asset-manifest-v5.json", import.meta.url),
    "utf8"
  ));
  const cases = [
    manifest => { manifest.liveMutationApproved = false; },
    manifest => { manifest.assets[0].id = "unexpected-asset"; },
    manifest => { manifest.assets[0].path = "/assets/images/discord/v5/other.png"; },
    manifest => { manifest.assets[0].bytes += 1; },
    manifest => { manifest.assets[0].sha256 = "f".repeat(64); }
  ];
  for (const mutate of cases) {
    const manifest = structuredClone(canonicalManifest);
    mutate(manifest);
    const reviewed = loadFtCommunityReviewedAssetBindings({
      manifestPath,
      readFileSync(filePath, encoding) {
        if (filePath === manifestPath) return JSON.stringify(manifest);
        return fs.readFileSync(filePath, encoding);
      }
    });
    assert.equal(reviewed["ft-community-server-icon"].ready, false);
  }
});
