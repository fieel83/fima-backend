import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXTENDED_ASSET_ROOT = "/assets/images/discord/extended-v2";
const INVITE_SPLASH_ASSET_PATH = "/assets/images/discord/v5/ft-community-invite-splash-v5.png";
const V5_ASSET_PATHS = Object.freeze({
  guildProfile: Object.freeze({
    icon: "/assets/images/discord/v5/ft-community-server-icon-v5.png",
    banner: "/assets/images/discord/v5/ft-community-server-banner-v5.png",
    inviteSplash: INVITE_SPLASH_ASSET_PATH
  }),
  botProfile: Object.freeze({
    avatar: "/assets/images/discord/v5/fima-bot-avatar-v5.png",
    banner: "/assets/images/discord/v5/fima-bot-profile-banner-v5.png"
  }),
  webhookBanners: Object.freeze({
    welcome: "/assets/images/discord/v5/ft-community-welcome-v5.png",
    leave: "/assets/images/discord/v5/ft-community-leave-v5.png",
    rules: "/assets/images/discord/v5/ft-community-rules-v5.png",
    staffTeam: "/assets/images/discord/v5/ft-community-staff-v5.png",
    videoTeam: "/assets/images/discord/v5/ft-community-video-team-v5.png",
    announcement: "/assets/images/discord/v5/ft-community-announcement-v5.png",
    leaderboard: "/assets/images/discord/v5/ft-community-leaderboard-v5.png",
    booster: "/assets/images/discord/v5/ft-community-booster-v5.png"
  })
});
export const FT_COMMUNITY_VISUAL_MANIFEST_RELATIVE_PATH =
  "public/assets/images/discord/extended-v2/discord-extended-asset-manifest-v2.json";
export const FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH =
  "public/assets/images/discord/v5/discord-asset-manifest-v5.json";
export const FT_COMMUNITY_V4_MANIFEST_RELATIVE_PATH =
  FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH;
export const FT_COMMUNITY_VISUAL_THEME = "ft-community-obsidian-violet-cyan-anime";
const FT_COMMUNITY_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

const EXPECTED_USAGE_COUNTS = Object.freeze({
  invite: 1,
  onboarding: 1,
  "role-icon": 16,
  tag: 8,
  "category-thumbnail": 9
});

const EXPECTED_V5_ASSETS = Object.freeze({
  "ft-community-server-icon": Object.freeze({ usage: "FT Community Discord server icon", path: V5_ASSET_PATHS.guildProfile.icon }),
  "ft-community-server-banner": Object.freeze({ usage: "FT Community Discord server banner", path: V5_ASSET_PATHS.guildProfile.banner }),
  "ft-community-invite-splash": Object.freeze({ usage: "FT Community Discord invite splash", path: V5_ASSET_PATHS.guildProfile.inviteSplash }),
  "fima-bot-avatar": Object.freeze({ usage: "FIMA Bot Discord application avatar", path: V5_ASSET_PATHS.botProfile.avatar }),
  "fima-bot-profile-banner": Object.freeze({ usage: "FIMA Bot Discord application profile banner", path: V5_ASSET_PATHS.botProfile.banner }),
  "ft-community-welcome": Object.freeze({ usage: "FT Community welcome webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.welcome }),
  "ft-community-leave": Object.freeze({ usage: "FT Community leave webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.leave }),
  "ft-community-rules": Object.freeze({ usage: "FT Community rules webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.rules }),
  "ft-community-staff": Object.freeze({ usage: "FT Community staff webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.staffTeam }),
  "ft-community-video-team": Object.freeze({ usage: "FT Community video-team webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.videoTeam }),
  "ft-community-announcement": Object.freeze({ usage: "FT Community announcement webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.announcement }),
  "ft-community-leaderboard": Object.freeze({ usage: "FT Community monthly leaderboard webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.leaderboard }),
  "ft-community-booster": Object.freeze({ usage: "FT Community server booster webhook embed banner", path: V5_ASSET_PATHS.webhookBanners.booster })
});

function frozenPathMap(prefix, names, { defaultVersion = "v1", versions = {} } = {}) {
  return Object.freeze(Object.fromEntries(names.map(name => [
    name,
    `${EXTENDED_ASSET_ROOT}/${prefix}-${name}-${versions[name] || defaultVersion}.png`
  ])));
}

export const FT_COMMUNITY_VISUAL_ASSET_PATHS = Object.freeze({
  inviteSplash: INVITE_SPLASH_ASSET_PATH,
  guildProfile: V5_ASSET_PATHS.guildProfile,
  botProfile: V5_ASSET_PATHS.botProfile,
  webhookBanners: V5_ASSET_PATHS.webhookBanners,
  onboardingBoard: `${EXTENDED_ASSET_ROOT}/ft-community-onboarding-board-v2.png`,
  roles: frozenPathMap("role", [
    "owner", "administrator", "moderator", "helper", "creative", "video-team",
    "support", "macro-specialist", "fima-ai", "member", "verified", "safety",
    "language", "region", "notifications", "booster"
  ], { defaultVersion: "v2" }),
  tags: frozenPathMap("tag", [
    "news", "event", "guide", "support", "video", "art", "english", "turkish"
  ], { defaultVersion: "v2" }),
  categories: frozenPathMap("category", [
    "start", "community", "fima", "fieel-style", "turkish-community",
    "support", "personnel", "video-team", "voice"
  ], { defaultVersion: "v2" })
});

function manifestError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isSafeManifestPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\")) return false;
  if (path.posix.isAbsolute(value) || value.includes("\0")) return false;
  const normalized = path.posix.normalize(value);
  const isExtendedAsset = normalized.startsWith("public/assets/images/discord/extended-v2/");
  const isReviewedV5Invite = normalized === "public/assets/images/discord/v5/ft-community-invite-splash-v5.png";
  return normalized === value
    && !normalized.startsWith("../")
    && normalized !== ".."
    && (isExtendedAsset || isReviewedV5Invite)
    && normalized.endsWith(".png");
}

function validateManifestEntry(entry, { kind, ids, paths }) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw manifestError("ft_community_visual_manifest_entry_invalid", { kind });
  }
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw manifestError("ft_community_visual_manifest_id_invalid", { kind });
  }
  if (ids.has(id)) throw manifestError("ft_community_visual_manifest_duplicate_id", { id });
  ids.add(id);

  if (!isSafeManifestPath(entry.path)) {
    throw manifestError("ft_community_visual_manifest_path_invalid", { id });
  }
  if (paths.has(entry.path)) {
    throw manifestError("ft_community_visual_manifest_duplicate_path", { id });
  }
  paths.add(entry.path);

  for (const field of ["width", "height", "bytes"]) {
    if (!Number.isSafeInteger(entry[field]) || entry[field] <= 0) {
      throw manifestError("ft_community_visual_manifest_numeric_field_invalid", { id, field });
    }
  }
  if (!/^[a-f0-9]{64}$/.test(String(entry.sha256 || ""))) {
    throw manifestError("ft_community_visual_manifest_sha256_invalid", { id });
  }
  if (kind === "asset" && !Object.hasOwn(EXPECTED_USAGE_COUNTS, entry.usage)) {
    throw manifestError("ft_community_visual_manifest_usage_invalid", { id });
  }
  return entry;
}

export function validateFtCommunityVisualManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw manifestError("ft_community_visual_manifest_invalid");
  }
  if (manifest.schemaVersion !== 1) {
    throw manifestError("ft_community_visual_manifest_schema_unsupported");
  }
  if (manifest.theme !== FT_COMMUNITY_VISUAL_THEME) {
    throw manifestError("ft_community_visual_manifest_theme_mismatch");
  }
  if (typeof manifest.liveMutationApproved !== "boolean") {
    throw manifestError("ft_community_visual_manifest_approval_invalid");
  }
  if (!Array.isArray(manifest.assets) || !Array.isArray(manifest.sourceAtlases)) {
    throw manifestError("ft_community_visual_manifest_collections_invalid");
  }
  if (manifest.assets.length !== 35 || manifest.sourceAtlases.length !== 3) {
    throw manifestError("ft_community_visual_manifest_asset_count_mismatch", {
      assetCount: manifest.assets.length,
      sourceAtlasCount: manifest.sourceAtlases.length
    });
  }

  const ids = new Set();
  const paths = new Set();
  const usageCounts = Object.fromEntries(Object.keys(EXPECTED_USAGE_COUNTS).map(key => [key, 0]));
  for (const entry of manifest.assets) {
    validateManifestEntry(entry, { kind: "asset", ids, paths });
    usageCounts[entry.usage] += 1;
  }
  for (const [usage, count] of Object.entries(EXPECTED_USAGE_COUNTS)) {
    if (usageCounts[usage] !== count) {
      throw manifestError("ft_community_visual_manifest_usage_count_mismatch", {
        usage,
        actual: usageCounts[usage],
        expected: count
      });
    }
  }
  for (const entry of manifest.sourceAtlases) {
    validateManifestEntry(entry, { kind: "atlas", ids, paths });
  }
  return manifest;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const FT_COMMUNITY_VISUAL_MANIFEST = deepFreeze(validateFtCommunityVisualManifest(
  JSON.parse(readFileSync(
    new URL("../public/assets/images/discord/extended-v2/discord-extended-asset-manifest-v2.json", import.meta.url),
    "utf8"
  ))
));

export function validateFtCommunityV5VisualManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw manifestError("ft_community_v5_visual_manifest_invalid");
  }
  if (manifest.schemaVersion !== 1 || manifest.assetVersion !== "v5" || manifest.brand !== "FIMA"
    || manifest.theme !== FT_COMMUNITY_VISUAL_THEME) {
    throw manifestError("ft_community_v5_visual_manifest_identity_invalid");
  }
  if (typeof manifest.liveMutationApproved !== "boolean" || !/^\d{4}-\d{2}-\d{2}$/.test(String(manifest.generatedAt || ""))) {
    throw manifestError("ft_community_v5_visual_manifest_metadata_invalid");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== Object.keys(EXPECTED_V5_ASSETS).length) {
    throw manifestError("ft_community_v5_visual_manifest_asset_count_mismatch", {
      actual: Array.isArray(manifest.assets) ? manifest.assets.length : null,
      expected: Object.keys(EXPECTED_V5_ASSETS).length
    });
  }
  const ids = new Set();
  const paths = new Set();
  for (const entry of manifest.assets) {
    const id = String(entry?.id || "").trim();
    const assetPath = String(entry?.path || "").trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) {
      throw manifestError("ft_community_v5_visual_manifest_id_invalid", { id });
    }
    ids.add(id);
    const expected = EXPECTED_V5_ASSETS[id];
    if (!expected) {
      throw manifestError("ft_community_v5_visual_manifest_id_unexpected", { id });
    }
    if (!assetPath.startsWith("/assets/images/") || assetPath.includes("\\")
      || assetPath.includes("\0") || path.posix.normalize(assetPath) !== assetPath
      || !assetPath.endsWith(".png") || assetPath !== expected.path) {
      throw manifestError("ft_community_v5_visual_manifest_path_invalid", { id });
    }
    if (paths.has(assetPath)) {
      throw manifestError("ft_community_v5_visual_manifest_duplicate_path", { id });
    }
    paths.add(assetPath);
    if (entry.usage !== expected.usage) {
      throw manifestError("ft_community_v5_visual_manifest_usage_invalid", { id });
    }
    for (const field of ["width", "height", "bytes"]) {
      if (!Number.isSafeInteger(entry[field]) || entry[field] <= 0) {
        throw manifestError("ft_community_v5_visual_manifest_numeric_field_invalid", { id, field });
      }
    }
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256 || ""))) {
      throw manifestError("ft_community_v5_visual_manifest_sha256_invalid", { id });
    }
    for (const field of ["semantic", "cropSafe"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length < 12) {
        throw manifestError("ft_community_v5_visual_manifest_review_metadata_invalid", { id, field });
      }
    }
  }
  for (const id of Object.keys(EXPECTED_V5_ASSETS)) {
    if (!ids.has(id)) {
      throw manifestError("ft_community_v5_visual_manifest_id_missing", { id });
    }
  }
  return manifest;
}

export const FT_COMMUNITY_V5_VISUAL_MANIFEST = deepFreeze(validateFtCommunityV5VisualManifest(
  JSON.parse(readFileSync(
    new URL("../public/assets/images/discord/v5/discord-asset-manifest-v5.json", import.meta.url),
    "utf8"
  ))
));
export const FT_COMMUNITY_V4_VISUAL_MANIFEST = FT_COMMUNITY_V5_VISUAL_MANIFEST;
export const validateFtCommunityV4VisualManifest = validateFtCommunityV5VisualManifest;

function canonicalManifestEntry(assetId) {
  const id = String(assetId || "").trim();
  const extended = FT_COMMUNITY_VISUAL_MANIFEST.assets.filter(entry => entry.id === id);
  const v5 = FT_COMMUNITY_V5_VISUAL_MANIFEST.assets.filter(entry => entry.id === id);
  const matches = [...extended, ...v5];
  if (matches.length !== 1) {
    throw manifestError(matches.length ? "ft_community_visual_asset_id_ambiguous" : "ft_community_visual_asset_id_unknown", { id });
  }
  const source = extended.length === 1 ? "extended-v2" : "v5";
  const entry = matches[0];
  const repositoryPath = source === "v5" ? `public${entry.path}` : entry.path;
  return { entry, repositoryPath, source };
}

const verifiedLocalAssetCache = new Map();

/**
 * Loads one reviewed Discord image from disk and verifies its byte count,
 * dimensions and SHA-256 before it can reach a Discord mutation payload.
 * The returned Buffer is a copy so callers cannot mutate the verified cache.
 */
export function loadVerifiedFtCommunityVisualAsset(assetId, {
  repoRoot = FT_COMMUNITY_REPOSITORY_ROOT,
  expectedUsage = null
} = {}) {
  const { entry, repositoryPath, source } = canonicalManifestEntry(assetId);
  if (expectedUsage && entry.usage !== expectedUsage) {
    throw manifestError("ft_community_visual_asset_usage_mismatch", {
      id: entry.id,
      expectedUsage,
      actualUsage: entry.usage || null
    });
  }
  const cacheKey = `${path.resolve(repoRoot)}:${source}:${entry.id}`;
  let verified = verifiedLocalAssetCache.get(cacheKey);
  if (!verified) {
    const absolutePath = safeRepoAssetPath(repoRoot, repositoryPath);
    let buffer;
    try {
      buffer = readFileSync(absolutePath);
    } catch (cause) {
      throw manifestError("ft_community_visual_asset_missing", { id: entry.id, cause });
    }
    if (buffer.length !== entry.bytes) {
      throw manifestError("ft_community_visual_asset_size_mismatch", { id: entry.id });
    }
    const dimensions = pngDimensions(buffer, entry.id);
    if (dimensions.width !== entry.width || dimensions.height !== entry.height) {
      throw manifestError("ft_community_visual_asset_dimensions_mismatch", { id: entry.id });
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== entry.sha256) {
      throw manifestError("ft_community_visual_asset_digest_mismatch", { id: entry.id });
    }
    verified = Object.freeze({
      id: entry.id,
      usage: entry.usage || null,
      filename: path.basename(repositoryPath),
      repositoryPath,
      sha256,
      // Discord's static image asset identifiers use the content MD5. This
      // lets readiness compare the API readback hash, never a source URL.
      discordContentHash: createHash("md5").update(buffer).digest("hex"),
      buffer
    });
    verifiedLocalAssetCache.set(cacheKey, verified);
  }
  return Object.freeze({
    id: verified.id,
    usage: verified.usage,
    filename: verified.filename,
    repositoryPath: verified.repositoryPath,
    sha256: verified.sha256,
    discordContentHash: verified.discordContentHash,
    attachmentUrl: `attachment://${verified.filename}`,
    buffer: Buffer.from(verified.buffer)
  });
}

/**
 * Returns canonical local descriptors for the Discord profile sync modules.
 * The source path and digest come only from the reviewed manifests, while the
 * loader verifies the actual bytes before any descriptor is exposed.
 */
export function createFtCommunityManifestProfileAssets({
  repoRoot = FT_COMMUNITY_REPOSITORY_ROOT
} = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const descriptor = assetId => {
    const asset = loadVerifiedFtCommunityVisualAsset(assetId, { repoRoot: resolvedRoot });
    return Object.freeze({ asset: asset.repositoryPath, sha256: asset.sha256 });
  };
  return Object.freeze({
    assetRoot: resolvedRoot,
    bot: Object.freeze({
      avatar: descriptor("fima-bot-avatar"),
      banner: descriptor("fima-bot-profile-banner")
    }),
    guild: Object.freeze({
      icon: descriptor("ft-community-server-icon"),
      banner: descriptor("ft-community-server-banner"),
      splash: descriptor("ft-community-invite-splash")
    })
  });
}

function safeRepoAssetPath(repoRoot, relativePath) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedAsset = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedAsset);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw manifestError("ft_community_visual_asset_path_outside_repo");
  }
  return resolvedAsset;
}

function pngDimensions(buffer, id) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
    || buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw manifestError("ft_community_visual_asset_not_png", { id });
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function verifyManifestAssetEntries(repoRoot, entries, repositoryPathForEntry) {
  const verified = [];
  for (const entry of entries) {
    const repositoryPath = repositoryPathForEntry(entry);
    const absolutePath = safeRepoAssetPath(repoRoot, repositoryPath);
    const metadata = await stat(absolutePath).catch(cause => {
      throw manifestError("ft_community_visual_asset_missing", { id: entry.id, cause });
    });
    if (!metadata.isFile() || metadata.size !== entry.bytes) {
      throw manifestError("ft_community_visual_asset_size_mismatch", { id: entry.id });
    }
    const buffer = await readFile(absolutePath);
    const dimensions = pngDimensions(buffer, entry.id);
    if (dimensions.width !== entry.width || dimensions.height !== entry.height) {
      throw manifestError("ft_community_visual_asset_dimensions_mismatch", { id: entry.id });
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== entry.sha256) {
      throw manifestError("ft_community_visual_asset_digest_mismatch", { id: entry.id });
    }
    verified.push(Object.freeze({ id: entry.id, path: repositoryPath, sha256 }));
  }
  return Object.freeze(verified);
}

export async function verifyFtCommunityVisualAssetPackage({
  repoRoot = process.cwd(),
  manifestPath = FT_COMMUNITY_VISUAL_MANIFEST_RELATIVE_PATH
} = {}) {
  if (manifestPath !== FT_COMMUNITY_VISUAL_MANIFEST_RELATIVE_PATH) {
    throw manifestError("ft_community_visual_manifest_path_not_canonical");
  }
  const absoluteManifestPath = safeRepoAssetPath(repoRoot, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  } catch (cause) {
    throw manifestError("ft_community_visual_manifest_unreadable", { cause });
  }
  validateFtCommunityVisualManifest(manifest);

  const verified = await verifyManifestAssetEntries(
    repoRoot,
    [...manifest.assets, ...manifest.sourceAtlases],
    entry => entry.path
  );
  return Object.freeze({
    manifest,
    manifestPath,
    verified: Object.freeze(verified),
    verifiedAssetCount: verified.length
  });
}

export async function verifyFtCommunityV5VisualAssetPackage({
  repoRoot = process.cwd(),
  manifestPath = FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH
} = {}) {
  if (manifestPath !== FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH) {
    throw manifestError("ft_community_v5_visual_manifest_path_not_canonical");
  }
  const absoluteManifestPath = safeRepoAssetPath(repoRoot, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  } catch (cause) {
    throw manifestError("ft_community_v5_visual_manifest_unreadable", { cause });
  }
  validateFtCommunityV5VisualManifest(manifest);
  const verified = await verifyManifestAssetEntries(
    repoRoot,
    manifest.assets,
    entry => `public${entry.path}`
  );
  return Object.freeze({
    manifest,
    manifestPath,
    verified,
    verifiedAssetCount: verified.length
  });
}

export const verifyFtCommunityV4VisualAssetPackage = verifyFtCommunityV5VisualAssetPackage;

export async function verifyFtCommunityAllVisualAssetPackages({ repoRoot = process.cwd() } = {}) {
  const [extended, v5] = await Promise.all([
    verifyFtCommunityVisualAssetPackage({ repoRoot }),
    verifyFtCommunityV5VisualAssetPackage({ repoRoot })
  ]);
  return Object.freeze({
    extended,
    v5,
    v4: v5,
    verifiedAssetCount: extended.verifiedAssetCount + v5.verifiedAssetCount
  });
}

const FT_COMMUNITY_VISUAL_READINESS_EXPECTED = Object.freeze({
  extendedAssets: 35,
  sourceAtlases: 3,
  v5Assets: 13,
  guildProfile: 3,
  botProfile: 2,
  webhookBanners: 8,
  canonicalMessages: 1,
  roleIcons: 16,
  embedTags: 8,
  categoryThumbnails: 9
});

function activeConsumer(intendedConsumer) {
  return Object.freeze({ status: "active", intendedConsumer });
}

function consumerMap(keys, intendedConsumer, status = "active") {
  return Object.freeze(Object.fromEntries(keys.map(key => [
    key,
    Object.freeze({ status, intendedConsumer })
  ])));
}

/**
 * Stable, secret-free ownership map for every reviewed bitmap surface. This is
 * deliberately separate from URLs and digests so deployment readiness can
 * prove that a verified asset has a real runtime consumer without publishing
 * filesystem or CDN metadata.
 */
export const FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS = deepFreeze({
  guildProfile: {
    icon: activeConsumer("ft-community-profile-sync"),
    banner: activeConsumer("ft-community-profile-sync"),
    inviteSplash: activeConsumer("ft-community-profile-sync")
  },
  botProfile: {
    avatar: activeConsumer("fima-bot-profile-sync"),
    banner: activeConsumer("fima-bot-profile-sync")
  },
  webhookBanners: {
    welcome: activeConsumer("member-lifecycle-embed"),
    leave: activeConsumer("member-lifecycle-embed"),
    rules: activeConsumer("canonical-rules-guide"),
    staffTeam: activeConsumer("staff-team-panel"),
    videoTeam: activeConsumer("video-team-panel"),
    announcement: activeConsumer("canonical-announcement-guide"),
    leaderboard: activeConsumer("monthly-and-ranked-leaderboard-panels"),
    booster: activeConsumer("canonical-booster-guide")
  },
  canonicalMessages: {
    onboardingBoard: activeConsumer("language-onboarding-dm-and-panel")
  },
  roleIcons: consumerMap(
    Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.roles),
    "community-role-icon-reconciler"
  ),
  embedTags: consumerMap(
    Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.tags),
    "content-studio-preview",
    "planned-only"
  ),
  categoryThumbnails: consumerMap(
    Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.categories),
    "canonical-guide-thumbnail"
  )
});

function sameKeys(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = Object.keys(expected || {}).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

/**
 * Verifies both the reviewed binding and the runtime ownership declaration for
 * every surface. Any extra/missing/renamed consumer fails closed.
 */
export function assertFtCommunityVisualConsumerCoverage(plan) {
  const contracts = plan?.consumerContracts;
  const bindings = plan?.assetBindings;
  const surfaces = plan?.surfaces;
  if (!sameKeys(contracts, FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS)
      || !sameKeys(bindings, FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS)
      || !sameKeys(surfaces, FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS)) {
    throw manifestError("ft_community_visual_consumer_groups_mismatch");
  }

  let activeSurfaceCount = 0;
  let plannedOnlySurfaceCount = 0;
  const activeConsumers = new Set();
  const plannedOnlyConsumers = new Set();
  for (const [group, expectedGroup] of Object.entries(FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS)) {
    if (!sameKeys(contracts[group], expectedGroup)
        || !sameKeys(bindings[group], expectedGroup)
        || !sameKeys(surfaces[group], expectedGroup)) {
      throw manifestError("ft_community_visual_consumer_surfaces_mismatch", { group });
    }
    for (const [surface, expected] of Object.entries(expectedGroup)) {
      const actual = contracts[group][surface];
      const binding = bindings[group][surface];
      if (actual?.status !== expected.status
          || actual?.intendedConsumer !== expected.intendedConsumer
          || !binding?.assetId
          || !/^[a-f0-9]{64}$/.test(String(binding?.sha256 || ""))
          || typeof surfaces[group][surface] !== "string") {
        throw manifestError("ft_community_visual_consumer_binding_invalid", { group, surface });
      }
      if (expected.status === "active") {
        activeSurfaceCount += 1;
        activeConsumers.add(expected.intendedConsumer);
      } else if (expected.status === "planned-only") {
        plannedOnlySurfaceCount += 1;
        plannedOnlyConsumers.add(expected.intendedConsumer);
      } else {
        throw manifestError("ft_community_visual_consumer_status_invalid", { group, surface });
      }
    }
  }
  return deepFreeze({
    activeSurfaceCount,
    plannedOnlySurfaceCount,
    activeConsumerCount: activeConsumers.size,
    plannedOnlyConsumerCount: plannedOnlyConsumers.size
  });
}

/**
 * Fail-closed production gate for every reviewed FT Community visual. The
 * result intentionally contains counts and stable codes only: no local paths,
 * public URLs, hashes or manifest contents can leak into deployment output.
 */
export async function inspectFtCommunityVisualAssetReadiness({
  repoRoot = FT_COMMUNITY_REPOSITORY_ROOT
} = {}) {
  try {
    const packages = await verifyFtCommunityAllVisualAssetPackages({ repoRoot });
    const plan = createFtCommunityVisualSurfacePlan(
      "https://ft-community-visual-readiness.invalid",
      packages.extended.manifest,
      packages.v5.manifest
    );
    const counts = Object.freeze({
      extendedAssets: packages.extended.manifest.assets.length,
      sourceAtlases: packages.extended.manifest.sourceAtlases.length,
      v5Assets: packages.v5.manifest.assets.length,
      guildProfile: Object.keys(plan.assetBindings.guildProfile).length,
      botProfile: Object.keys(plan.assetBindings.botProfile).length,
      webhookBanners: Object.keys(plan.assetBindings.webhookBanners).length,
      canonicalMessages: Object.keys(plan.assetBindings.canonicalMessages).length,
      roleIcons: Object.keys(plan.assetBindings.roleIcons).length,
      embedTags: Object.keys(plan.assetBindings.embedTags).length,
      categoryThumbnails: Object.keys(plan.assetBindings.categoryThumbnails).length
    });
    const countsMatch = Object.entries(FT_COMMUNITY_VISUAL_READINESS_EXPECTED)
      .every(([key, expected]) => counts[key] === expected);
    const verifiedAssetCount = packages.verifiedAssetCount;
    const consumerCoverage = assertFtCommunityVisualConsumerCoverage(plan);
    if (!countsMatch
        || verifiedAssetCount !== 51
        || plan.liveMutationApproved !== true
        || plan.surfaceContracts.embedTags?.status !== "planned-only"
        || consumerCoverage.activeSurfaceCount !== 39
        || consumerCoverage.plannedOnlySurfaceCount !== 8) {
      throw manifestError("ft_community_visual_assets_not_ready");
    }
    return deepFreeze({
      schemaVersion: 1,
      ready: true,
      code: "ft_community_visual_assets_ready",
      verifiedAssetCount,
      ...consumerCoverage,
      counts
    });
  } catch {
    return Object.freeze({
      schemaVersion: 1,
      ready: false,
      code: "ft_community_visual_assets_not_ready"
    });
  }
}

export function sanitizeFtCommunityAssetBase(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function urlMap(base, paths) {
  return Object.freeze(Object.fromEntries(
    Object.entries(paths).map(([key, assetPath]) => [key, `${base}${assetPath}`])
  ));
}

function reviewedAssetBinding(manifest, assetId, expectedUsage) {
  const entry = manifest.assets.find(asset => asset.id === assetId);
  if (!entry || entry.usage !== expectedUsage) {
    throw manifestError("ft_community_visual_asset_binding_invalid", {
      assetId,
      expectedUsage,
      actualUsage: entry?.usage || null
    });
  }
  return Object.freeze({ assetId: entry.id, sha256: entry.sha256 });
}

function reviewedAssetBindingMap(manifest, prefix, keys, expectedUsage) {
  return Object.freeze(Object.fromEntries(keys.map(key => [
    key,
    reviewedAssetBinding(manifest, `${prefix}-${key}`, expectedUsage)
  ])));
}

export function createFtCommunityVisualAssetUrls(publicAssetBase) {
  const base = sanitizeFtCommunityAssetBase(publicAssetBase);
  if (!base) throw new TypeError("ft_community_asset_base_must_be_https");
  return Object.freeze({
    inviteSplash: `${base}${FT_COMMUNITY_VISUAL_ASSET_PATHS.inviteSplash}`,
    guildProfile: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.guildProfile),
    botProfile: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.botProfile),
    webhookBanners: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.webhookBanners),
    onboardingBoard: `${base}${FT_COMMUNITY_VISUAL_ASSET_PATHS.onboardingBoard}`,
    roles: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.roles),
    tags: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.tags),
    categories: urlMap(base, FT_COMMUNITY_VISUAL_ASSET_PATHS.categories)
  });
}

export function createFtCommunityVisualSurfacePlan(
  publicAssetBase,
  manifest,
  v5Manifest = FT_COMMUNITY_V5_VISUAL_MANIFEST
) {
  validateFtCommunityVisualManifest(manifest);
  validateFtCommunityV5VisualManifest(v5Manifest);
  const urls = createFtCommunityVisualAssetUrls(publicAssetBase);
  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    theme: manifest.theme,
    liveMutationApproved: manifest.liveMutationApproved && v5Manifest.liveMutationApproved,
    surfaceContracts: Object.freeze({
      embedTags: Object.freeze({
        status: "planned-only",
        reason: "discord_forum_tags_do_not_accept_remote_bitmap_urls",
        intendedConsumer: "content-studio-preview"
      })
    }),
    consumerContracts: FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS,
    assetBindings: Object.freeze({
      guildProfile: Object.freeze({
        icon: reviewedAssetBinding(v5Manifest, "ft-community-server-icon", EXPECTED_V5_ASSETS["ft-community-server-icon"].usage),
        banner: reviewedAssetBinding(v5Manifest, "ft-community-server-banner", EXPECTED_V5_ASSETS["ft-community-server-banner"].usage),
        inviteSplash: reviewedAssetBinding(v5Manifest, "ft-community-invite-splash", EXPECTED_V5_ASSETS["ft-community-invite-splash"].usage)
      }),
      botProfile: Object.freeze({
        avatar: reviewedAssetBinding(v5Manifest, "fima-bot-avatar", EXPECTED_V5_ASSETS["fima-bot-avatar"].usage),
        banner: reviewedAssetBinding(v5Manifest, "fima-bot-profile-banner", EXPECTED_V5_ASSETS["fima-bot-profile-banner"].usage)
      }),
      webhookBanners: Object.freeze({
        welcome: reviewedAssetBinding(v5Manifest, "ft-community-welcome", EXPECTED_V5_ASSETS["ft-community-welcome"].usage),
        leave: reviewedAssetBinding(v5Manifest, "ft-community-leave", EXPECTED_V5_ASSETS["ft-community-leave"].usage),
        rules: reviewedAssetBinding(v5Manifest, "ft-community-rules", EXPECTED_V5_ASSETS["ft-community-rules"].usage),
        staffTeam: reviewedAssetBinding(v5Manifest, "ft-community-staff", EXPECTED_V5_ASSETS["ft-community-staff"].usage),
        videoTeam: reviewedAssetBinding(v5Manifest, "ft-community-video-team", EXPECTED_V5_ASSETS["ft-community-video-team"].usage),
        announcement: reviewedAssetBinding(v5Manifest, "ft-community-announcement", EXPECTED_V5_ASSETS["ft-community-announcement"].usage),
        leaderboard: reviewedAssetBinding(v5Manifest, "ft-community-leaderboard", EXPECTED_V5_ASSETS["ft-community-leaderboard"].usage),
        booster: reviewedAssetBinding(v5Manifest, "ft-community-booster", EXPECTED_V5_ASSETS["ft-community-booster"].usage)
      }),
      canonicalMessages: Object.freeze({
        onboardingBoard: reviewedAssetBinding(manifest, "onboarding-board", "onboarding")
      }),
      roleIcons: reviewedAssetBindingMap(
        manifest,
        "role",
        Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.roles),
        "role-icon"
      ),
      embedTags: reviewedAssetBindingMap(
        manifest,
        "tag",
        Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.tags),
        "tag"
      ),
      categoryThumbnails: reviewedAssetBindingMap(
        manifest,
        "category",
        Object.keys(FT_COMMUNITY_VISUAL_ASSET_PATHS.categories),
        "category-thumbnail"
      )
    }),
    surfaces: Object.freeze({
      guildProfile: urls.guildProfile,
      botProfile: urls.botProfile,
      webhookBanners: urls.webhookBanners,
      canonicalMessages: Object.freeze({ onboardingBoard: urls.onboardingBoard }),
      roleIcons: urls.roles,
      embedTags: urls.tags,
      categoryThumbnails: urls.categories
    })
  });
}

export function assertFtCommunityVisualMutationApproved(plan) {
  if (!plan || plan.liveMutationApproved !== true) {
    throw manifestError("ft_community_visual_live_mutation_not_approved");
  }
  return plan;
}
