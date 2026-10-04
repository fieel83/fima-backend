import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FT_COMMUNITY_RELEASE_ENV_NAMES,
  inspectFtCommunityReleaseAttestation
} from "./ftCommunityReleaseAttestation.js";

const SHA256 = /^[a-f0-9]{64}$/iu;
const DISCORD_ID = /^\d{17,20}$/u;
const PRODUCTION_GUILD_ID = "1419335632324657306";
const TEST_GUILD_ID = "1520519015661961257";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const REVIEWED_ASSET_MANIFEST = path.join(
  REPOSITORY_ROOT,
  "public",
  "assets",
  "images",
  "discord",
  "v5",
  "discord-asset-manifest-v5.json"
);

const PROFILE_ASSET_REQUIREMENTS = Object.freeze([
  Object.freeze({
    id: "fima-bot-avatar",
    rootName: "FIMA_BOT_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord/v5",
    assetName: "FIMA_BOT_PROFILE_AVATAR_ASSET",
    asset: "fima-bot-avatar-v5.png",
    digestName: "FIMA_BOT_PROFILE_AVATAR_SHA256"
  }),
  Object.freeze({
    id: "fima-bot-profile-banner",
    rootName: "FIMA_BOT_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord/v5",
    assetName: "FIMA_BOT_PROFILE_BANNER_ASSET",
    asset: "fima-bot-profile-banner-v5.png",
    digestName: "FIMA_BOT_PROFILE_BANNER_SHA256"
  }),
  Object.freeze({
    id: "ft-community-server-icon",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_ICON_ASSET",
    asset: "v5/ft-community-server-icon-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_ICON_SHA256"
  }),
  Object.freeze({
    id: "ft-community-server-banner",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_BANNER_ASSET",
    asset: "v5/ft-community-server-banner-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_BANNER_SHA256"
  }),
  Object.freeze({
    id: "ft-community-invite-splash",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_SPLASH_ASSET",
    asset: "v5/ft-community-invite-splash-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_SPLASH_SHA256"
  })
]);

export const FT_COMMUNITY_DEPLOYMENT_ENV_NAMES = Object.freeze({
  release: FT_COMMUNITY_RELEASE_ENV_NAMES,
  mutation: Object.freeze([
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "FIMA_OWNER_DISCORD_ID",
    "FIMA_OWNER_PROOF_SECRET",
    "PARADISE_REHEARSAL_EVIDENCE_SECRET",
    "PARADISE_PRODUCTION_REBUILD_PLAN_SECRET",
    "FIEELS_COMMUNITY_GUILD_ID",
    "DISCORD_GUILD_ID"
  ]),
  botProfile: Object.freeze([
    "FIMA_BOT_PROFILE_SYNC_ENABLED",
    "FIMA_BOT_EXPECTED_APPLICATION_ID",
    "FIMA_BOT_PROFILE_OWNER_USER_ID",
    "FIMA_BOT_PROFILE_GUILD_IDS",
    "FIMA_BOT_PROFILE_ASSET_ROOT",
    "FIMA_BOT_PROFILE_AVATAR_ASSET",
    "FIMA_BOT_PROFILE_AVATAR_SHA256",
    "FIMA_BOT_PROFILE_BANNER_ASSET",
    "FIMA_BOT_PROFILE_BANNER_SHA256"
  ]),
  communityProfile: Object.freeze([
    "FT_COMMUNITY_PROFILE_SYNC_ENABLED",
    "FT_COMMUNITY_PROFILE_GUILD_ID",
    "FT_COMMUNITY_PROFILE_OWNER_USER_ID",
    "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    "FT_COMMUNITY_PROFILE_ICON_ASSET",
    "FT_COMMUNITY_PROFILE_ICON_SHA256",
    "FT_COMMUNITY_PROFILE_BANNER_ASSET",
    "FT_COMMUNITY_PROFILE_BANNER_SHA256",
    "FT_COMMUNITY_PROFILE_SPLASH_ASSET",
    "FT_COMMUNITY_PROFILE_SPLASH_SHA256"
  ])
});

const ALL_REQUIRED = Object.freeze(Object.values(FT_COMMUNITY_DEPLOYMENT_ENV_NAMES).flat());

function clean(value) {
  return String(value ?? "").trim();
}

function isTrue(value) {
  return clean(value).toLowerCase() === "true";
}

function guildIds(value) {
  return new Set(clean(value).split(/[\s,]+/u).map(clean).filter(Boolean));
}

function repositoryAssetPath(manifestPath) {
  const normalized = clean(manifestPath).replaceAll("\\", "/");
  if (!normalized.startsWith("/assets/")) return "";
  return `public${normalized}`;
}

/**
 * Loads the reviewed v5 manifest and verifies every profile asset against its
 * actual repository file. The result is an internal input to readiness only;
 * public readiness output never exposes paths or digests.
 */
export function loadFtCommunityReviewedAssetBindings({
  readFileSync = fs.readFileSync,
  manifestPath = REVIEWED_ASSET_MANIFEST
} = {}) {
  const failed = () => Object.freeze(Object.fromEntries(
    PROFILE_ASSET_REQUIREMENTS.map(requirement => [requirement.id, Object.freeze({ ready: false })])
  ));
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest?.assetVersion !== "v5"
      || manifest?.liveMutationApproved !== true
      || !Array.isArray(manifest.assets)) {
      return failed();
    }
    const bindings = {};
    for (const requirement of PROFILE_ASSET_REQUIREMENTS) {
      const matches = manifest.assets.filter(asset => clean(asset?.id) === requirement.id);
      if (matches.length !== 1) return failed();
      const entry = matches[0];
      const expectedRepositoryPath = `${requirement.root}/${requirement.asset}`;
      const manifestRepositoryPath = repositoryAssetPath(entry.path);
      const digest = clean(entry.sha256).toLowerCase();
      if (manifestRepositoryPath !== expectedRepositoryPath || !SHA256.test(digest)) {
        return failed();
      }
      const bytes = readFileSync(path.join(REPOSITORY_ROOT, ...expectedRepositoryPath.split("/")));
      const actualDigest = createHash("sha256").update(bytes).digest("hex");
      const exactByteCount = Number.isSafeInteger(entry.bytes) && entry.bytes === bytes.length;
      bindings[requirement.id] = Object.freeze({
        ready: exactByteCount && actualDigest === digest,
        digest
      });
    }
    return Object.freeze(bindings);
  } catch {
    return failed();
  }
}

/**
 * Names-only deployment readiness. Environment values, tokens, URLs and
 * fingerprints are deliberately never included in the returned object.
 */
export function buildFtCommunityDeploymentReadiness(source = process.env) {
  // Deliberately load the canonical repository manifest here. Accepting a
  // caller-provided "reviewed" binding would let a synthetic ready:true object
  // bypass the file/hash/byte verification on the production readiness path.
  const reviewedAssets = loadFtCommunityReviewedAssetBindings();
  const releaseAttestation = inspectFtCommunityReleaseAttestation(source);
  const missing = ALL_REQUIRED.filter(name => !clean(source?.[name]));
  const invalid = [];
  const invalidate = (name, condition) => {
    if (!missing.includes(name) && !condition) invalid.push(name);
  };

  for (const name of releaseAttestation.invalid) invalidate(name, false);

  invalidate("FIMA_OWNER_DISCORD_ID", DISCORD_ID.test(clean(source.FIMA_OWNER_DISCORD_ID)));
  invalidate("DISCORD_CLIENT_ID", DISCORD_ID.test(clean(source.DISCORD_CLIENT_ID)));
  invalidate("FIMA_OWNER_PROOF_SECRET", Buffer.byteLength(clean(source.FIMA_OWNER_PROOF_SECRET), "utf8") >= 32);
  invalidate("PARADISE_REHEARSAL_EVIDENCE_SECRET", Buffer.byteLength(clean(source.PARADISE_REHEARSAL_EVIDENCE_SECRET), "utf8") >= 32);
  invalidate("PARADISE_PRODUCTION_REBUILD_PLAN_SECRET", Buffer.byteLength(clean(source.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET), "utf8") >= 32);
  invalidate("FIEELS_COMMUNITY_GUILD_ID", clean(source.FIEELS_COMMUNITY_GUILD_ID) === PRODUCTION_GUILD_ID);
  invalidate("DISCORD_GUILD_ID", clean(source.DISCORD_GUILD_ID) === PRODUCTION_GUILD_ID);
  invalidate("FIMA_BOT_PROFILE_SYNC_ENABLED", isTrue(source.FIMA_BOT_PROFILE_SYNC_ENABLED));
  invalidate(
    "FIMA_BOT_EXPECTED_APPLICATION_ID",
    DISCORD_ID.test(clean(source.FIMA_BOT_EXPECTED_APPLICATION_ID))
      && clean(source.FIMA_BOT_EXPECTED_APPLICATION_ID) === clean(source.DISCORD_CLIENT_ID)
  );
  invalidate("FT_COMMUNITY_PROFILE_SYNC_ENABLED", isTrue(source.FT_COMMUNITY_PROFILE_SYNC_ENABLED));
  invalidate("FT_COMMUNITY_PROFILE_GUILD_ID", clean(source.FT_COMMUNITY_PROFILE_GUILD_ID) === PRODUCTION_GUILD_ID);

  const configuredBotGuildIds = guildIds(source.FIMA_BOT_PROFILE_GUILD_IDS);
  invalidate(
    "FIMA_BOT_PROFILE_GUILD_IDS",
    configuredBotGuildIds.size === 2
      && configuredBotGuildIds.has(PRODUCTION_GUILD_ID)
      && configuredBotGuildIds.has(TEST_GUILD_ID)
  );
  invalidate(
    "FIMA_BOT_PROFILE_OWNER_USER_ID",
    clean(source.FIMA_BOT_PROFILE_OWNER_USER_ID) === clean(source.FIMA_OWNER_DISCORD_ID)
  );
  invalidate(
    "FT_COMMUNITY_PROFILE_OWNER_USER_ID",
    clean(source.FT_COMMUNITY_PROFILE_OWNER_USER_ID) === clean(source.FIMA_OWNER_DISCORD_ID)
  );
  for (const requirement of PROFILE_ASSET_REQUIREMENTS) {
    const reviewed = reviewedAssets?.[requirement.id];
    invalidate(requirement.rootName, clean(source[requirement.rootName]) === requirement.root);
    invalidate(requirement.assetName, clean(source[requirement.assetName]) === requirement.asset);
    invalidate(
      requirement.digestName,
      reviewed?.ready === true
        && SHA256.test(clean(source[requirement.digestName]))
        && clean(source[requirement.digestName]).toLowerCase() === reviewed.digest
    );
  }

  const configured = ALL_REQUIRED.filter(name => !missing.includes(name) && !invalid.includes(name));
  return Object.freeze({
    schemaVersion: 1,
    ready: missing.length === 0 && invalid.length === 0,
    requiredCount: ALL_REQUIRED.length,
    configured: Object.freeze(configured),
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    outputPolicy: "Only environment variable names and readiness states are returned; values are never returned."
  });
}
