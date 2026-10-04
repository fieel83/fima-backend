import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { fimaBotProfileConfigFromEnv } from "../src/fimaBotProfileSync.js";
import { ftCommunityProfileConfigFromEnv } from "../src/ftCommunityProfileSync.js";
import {
  GUIDE_POSTS,
  PARADISE_COMMUNITY_ASSETS,
  PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS,
  PARADISE_GUIDE_CATEGORY_ASSET_KEYS,
  paradiseCommunityGuideBannerUrl
} from "../src/paradise3a59.js";
import {
  FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS,
  FT_COMMUNITY_VISUAL_MANIFEST,
  FT_COMMUNITY_V5_VISUAL_MANIFEST,
  createFtCommunityManifestProfileAssets,
  createFtCommunityVisualSurfacePlan
} from "../src/ftCommunityVisualAssets.js";

const source = relativePath => readFile(new URL(relativePath, import.meta.url), "utf8");

test("reviewed guild and FIMA Bot identity assets are the profile-sync runtime inputs", () => {
  const reviewed = createFtCommunityManifestProfileAssets();
  const guild = ftCommunityProfileConfigFromEnv({});
  const bot = fimaBotProfileConfigFromEnv({});

  assert.deepEqual(
    {
      assetRoot: guild.assetRoot,
      icon: { asset: guild.iconAsset, sha256: guild.iconSha256 },
      banner: { asset: guild.bannerAsset, sha256: guild.bannerSha256 },
      splash: { asset: guild.splashAsset, sha256: guild.splashSha256 }
    },
    { assetRoot: reviewed.assetRoot, ...reviewed.guild }
  );
  assert.deepEqual(
    {
      assetRoot: bot.assetRoot,
      avatar: { asset: bot.avatarAsset, sha256: bot.avatarSha256 },
      banner: { asset: bot.bannerAsset, sha256: bot.bannerSha256 }
    },
    { assetRoot: reviewed.assetRoot, ...reviewed.bot }
  );
  assert.match(guild.iconAsset, /ft-community-server-icon-v5\.png$/);
  assert.match(guild.bannerAsset, /ft-community-server-banner-v5\.png$/);
  assert.match(guild.splashAsset, /ft-community-invite-splash-v5\.png$/);
  assert.match(bot.avatarAsset, /fima-bot-avatar-v5\.png$/);
  assert.match(bot.bannerAsset, /fima-bot-profile-banner-v5\.png$/);
});

test("the language onboarding board remains wired to the canonical Discord embed", async () => {
  const discordBotSource = await source("../src/discordBot.js");

  assert.match(
    discordBotSource,
    /\.setImage\(PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN\.surfaces\.canonicalMessages\.onboardingBoard\)/
  );
});

test("all eight reviewed webhook banners remain assigned to their active runtime consumers", () => {
  const plan = createFtCommunityVisualSurfacePlan(
    "https://fimamacro.com",
    FT_COMMUNITY_VISUAL_MANIFEST,
    FT_COMMUNITY_V5_VISUAL_MANIFEST
  );

  assert.deepEqual(Object.keys(plan.surfaces.webhookBanners).sort(), [
    "announcement",
    "booster",
    "leaderboard",
    "leave",
    "rules",
    "staffTeam",
    "videoTeam",
    "welcome"
  ]);
  assert.deepEqual(Object.keys(PARADISE_COMMUNITY_ASSETS).sort(), Object.keys(plan.surfaces.webhookBanners).sort());
  assert.deepEqual(
    Object.keys(FT_COMMUNITY_VISUAL_CONSUMER_CONTRACTS.webhookBanners).sort(),
    Object.keys(plan.surfaces.webhookBanners).sort()
  );
  for (const [guide, surface] of [
    ["rules", "rules"],
    ["announcement", "announcement"],
    ["booster", "booster"]
  ]) {
    assert.equal(paradiseCommunityGuideBannerUrl(guide), PARADISE_COMMUNITY_ASSETS[surface]);
  }
});

test("reviewed category thumbnails and all 16 role icons remain wired to verified attachments", async () => {
  const paradiseSource = await source("../src/paradise3a59.js");
  const plan = createFtCommunityVisualSurfacePlan(
    "https://fimamacro.com",
    FT_COMMUNITY_VISUAL_MANIFEST,
    FT_COMMUNITY_V5_VISUAL_MANIFEST
  );

  assert.equal(Object.keys(plan.assetBindings.categoryThumbnails).length, 9);
  assert.equal(Object.keys(plan.assetBindings.roleIcons).length, 16);
  assert.deepEqual(
    [...new Set(Object.values(PARADISE_GUIDE_CATEGORY_ASSET_KEYS))].sort(),
    Object.keys(plan.assetBindings.categoryThumbnails).sort()
  );
  const guideKeys = new Set(GUIDE_POSTS.map(item => item.key));
  for (const [definitionKey, assetKey] of Object.entries(PARADISE_GUIDE_CATEGORY_ASSET_KEYS)) {
    if (definitionKey === "video_team") continue;
    assert.ok(guideKeys.has(definitionKey), `${assetKey} must have a canonical guide consumer`);
  }
  assert.deepEqual(
    [...new Set(Object.values(PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS).map(item => item.assetId))].sort(),
    Object.values(plan.assetBindings.roleIcons).map(item => item.assetId).sort()
  );
  assert.match(
    paradiseSource,
    /function paradiseCommunityGuideThumbnailAttachment\([\s\S]*?expectedUsage: "category-thumbnail"[\s\S]*?attachment: asset\.buffer/
  );
  assert.match(
    paradiseSource,
    /const thumbnail = paradiseCommunityGuideThumbnailAttachment\(definition\.key\);[\s\S]*?payload\.files = \[thumbnail\.file\]/
  );
  assert.match(
    paradiseSource,
    /PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS = Object\.freeze\([\s\S]*?assetBindings\.roleIcons\[assetKey\]/
  );
  assert.match(
    paradiseSource,
    /function reconcileParadiseCommunityExtendedRoleIcons\([\s\S]*?reconcileParadiseCommunityRoleIcons\(guild, \{[\s\S]*?PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS/
  );
});
