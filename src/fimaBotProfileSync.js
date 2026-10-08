import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createFtCommunityManifestProfileAssets } from "./ftCommunityVisualAssets.js";

export const FIMA_BOT_PROFILE_NAME = "FIMA Bot";
export const FIMA_BOT_PROFILE_USERNAME = "FIMA.bot";
export const FIMA_BOT_PROFILE_CONFIRMATION = "APPLY FIMA BOT PROFILE";
export const FIMA_BOT_PROFILE_ALLOWED_GUILD_IDS = Object.freeze([
  "1419335632324657306",
  "1520519015661961257"
]);

const MAX_PROFILE_ASSET_BYTES = 10 * 1024 * 1024;
const PROFILE_ASSET_FORMAT_BY_EXTENSION = Object.freeze({
  ".gif": "gif",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".png": "png",
  ".webp": "webp"
});
const SHA256 = /^[a-f0-9]{64}$/;
const DISCORD_APPLICATION_ID = /^\d{17,20}$/;

function clean(value) {
  return String(value || "").trim();
}

function parseGuildIds(value) {
  return [...new Set(clean(value).split(",").map(clean).filter(Boolean))];
}

function normalizedDigest(value) {
  return clean(value).toLowerCase();
}

function equalText(left, right) {
  const leftBytes = Buffer.from(clean(left));
  const rightBytes = Buffer.from(clean(right));
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function fimaBotProfileConfigFromEnv(env = process.env) {
  const manifestAssets = createFtCommunityManifestProfileAssets();
  return Object.freeze({
    applyEnabled: clean(env.FIMA_BOT_PROFILE_SYNC_ENABLED).toLowerCase() === "true",
    expectedApplicationId: clean(env.FIMA_BOT_EXPECTED_APPLICATION_ID),
    expectedOwnerUserId: clean(env.FIMA_BOT_PROFILE_OWNER_USER_ID),
    guildIds: parseGuildIds(env.FIMA_BOT_PROFILE_GUILD_IDS),
    assetRoot: manifestAssets.assetRoot,
    avatarAsset: manifestAssets.bot.avatar.asset,
    avatarSha256: manifestAssets.bot.avatar.sha256,
    bannerAsset: manifestAssets.bot.banner.asset,
    bannerSha256: manifestAssets.bot.banner.sha256
  });
}

function resolveProfileAsset(assetRoot, configuredAsset) {
  if (!configuredAsset) return null;
  if (!assetRoot) throw new Error("profile_asset_root_required");
  const root = path.resolve(assetRoot);
  const candidate = path.resolve(root, configuredAsset);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("profile_asset_outside_root");
  }
  if (!PROFILE_ASSET_FORMAT_BY_EXTENSION[path.extname(candidate).toLowerCase()]) {
    throw new Error("profile_asset_type_not_allowed");
  }
  return candidate;
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

async function inspectProfileAsset(assetRoot, configuredAsset, expectedSha256) {
  const configured = Boolean(clean(configuredAsset) || normalizedDigest(expectedSha256));
  try {
    if (!clean(configuredAsset)) throw new Error("profile_asset_path_required");
    const expectedDigest = normalizedDigest(expectedSha256);
    if (!SHA256.test(expectedDigest)) throw new Error("profile_asset_digest_required");
    const filePath = resolveProfileAsset(assetRoot, configuredAsset);
    const resolvedRoot = path.resolve(assetRoot);
    const [realRoot, realAssetPath] = await Promise.all([
      fs.realpath(resolvedRoot),
      fs.realpath(filePath)
    ]);
    const realRelative = path.relative(realRoot, realAssetPath);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error("profile_asset_outside_root");
    }
    const stat = await fs.stat(realAssetPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PROFILE_ASSET_BYTES) {
      throw new Error("profile_asset_size_invalid");
    }
    const bytes = await fs.readFile(realAssetPath);
    if (bytes.length <= 0 || bytes.length > MAX_PROFILE_ASSET_BYTES) {
      throw new Error("profile_asset_size_invalid");
    }
    const expectedFormat = PROFILE_ASSET_FORMAT_BY_EXTENSION[path.extname(configuredAsset).toLowerCase()];
    if (detectedAssetFormat(bytes) !== expectedFormat) {
      throw new Error("profile_asset_format_invalid");
    }
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!equalText(digest, expectedDigest)) throw new Error("profile_asset_digest_mismatch");
    return Object.freeze({
      configured: true,
      ready: true,
      digest,
      bytes: bytes.length,
      format: expectedFormat,
      filePath: realAssetPath
    });
  } catch (error) {
    return Object.freeze({
      configured,
      ready: false,
      digest: null,
      bytes: 0,
      format: null,
      reason: error?.code === "ENOENT" ? "profile_asset_missing" : clean(error?.message) || "profile_asset_invalid"
    });
  }
}

function publicAssetStatus(asset) {
  return Object.freeze({
    configured: asset.configured,
    ready: asset.ready,
    digest: asset.digest,
    bytes: asset.bytes,
    format: asset.format || null,
    reason: asset.reason || null
  });
}

async function inspectFimaBotProfileSyncInternal(client, {
  config = fimaBotProfileConfigFromEnv(),
  previousAssetDigests = {}
} = {}) {
  const applicationId = clean(client?.application?.id);
  const botUserId = clean(client?.user?.id);
  const expectedApplicationId = clean(config.expectedApplicationId);
  const guildIds = [...new Set((config.guildIds || []).map(clean).filter(Boolean))];
  const allowedGuildSet = new Set(FIMA_BOT_PROFILE_ALLOWED_GUILD_IDS);
  const exactApplication = Boolean(expectedApplicationId)
    && applicationId === expectedApplicationId
    && botUserId === expectedApplicationId;
  const exactGuildScope = guildIds.length > 0
    && guildIds.every(guildId => allowedGuildSet.has(guildId) && client?.guilds?.cache?.has?.(guildId));
  const avatar = await inspectProfileAsset(config.assetRoot, config.avatarAsset, config.avatarSha256);
  const banner = await inspectProfileAsset(config.assetRoot, config.bannerAsset, config.bannerSha256);
  const assetsReady = avatar.ready && banner.ready;
  const guildNicknameMismatches = exactGuildScope
    ? guildIds.filter(guildId => {
        const guild = client.guilds.cache.get(guildId);
        return clean(guild?.members?.me?.nickname || client.user?.username) !== FIMA_BOT_PROFILE_NAME;
      }).length
    : 0;
  const avatarNeedsUpdate = avatar.configured && avatar.ready && avatar.digest !== clean(previousAssetDigests.avatar);
  const bannerNeedsUpdate = banner.configured && banner.ready && banner.digest !== clean(previousAssetDigests.banner);
  const applicationNameMatches = clean(client?.application?.name) === FIMA_BOT_PROFILE_NAME;
  const developerPortalUrl = exactApplication && DISCORD_APPLICATION_ID.test(applicationId)
    ? `https://discord.com/developers/applications/${applicationId}/information`
    : null;

  return Object.freeze({
    desiredName: FIMA_BOT_PROFILE_NAME,
    applyEnabled: config.applyEnabled === true,
    exactApplication,
    exactGuildScope,
    assetsReady,
    scopeReady: exactApplication && exactGuildScope && assetsReady,
    applicationNameMatches,
    applicationNameRequiresDashboardUpdate: !applicationNameMatches,
    applicationNameRemediation: Object.freeze({
      required: !applicationNameMatches,
      supportedByBotTokenApi: false,
      channel: "discord_developer_portal",
      action: `Set the verified Discord application name to ${FIMA_BOT_PROFILE_NAME}.`,
      developerPortalUrl
    }),
    usernameMatches: clean(client?.user?.username) === FIMA_BOT_PROFILE_USERNAME,
    guildCount: guildIds.length,
    guildNicknameMismatches,
    avatar: publicAssetStatus(avatar),
    banner: publicAssetStatus(banner),
    avatarNeedsUpdate,
    bannerNeedsUpdate,
    _private: Object.freeze({ config, guildIds, avatar, banner })
  });
}

export async function inspectFimaBotProfileSync(client, options = {}) {
  const { _private, ...status } = await inspectFimaBotProfileSyncInternal(client, options);
  return Object.freeze(status);
}

function assertOwnerAuthorization(status, authorization) {
  const expectedOwnerUserId = clean(status._private.config.expectedOwnerUserId);
  if (!expectedOwnerUserId
    || authorization?.ownerVerified !== true
    || clean(authorization?.actorUserId) !== expectedOwnerUserId) {
    throw new Error("owner_verification_required");
  }
  if (clean(authorization?.confirmation) !== FIMA_BOT_PROFILE_CONFIRMATION) {
    throw new Error("profile_sync_confirmation_required");
  }
}

function captureRemoteProfileIdentity(updatedUser, field, fallbackUser) {
  return clean(updatedUser?.[field] ?? fallbackUser?.[field]);
}

async function verifyFimaBotProfileReadback(client, status, expectedProfileIdentities = {}) {
  if (typeof client?.users?.fetch !== "function" || typeof client?.guilds?.fetch !== "function") {
    throw new Error("profile_readback_unavailable");
  }

  const botUserId = clean(client?.user?.id);
  let freshUser;
  const freshGuildMembers = [];
  try {
    freshUser = await client.users.fetch(botUserId, { force: true, cache: false });
    for (const guildId of status._private.guildIds) {
      const freshGuild = await client.guilds.fetch({ guild: guildId, force: true, cache: false });
      if (clean(freshGuild?.id) !== guildId || typeof freshGuild?.members?.fetch !== "function") {
        throw new Error("profile_readback_guild_mismatch");
      }
      const freshMember = await freshGuild.members.fetch({
        user: botUserId,
        force: true,
        cache: false
      });
      freshGuildMembers.push({ guildId, member: freshMember });
    }
  } catch {
    throw new Error("profile_readback_failed");
  }

  const checks = {
    exactUser: clean(freshUser?.id) === botUserId
      && botUserId === clean(status._private.config.expectedApplicationId),
    username: clean(freshUser?.username) === FIMA_BOT_PROFILE_USERNAME,
    avatarPresent: Boolean(clean(freshUser?.avatar)),
    bannerPresent: Boolean(clean(freshUser?.banner)),
    avatarMatchesMutation: !expectedProfileIdentities.avatar
      || equalText(freshUser?.avatar, expectedProfileIdentities.avatar),
    bannerMatchesMutation: !expectedProfileIdentities.banner
      || equalText(freshUser?.banner, expectedProfileIdentities.banner),
    guildNicknames: freshGuildMembers.every(({ guildId, member }) => (
      clean(member?.guild?.id || guildId) === guildId
      && clean(member?.user?.id || member?.id) === botUserId
      && clean(member?.nickname) === FIMA_BOT_PROFILE_NAME
    ))
  };
  const ready = Object.values(checks).every(Boolean);
  if (!ready) throw new Error("profile_readback_mismatch");

  return Object.freeze({
    required: true,
    fresh: true,
    ready: true,
    applicationId: clean(status._private.config.expectedApplicationId),
    guildCount: freshGuildMembers.length,
    checks: Object.freeze(checks)
  });
}

export async function applyFimaBotProfileSync(client, {
  authorization,
  config = fimaBotProfileConfigFromEnv(),
  dryRun = true,
  previousAssetDigests = {}
} = {}) {
  const status = await inspectFimaBotProfileSyncInternal(client, { config, previousAssetDigests });
  if (dryRun) {
    const { _private, ...publicStatus } = status;
    return { applied: false, dryRun: true, status: Object.freeze(publicStatus) };
  }
  assertOwnerAuthorization(status, authorization);
  if (!status.applyEnabled) throw new Error("profile_sync_disabled");
  if (!status.scopeReady) throw new Error("profile_sync_scope_not_ready");

  const changes = [];
  const expectedProfileIdentities = {};
  let mutationAttempted = false;
  try {
    if (!status.usernameMatches) {
      mutationAttempted = true;
      await client.user.setUsername(FIMA_BOT_PROFILE_USERNAME);
      changes.push("bot_username");
    }
    // Discord's bot-token API can edit the bot user's username, avatar and
    // banner, but ClientApplication.edit does not accept an application name.
    // Keep the application-name mismatch visible in status so it can be fixed
    // in the Developer Portal without turning a supported profile sync into a
    // failing or misleading API call.
    for (const guildId of status._private.guildIds) {
      const member = client.guilds.cache.get(guildId)?.members?.me;
      if (member && clean(member.nickname) !== FIMA_BOT_PROFILE_NAME) {
        mutationAttempted = true;
        await member.setNickname(FIMA_BOT_PROFILE_NAME, "Owner-approved FIMA Bot profile sync");
        changes.push("guild_nickname");
      }
    }
    if (status.avatarNeedsUpdate) {
      mutationAttempted = true;
      const updatedUser = await client.user.setAvatar(status._private.avatar.filePath);
      expectedProfileIdentities.avatar = captureRemoteProfileIdentity(
        updatedUser,
        "avatar",
        client.user
      );
      if (!expectedProfileIdentities.avatar) throw new Error("profile_mutation_identity_missing");
      changes.push("bot_avatar");
    }
    if (status.bannerNeedsUpdate) {
      mutationAttempted = true;
      const updatedUser = await client.user.setBanner(status._private.banner.filePath);
      expectedProfileIdentities.banner = captureRemoteProfileIdentity(
        updatedUser,
        "banner",
        client.user
      );
      if (!expectedProfileIdentities.banner) throw new Error("profile_mutation_identity_missing");
      changes.push("bot_banner");
    }

    const readback = await verifyFimaBotProfileReadback(
      client,
      status,
      expectedProfileIdentities
    );

    return {
      applied: changes.length > 0,
      dryRun: false,
      changes,
      readback,
      assetDigests: {
        avatar: status.avatar.digest || clean(previousAssetDigests.avatar) || null,
        banner: status.banner.digest || clean(previousAssetDigests.banner) || null
      }
    };
  } catch {
    if (mutationAttempted) {
      throw Object.assign(new Error("profile_sync_partial_mutation"), {
        code: "profile_sync_partial_mutation",
        partialMutationPossible: true,
        remediationRequired: true
      });
    }
    throw new Error("profile_sync_failed");
  }
}
