import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FT_COMMUNITY_VISUAL_MANIFEST_RELATIVE_PATH,
  FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH,
  FT_COMMUNITY_V4_MANIFEST_RELATIVE_PATH,
  FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS,
  FT_COMMUNITY_VISUAL_THEME,
  assertFtCommunityVisualConsumerCoverage,
  assertFtCommunityVisualMutationApproved,
  createFtCommunityVisualAssetUrls,
  createFtCommunityVisualSurfacePlan,
  inspectFtCommunityVisualAssetReadiness,
  loadVerifiedFtCommunityVisualAsset,
  sanitizeFtCommunityAssetBase,
  validateFtCommunityV5VisualManifest,
  validateFtCommunityV4VisualManifest,
  validateFtCommunityVisualManifest,
  verifyFtCommunityAllVisualAssetPackages,
  verifyFtCommunityV5VisualAssetPackage,
  verifyFtCommunityV4VisualAssetPackage,
  verifyFtCommunityVisualAssetPackage
} from "../src/ftCommunityVisualAssets.js";

async function canonicalManifest() {
  return JSON.parse(await readFile(FT_COMMUNITY_VISUAL_MANIFEST_RELATIVE_PATH, "utf8"));
}

async function canonicalV5Manifest() {
  return JSON.parse(await readFile(FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH, "utf8"));
}

test("FT Community extended visual package verifies all PNG files and atlases", async () => {
  const result = await verifyFtCommunityVisualAssetPackage();
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.theme, FT_COMMUNITY_VISUAL_THEME);
  assert.equal(result.manifest.assets.length, 35);
  assert.equal(result.manifest.sourceAtlases.length, 3);
  assert.equal(result.verifiedAssetCount, 38);
  assert.equal(result.verified.length, 38);
});

test("FT Community v5 identity and webhook package verifies all 13 reviewed PNG files", async () => {
  const result = await verifyFtCommunityV5VisualAssetPackage();
  assert.equal(FT_COMMUNITY_V4_MANIFEST_RELATIVE_PATH, FT_COMMUNITY_V5_MANIFEST_RELATIVE_PATH);
  assert.equal(validateFtCommunityV4VisualManifest, validateFtCommunityV5VisualManifest);
  assert.equal(verifyFtCommunityV4VisualAssetPackage, verifyFtCommunityV5VisualAssetPackage);
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.assetVersion, "v5");
  assert.equal(result.manifest.brand, "FIMA");
  assert.equal(result.manifest.assets.length, 13);
  assert.equal(result.verifiedAssetCount, 13);
  assert.equal(new Set(result.verified.map(entry => entry.id)).size, 13);

  const all = await verifyFtCommunityAllVisualAssetPackages();
  assert.equal(all.extended.verifiedAssetCount, 38);
  assert.equal(all.v5.verifiedAssetCount, 13);
  assert.equal(all.v4, all.v5);
  assert.equal(all.verifiedAssetCount, 51);
});

test("FT Community production visual readiness covers every active and planned-only surface without leaking asset metadata", async () => {
  const result = await inspectFtCommunityVisualAssetReadiness();
  assert.equal(result.ready, true);
  assert.equal(result.code, "ft_community_visual_assets_ready");
  assert.equal(result.verifiedAssetCount, 51);
  assert.equal(result.activeSurfaceCount, 39);
  assert.equal(result.plannedOnlySurfaceCount, 8);
  assert.equal(result.activeConsumerCount, 12);
  assert.equal(result.plannedOnlyConsumerCount, 1);
  assert.deepEqual(result.counts, {
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
  const serialized = JSON.stringify(result);
  for (const forbidden of ["http", "public/", "assets/", "sha256", ".png"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("FT Community visual consumers pin every active runtime surface and planned-only tag", async () => {
  const manifest = await canonicalManifest();
  const plan = createFtCommunityVisualSurfacePlan("https://fimamacro.com", manifest);
  assert.equal(plan.consumerContracts, FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS);
  assert.deepEqual(assertFtCommunityVisualConsumerCoverage(plan), {
    activeSurfaceCount: 39,
    plannedOnlySurfaceCount: 8,
    activeConsumerCount: 12,
    plannedOnlyConsumerCount: 1
  });
  assert.deepEqual(plan.consumerContracts.guildProfile, {
    icon: { status: "active", intendedConsumer: "ft-community-profile-sync" },
    banner: { status: "active", intendedConsumer: "ft-community-profile-sync" },
    inviteSplash: { status: "active", intendedConsumer: "ft-community-profile-sync" }
  });
  assert.deepEqual(plan.consumerContracts.botProfile, {
    avatar: { status: "active", intendedConsumer: "fima-bot-profile-sync" },
    banner: { status: "active", intendedConsumer: "fima-bot-profile-sync" }
  });
  assert.deepEqual(plan.consumerContracts.canonicalMessages.onboardingBoard, {
    status: "active",
    intendedConsumer: "language-onboarding-dm-and-panel"
  });
  assert.deepEqual(plan.consumerContracts.webhookBanners, {
    welcome: { status: "active", intendedConsumer: "member-lifecycle-embed" },
    leave: { status: "active", intendedConsumer: "member-lifecycle-embed" },
    rules: { status: "active", intendedConsumer: "canonical-rules-guide" },
    staffTeam: { status: "active", intendedConsumer: "staff-team-panel" },
    videoTeam: { status: "active", intendedConsumer: "video-team-panel" },
    announcement: { status: "active", intendedConsumer: "canonical-announcement-guide" },
    leaderboard: { status: "active", intendedConsumer: "monthly-and-ranked-leaderboard-panels" },
    booster: { status: "active", intendedConsumer: "canonical-booster-guide" }
  });
  assert.equal(Object.keys(plan.consumerContracts.roleIcons).length, 16);
  assert.equal(Object.keys(plan.consumerContracts.categoryThumbnails).length, 9);
  assert.equal(Object.keys(plan.consumerContracts.embedTags).length, 8);
  for (const contract of Object.values(plan.consumerContracts.embedTags)) {
    assert.deepEqual(contract, {
      status: "planned-only",
      intendedConsumer: "content-studio-preview"
    });
  }

  const missingOnboardingConsumer = structuredClone(plan);
  delete missingOnboardingConsumer.consumerContracts.canonicalMessages.onboardingBoard;
  assert.throws(
    () => assertFtCommunityVisualConsumerCoverage(missingOnboardingConsumer),
    error => error?.code === "ft_community_visual_consumer_surfaces_mismatch"
  );
});

test("FT Community v5 manifest enforces exact identity, usage, paths and review metadata", async () => {
  const wrongBrand = await canonicalV5Manifest();
  wrongBrand.brand = "Paradise";
  assert.throws(
    () => validateFtCommunityV5VisualManifest(wrongBrand),
    error => error?.code === "ft_community_v5_visual_manifest_identity_invalid"
  );

  const wrongUsage = await canonicalV5Manifest();
  wrongUsage.assets[0].usage = "Discord image";
  assert.throws(
    () => validateFtCommunityV5VisualManifest(wrongUsage),
    error => error?.code === "ft_community_v5_visual_manifest_usage_invalid"
  );

  const duplicatePath = await canonicalV5Manifest();
  duplicatePath.assets[1].path = duplicatePath.assets[0].path;
  assert.throws(
    () => validateFtCommunityV5VisualManifest(duplicatePath),
    error => [
      "ft_community_v5_visual_manifest_path_invalid",
      "ft_community_v5_visual_manifest_duplicate_path"
    ].includes(error?.code)
  );

  const missingReview = await canonicalV5Manifest();
  missingReview.assets[0].cropSafe = "";
  assert.throws(
    () => validateFtCommunityV5VisualManifest(missingReview),
    error => error?.code === "ft_community_v5_visual_manifest_review_metadata_invalid"
  );
});

test("FT Community local asset loader returns a verified attachment and isolated Buffer copy", () => {
  const first = loadVerifiedFtCommunityVisualAsset("role-owner", { expectedUsage: "role-icon" });
  assert.equal(first.id, "role-owner");
  assert.equal(first.usage, "role-icon");
  assert.equal(first.attachmentUrl, `attachment://${first.filename}`);
  assert.ok(Buffer.isBuffer(first.buffer));
  assert.ok(first.buffer.length > 0);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.match(first.discordContentHash, /^[a-f0-9]{32}$/);

  const originalByte = first.buffer[0];
  first.buffer[0] ^= 0xff;
  const second = loadVerifiedFtCommunityVisualAsset("role-owner", { expectedUsage: "role-icon" });
  assert.equal(second.buffer[0], originalByte);
  assert.notEqual(first.buffer[0], second.buffer[0]);
});

test("FT Community local asset loader rejects unknown IDs, wrong usage and modified files", async t => {
  assert.throws(
    () => loadVerifiedFtCommunityVisualAsset("missing-reviewed-asset"),
    error => error?.code === "ft_community_visual_asset_id_unknown"
  );
  assert.throws(
    () => loadVerifiedFtCommunityVisualAsset("category-start", { expectedUsage: "role-icon" }),
    error => error?.code === "ft_community_visual_asset_usage_mismatch"
  );

  const canonical = loadVerifiedFtCommunityVisualAsset("role-owner", { expectedUsage: "role-icon" });
  const isolatedRoot = await mkdtemp(path.join(tmpdir(), "fima-ft-asset-test-"));
  t.after(() => rm(isolatedRoot, { recursive: true, force: true }));
  const isolatedPath = path.join(isolatedRoot, canonical.repositoryPath);
  await mkdir(path.dirname(isolatedPath), { recursive: true });
  await copyFile(canonical.repositoryPath, isolatedPath);
  const modified = await readFile(isolatedPath);
  modified[modified.length - 1] ^= 0xff;
  await writeFile(isolatedPath, modified);

  assert.throws(
    () => loadVerifiedFtCommunityVisualAsset("role-owner", {
      repoRoot: isolatedRoot,
      expectedUsage: "role-icon"
    }),
    error => error?.code === "ft_community_visual_asset_digest_mismatch"
  );
});

test("FT Community manifest rejects traversal and duplicate IDs or paths", async () => {
  const traversal = await canonicalManifest();
  traversal.assets[0].path = "../outside.png";
  assert.throws(
    () => validateFtCommunityVisualManifest(traversal),
    error => error?.code === "ft_community_visual_manifest_path_invalid"
  );

  const duplicateId = await canonicalManifest();
  duplicateId.assets[1].id = duplicateId.assets[0].id;
  assert.throws(
    () => validateFtCommunityVisualManifest(duplicateId),
    error => error?.code === "ft_community_visual_manifest_duplicate_id"
  );

  const duplicatePath = await canonicalManifest();
  duplicatePath.assets[1].path = duplicatePath.assets[0].path;
  assert.throws(
    () => validateFtCommunityVisualManifest(duplicatePath),
    error => error?.code === "ft_community_visual_manifest_duplicate_path"
  );
});

test("FT Community asset URLs require HTTPS without userinfo", () => {
  assert.equal(sanitizeFtCommunityAssetBase("http://fimamacro.com"), null);
  assert.equal(sanitizeFtCommunityAssetBase("https://user:pass@fimamacro.com"), null);
  assert.equal(sanitizeFtCommunityAssetBase("javascript:alert(1)"), null);
  assert.equal(sanitizeFtCommunityAssetBase("https://fimamacro.com/assets/?x=1#y"), "https://fimamacro.com/assets");
  assert.throws(() => createFtCommunityVisualAssetUrls("http://fimamacro.com"), TypeError);
  const urls = createFtCommunityVisualAssetUrls("https://fimamacro.com");
  assert.match(urls.inviteSplash, /^https:\/\/fimamacro\.com\/assets\//);
  assert.match(urls.inviteSplash, /discord\/v5\/ft-community-invite-splash-v5\.png$/);
  assert.equal(Object.keys(urls.roles).length, 16);
  assert.equal(Object.keys(urls.tags).length, 8);
  assert.equal(Object.keys(urls.categories).length, 9);
  assert.equal(Object.keys(urls.guildProfile).length, 3);
  assert.equal(Object.keys(urls.botProfile).length, 2);
  assert.equal(Object.keys(urls.webhookBanners).length, 8);
  assert.match(urls.guildProfile.icon, /ft-community-server-icon-v5\.png$/);
  assert.match(urls.botProfile.avatar, /fima-bot-avatar-v5\.png$/);
  assert.match(urls.webhookBanners.rules, /ft-community-rules-v5\.png$/);
  assert.match(urls.roles.creative, /role-creative-v2\.png$/);
  for (const tagUrl of Object.values(urls.tags)) {
    assert.match(tagUrl, /tag-[a-z]+-v2\.png$/);
  }
});

test("FT Community live visual mutation uses the reviewed manifest approval and still rejects unapproved plans", async () => {
  const manifest = await canonicalManifest();
  const approvedPlan = createFtCommunityVisualSurfacePlan("https://fimamacro.com", manifest);
  assert.equal(approvedPlan.liveMutationApproved, true);
  assert.deepEqual(approvedPlan.surfaceContracts.embedTags, {
    status: "planned-only",
    reason: "discord_forum_tags_do_not_accept_remote_bitmap_urls",
    intendedConsumer: "content-studio-preview"
  });
  assert.equal(assertFtCommunityVisualMutationApproved(approvedPlan), approvedPlan);
  assert.match(approvedPlan.surfaces.canonicalMessages.onboardingBoard, /onboarding-board-v2\.png$/);
  assert.match(approvedPlan.surfaces.guildProfile.inviteSplash, /invite-splash-v5\.png$/);
  assert.match(approvedPlan.surfaces.guildProfile.icon, /server-icon-v5\.png$/);
  assert.match(approvedPlan.surfaces.botProfile.banner, /fima-bot-profile-banner-v5\.png$/);
  assert.equal(Object.keys(approvedPlan.surfaces.webhookBanners).length, 8);
  assert.equal(approvedPlan.assetBindings.guildProfile.icon.assetId, "ft-community-server-icon");
  assert.equal(approvedPlan.assetBindings.botProfile.avatar.assetId, "fima-bot-avatar");
  assert.equal(approvedPlan.assetBindings.webhookBanners.booster.assetId, "ft-community-booster");

  const blockedPlan = createFtCommunityVisualSurfacePlan("https://fimamacro.com", {
    ...manifest,
    liveMutationApproved: false
  });
  assert.throws(
    () => assertFtCommunityVisualMutationApproved(blockedPlan),
    error => error?.code === "ft_community_visual_live_mutation_not_approved"
  );
});
