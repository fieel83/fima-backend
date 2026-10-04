import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createFtCommunityManifestProfileAssets } from "./ftCommunityVisualAssets.js";

export const FT_COMMUNITY_PRODUCTION_GUILD_ID = "1419335632324657306";
export const FT_COMMUNITY_TEST_GUILD_ID = "1520519015661961257";
export const FT_COMMUNITY_PROFILE_ALLOWED_GUILD_IDS = Object.freeze([
  FT_COMMUNITY_PRODUCTION_GUILD_ID,
  FT_COMMUNITY_TEST_GUILD_ID
]);

const MAX_GUILD_PROFILE_ASSET_BYTES = 10 * 1024 * 1024;
const ASSET_FORMAT_BY_EXTENSION = Object.freeze({
  ".gif": "gif",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".png": "png",
  ".webp": "webp"
});
const SHA256 = /^[a-f0-9]{64}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function profileError(code) {
  return Object.assign(new Error(code), { code });
}

function normalizedDigest(value) {
  return clean(value).toLowerCase();
}

function equalText(left, right) {
  const leftBytes = Buffer.from(clean(left));
  const rightBytes = Buffer.from(clean(right));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function ftCommunityProfileConfirmation(guildId) {
  const targetGuildId = clean(guildId);
  if (targetGuildId === FT_COMMUNITY_PRODUCTION_GUILD_ID) {
    return `APPLY FT COMMUNITY PROFILE ${FT_COMMUNITY_PRODUCTION_GUILD_ID}`;
  }
  if (targetGuildId === FT_COMMUNITY_TEST_GUILD_ID) {
    return `APPLY FT TEST PROFILE ${FT_COMMUNITY_TEST_GUILD_ID}`;
  }
  return null;
}

export function ftCommunityProfileConfigFromEnv(env = process.env) {
  const manifestAssets = createFtCommunityManifestProfileAssets();
  return Object.freeze({
    applyEnabled: clean(env.FT_COMMUNITY_PROFILE_SYNC_ENABLED).toLowerCase() === "true",
    targetGuildId: clean(env.FT_COMMUNITY_PROFILE_GUILD_ID),
    expectedOwnerUserId: clean(env.FT_COMMUNITY_PROFILE_OWNER_USER_ID),
    assetRoot: manifestAssets.assetRoot,
    iconAsset: manifestAssets.guild.icon.asset,
    iconSha256: manifestAssets.guild.icon.sha256,
    bannerAsset: manifestAssets.guild.banner.asset,
    bannerSha256: manifestAssets.guild.banner.sha256,
    splashAsset: manifestAssets.guild.splash.asset,
    splashSha256: manifestAssets.guild.splash.sha256
  });
}

function detectedAssetFormat(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.length >= 6) {
    const header = bytes.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") return "gif";
  }
  if (bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  return null;
}

function publicAssetStatus(asset) {
  return Object.freeze({
    configured: asset.configured,
    ready: asset.ready,
    bytes: asset.bytes,
    digest: asset.digest,
    format: asset.format,
    reason: asset.reason
  });
}

async function inspectAsset({ assetRoot, configuredAsset, expectedSha256 }) {
  const configured = Boolean(clean(configuredAsset) || clean(expectedSha256));
  try {
    if (!clean(configuredAsset)) throw profileError("guild_profile_asset_path_required");
    if (!clean(assetRoot)) throw profileError("guild_profile_asset_root_required");

    const expectedDigest = normalizedDigest(expectedSha256);
    if (!SHA256.test(expectedDigest)) throw profileError("guild_profile_asset_digest_required");

    const requestedExtension = path.extname(configuredAsset).toLowerCase();
    const expectedFormat = ASSET_FORMAT_BY_EXTENSION[requestedExtension];
    if (!expectedFormat) throw profileError("guild_profile_asset_type_not_allowed");

    const resolvedRoot = path.resolve(assetRoot);
    const requestedPath = path.resolve(resolvedRoot, configuredAsset);
    const requestedRelative = path.relative(resolvedRoot, requestedPath);
    if (!requestedRelative || requestedRelative.startsWith("..") || path.isAbsolute(requestedRelative)) {
      throw profileError("guild_profile_asset_outside_root");
    }

    const [realRoot, realAssetPath] = await Promise.all([
      fs.realpath(resolvedRoot),
      fs.realpath(requestedPath)
    ]);
    const realRelative = path.relative(realRoot, realAssetPath);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw profileError("guild_profile_asset_outside_root");
    }

    const stat = await fs.stat(realAssetPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_GUILD_PROFILE_ASSET_BYTES) {
      throw profileError("guild_profile_asset_size_invalid");
    }
    const bytes = await fs.readFile(realAssetPath);
    if (bytes.length <= 0 || bytes.length > MAX_GUILD_PROFILE_ASSET_BYTES) {
      throw profileError("guild_profile_asset_size_invalid");
    }
    const format = detectedAssetFormat(bytes);
    if (!format || format !== expectedFormat) throw profileError("guild_profile_asset_format_invalid");

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (!equalText(digest, expectedDigest)) throw profileError("guild_profile_asset_digest_mismatch");

    return Object.freeze({
      configured: true,
      ready: true,
      bytes: bytes.length,
      digest,
      format,
      reason: null,
      filePath: realAssetPath
    });
  } catch (error) {
    return Object.freeze({
      configured,
      ready: false,
      bytes: 0,
      digest: null,
      format: null,
      reason: error?.code === "ENOENT" ? "guild_profile_asset_missing" : clean(error?.code || error?.message) || "guild_profile_asset_invalid",
      filePath: null
    });
  }
}

async function inspectFtCommunityProfileSyncInternal(client, {
  config = ftCommunityProfileConfigFromEnv(),
  previousAssetDigests = {}
} = {}) {
  const targetGuildId = clean(config.targetGuildId);
  const allowed = FT_COMMUNITY_PROFILE_ALLOWED_GUILD_IDS.includes(targetGuildId);
  const guild = allowed ? client?.guilds?.cache?.get?.(targetGuildId) : null;
  const exactGuild = Boolean(guild) && clean(guild?.id) === targetGuildId;
  const icon = await inspectAsset({
    assetRoot: config.assetRoot,
    configuredAsset: config.iconAsset,
    expectedSha256: config.iconSha256
  });
  const banner = await inspectAsset({
    assetRoot: config.assetRoot,
    configuredAsset: config.bannerAsset,
    expectedSha256: config.bannerSha256
  });
  const splashConfigured = Boolean(clean(config.splashAsset) || clean(config.splashSha256));
  const splash = splashConfigured
    ? await inspectAsset({
      assetRoot: config.assetRoot,
      configuredAsset: config.splashAsset,
      expectedSha256: config.splashSha256
    })
    : Object.freeze({
      configured: false,
      ready: true,
      bytes: 0,
      digest: null,
      format: null,
      reason: null,
      filePath: null
    });
  const mutationMethodsReady = typeof guild?.setIcon === "function"
    && typeof guild?.setBanner === "function"
    && (!splashConfigured || typeof guild?.setSplash === "function");
  const assetsReady = icon.ready && banner.ready && (!splashConfigured || splash.ready);
  const exactGuildScope = allowed && exactGuild;
  const iconNeedsUpdate = icon.ready && icon.digest !== normalizedDigest(previousAssetDigests.icon);
  const bannerNeedsUpdate = banner.ready && banner.digest !== normalizedDigest(previousAssetDigests.banner);
  const splashNeedsUpdate = splashConfigured
    && splash.ready
    && splash.digest !== normalizedDigest(previousAssetDigests.splash);

  return Object.freeze({
    applyEnabled: config.applyEnabled === true,
    targetGuildId,
    targetKind: targetGuildId === FT_COMMUNITY_PRODUCTION_GUILD_ID
      ? "production"
      : targetGuildId === FT_COMMUNITY_TEST_GUILD_ID ? "test" : "untrusted",
    productionGuildIdImmutable: FT_COMMUNITY_PRODUCTION_GUILD_ID,
    exactGuildScope,
    mutationMethodsReady,
    assetsReady,
    scopeReady: exactGuildScope && mutationMethodsReady && assetsReady,
    requiredConfirmation: ftCommunityProfileConfirmation(targetGuildId),
    icon: publicAssetStatus(icon),
    banner: publicAssetStatus(banner),
    splash: publicAssetStatus(splash),
    iconNeedsUpdate,
    bannerNeedsUpdate,
    splashNeedsUpdate,
    _private: Object.freeze({ config, guild, icon, banner, splash })
  });
}

export async function inspectFtCommunityProfileSync(client, options = {}) {
  const { _private, ...status } = await inspectFtCommunityProfileSyncInternal(client, options);
  return Object.freeze(status);
}

function assertOwnerAuthorization(status, authorization) {
  const expectedOwnerUserId = clean(status._private.config.expectedOwnerUserId);
  if (!expectedOwnerUserId
    || authorization?.ownerVerified !== true
    || !equalText(authorization?.actorUserId, expectedOwnerUserId)) {
    throw profileError("owner_verification_required");
  }
  if (!status.requiredConfirmation
    || !equalText(authorization?.confirmation, status.requiredConfirmation)) {
    throw profileError("guild_profile_confirmation_required");
  }
}

function captureRemoteAssetIdentity(updatedGuild, field, fallbackGuild) {
  return clean(updatedGuild?.[field] ?? fallbackGuild?.[field]);
}

async function verifyFtCommunityProfileReadback(client, status, expectedAssetIdentities = {}) {
  if (typeof client?.guilds?.fetch !== "function") {
    throw profileError("guild_profile_readback_unavailable");
  }

  let freshGuild;
  try {
    freshGuild = await client.guilds.fetch({
      guild: status.targetGuildId,
      force: true,
      cache: false
    });
  } catch {
    throw profileError("guild_profile_readback_failed");
  }

  const checks = {
    exactGuild: clean(freshGuild?.id) === status.targetGuildId,
    exactOwner: equalText(
      freshGuild?.ownerId,
      status._private.config.expectedOwnerUserId
    ),
    iconPresent: Boolean(clean(freshGuild?.icon)),
    bannerPresent: Boolean(clean(freshGuild?.banner)),
    splashPresent: status.splash.configured ? Boolean(clean(freshGuild?.splash)) : true,
    iconMatchesMutation: !expectedAssetIdentities.icon
      || equalText(freshGuild?.icon, expectedAssetIdentities.icon),
    bannerMatchesMutation: !expectedAssetIdentities.banner
      || equalText(freshGuild?.banner, expectedAssetIdentities.banner),
    splashMatchesMutation: !expectedAssetIdentities.splash
      || equalText(freshGuild?.splash, expectedAssetIdentities.splash)
  };
  const ready = Object.values(checks).every(Boolean);
  if (!ready) throw profileError("guild_profile_readback_mismatch");

  return Object.freeze({
    required: true,
    fresh: true,
    ready: true,
    targetGuildId: status.targetGuildId,
    checks: Object.freeze(checks)
  });
}

export async function applyFtCommunityProfileSync(client, {
  authorization,
  config = ftCommunityProfileConfigFromEnv(),
  dryRun = true,
  previousAssetDigests = {}
} = {}) {
  const status = await inspectFtCommunityProfileSyncInternal(client, { config, previousAssetDigests });
  if (dryRun) {
    const { _private, ...publicStatus } = status;
    return Object.freeze({ applied: false, dryRun: true, status: Object.freeze(publicStatus) });
  }

  assertOwnerAuthorization(status, authorization);
  if (!status.applyEnabled) throw profileError("guild_profile_sync_disabled");
  if (!status.scopeReady) throw profileError("guild_profile_sync_scope_not_ready");

  const changes = [];
  const expectedAssetIdentities = {};
  if (status.iconNeedsUpdate) {
    const updatedGuild = await status._private.guild.setIcon(
      status._private.icon.filePath,
      "Owner-approved FT Community profile sync"
    );
    expectedAssetIdentities.icon = captureRemoteAssetIdentity(
      updatedGuild,
      "icon",
      status._private.guild
    );
    if (!expectedAssetIdentities.icon) throw profileError("guild_profile_mutation_identity_missing");
    changes.push("guild_icon");
  }
  if (status.bannerNeedsUpdate) {
    const updatedGuild = await status._private.guild.setBanner(
      status._private.banner.filePath,
      "Owner-approved FT Community profile sync"
    );
    expectedAssetIdentities.banner = captureRemoteAssetIdentity(
      updatedGuild,
      "banner",
      status._private.guild
    );
    if (!expectedAssetIdentities.banner) throw profileError("guild_profile_mutation_identity_missing");
    changes.push("guild_banner");
  }
  if (status.splashNeedsUpdate) {
    const updatedGuild = await status._private.guild.setSplash(
      status._private.splash.filePath,
      "Owner-approved FT Community profile sync"
    );
    expectedAssetIdentities.splash = captureRemoteAssetIdentity(
      updatedGuild,
      "splash",
      status._private.guild
    );
    if (!expectedAssetIdentities.splash) throw profileError("guild_profile_mutation_identity_missing");
    changes.push("guild_invite_splash");
  }

  const readback = await verifyFtCommunityProfileReadback(
    client,
    status,
    expectedAssetIdentities
  );

  return Object.freeze({
    applied: changes.length > 0,
    dryRun: false,
    targetGuildId: status.targetGuildId,
    changes: Object.freeze(changes),
    readback,
    assetDigests: Object.freeze({
      icon: status.icon.digest || normalizedDigest(previousAssetDigests.icon) || null,
      banner: status.banner.digest || normalizedDigest(previousAssetDigests.banner) || null,
      splash: status.splash.digest || normalizedDigest(previousAssetDigests.splash) || null
    })
  });
}
