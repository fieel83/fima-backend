import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ChannelType, Collection, PermissionsBitField } from "discord.js";
import {
  applicationQuestionChunks, applyApprovedParadiseChallengeResult, assertUniqueParadiseRobloxIdentity, buildParadiseSafeLogEvent, canAssignRank, canRoleNamesApproveScore, challengeBlockReason, challengedLines, challengeTargetSpots, compareRanks,
  isQuestionAnswerMatch, isFimaCommunityManagedGuild, inspectParadiseCanonicalTextEncoding,
  meetsMinimumChallengeRank, normalizeChallengeGroups,
  canViewParadiseLogEvent, evaluateParadiseContentSafety, localizeParadiseGuide, normalizeParadiseBrandColor, normalizeParadiseChallengeScore, paradiseBrandColorInteger, paradiseGuildContentLanguage, paradiseLogPolicy, PARADISE_GUIDE_TR_COPY, recordParadiseChallengeAudit, recordParadiseLeaderboardAudit,
  paradiseCommandAllowedForMode, paradiseCommands, paradiseRuntimeCommandAccess, paradiseSetupChannelType, paradiseSetupChannelTypeMismatch, PARADISE_CHANNEL_MAPPINGS, PARADISE_CLAN_ROLES, PARADISE_COMMUNITY_ROLES, PARADISE_SETUP_SCHEMAS, PARADISE_VOICE_CHANNEL_NAMES, rankPower, rankToRoleName, shortVerificationCode,
  maskParadiseTranscriptText, normalizeParadiseTicketCategory, paradiseSupportPanelPayload, paradiseSupportTicketControls, paradiseTicketCategoriesForMode, renderParadiseTicketChannelName, transitionParadiseSupportTicket,
  paradiseMainerAnnouncement, sanitizeTemporaryVoiceName, sessionLanguageCopy, trainingAnnouncementMarkdown, transitionParadiseWar, tryoutAnnouncementMarkdown,
  timedAvailabilityLines, paradiseXpPolicy, paradiseApplicationEvidenceRequirement, applicationPrivateReviewTarget,
  createBlacklistAppealPrivateReview, inspectParadiseCommunityLiveEvidenceReadiness, inspectParadiseLiveSecurityReadiness, paradiseAutoSmokeRepairAction,
  paradiseChannelNameMatches, paradiseTextChannelByName,
  paradiseCommunitySmokeEvidenceReadiness,
  cleanupParadiseDesiredChannelDuplicates, cleanupParadiseDesiredRoleDuplicates,
  ensureRole, repairParadiseCategoryVisibilityPermissions, repairParadiseCommunityChannelPermissions,
  legacyPingRoleOptionsForTemplate, localizedHelp, memberHelpPayload,
  paradiseAutoModRuleNamesForTemplate, paradiseGuildMutationLockStatus,
  paradiseHelpCategoryKeysForTemplate, planParadiseAutoModRuleReconciliation,
  planParadiseDesiredRoleDeduplication,
  buildParadiseCommunityOperationalSemantics,
  mergeParadiseCommunityAssetDefaults, paradiseCommunityGuideBannerUrl, paradiseCommunityVideoTeamPanelPayload,
  inspectParadiseRoleIconReadiness, reconcileParadiseCommunityRoleIcons,
  inspectParadiseCommunityExtendedRoleIconReadiness, reconcileParadiseCommunityExtendedRoleIcons,
  isParadiseUnknownChannelError,
  PARADISE_COMMUNITY_ASSETS, PARADISE_COMMUNITY_ROLE_ICONS,
  PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS, PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN,
  paradiseCommunityGuideThumbnailAttachment, paradiseCommunityGuideThumbnailUrl,
  sanitizeParadiseCommunityRoleIconDescriptor, sanitizeParadiseHttpsUrl, sanitizeParadisePublicAssetBase,
  publishParadiseGuidesFromDashboard, syncParadiseMappedPanels,
  rebuildFimaCommunityProduction, rebuildParadiseTestTemplate,
  rolePanelOptionsForTemplate, rolePanelRows, handleRolePanelButton,
  verifyParadiseTemplateStructure, withParadiseGuildMutationLock,
  FIMA_COMMUNITY_PRODUCTION_GUILD_ID, PARADISE_TEST_GUILD_ID
} from "../src/paradise3a59.js";

test("Unknown Channel is the only channel-delete error treated as idempotent", () => {
  assert.equal(isParadiseUnknownChannelError({ code: 10003 }), true);
  assert.equal(isParadiseUnknownChannelError({ rawError: { code: "10003" } }), true);
  assert.equal(isParadiseUnknownChannelError({ cause: { code: 10003 } }), true);
  assert.equal(isParadiseUnknownChannelError({ code: 50013 }), false);
  assert.equal(isParadiseUnknownChannelError({ code: 50001 }), false);
  assert.equal(isParadiseUnknownChannelError(new Error("Unknown Channel")), false);
});

test("canonical Discord rebuild templates are free of mojibake", () => {
  for (const mode of Object.keys(PARADISE_SETUP_SCHEMAS)) {
    const inspection = inspectParadiseCanonicalTextEncoding(mode);
    assert.equal(inspection.ready, true, `${mode}: ${inspection.affected.join(", ")}`);
    assert.equal(inspection.code, "canonical_text_encoding_verified");
    assert.deepEqual(inspection.affected, []);
  }
  const unknown = inspectParadiseCanonicalTextEncoding("missing-template");
  assert.equal(unknown.ready, false);
  assert.equal(unknown.code, "canonical_template_unknown");
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

function canonicalizeExecutionProofValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeExecutionProofValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalizeExecutionProofValue(value[key])])
  );
}

function signedProductionExecutionProof(overrides = {}) {
  const secret = "test-only-production-proof-secret-32-bytes";
  const now = Date.now();
  const unsigned = {
    kind: "fima_production_rebuild_execution_proof",
    schemaVersion: 1,
    planId: "00000000-0000-4000-8000-000000000001",
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    mode: "community",
    backupDigest: "a".repeat(64),
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    ...overrides
  };
  return {
    secret,
    proof: {
      ...unsigned,
      signature: crypto.createHmac("sha256", secret)
        .update(JSON.stringify(canonicalizeExecutionProofValue(unsigned)))
        .digest("hex")
    }
  };
}

function communityLiveEvidenceFixture({
  applicationTitle = "FIMA APPLICATIONS",
  fetchErrorKey = null,
  staffChannelName = "staff-team"
} = {}) {
  const botUserId = "synthetic-bot-user";
  const definitions = [
    ["textActivity", "channel-text", "⌁・text-activity", "message-text", "FIMA · TEXT ACTIVITY"],
    ["voiceActivity", "channel-voice", "⌁・voice-activity", "message-voice", "FIMA · VOICE ACTIVITY"],
    ["activityRewards", "channel-rewards", "⌁・activity-rewards", "message-rewards", "FIMA · ACTIVITY REWARDS"],
    ["application", "channel-application", "⌁・applications", "message-application", applicationTitle],
    ["support", "channel-support", "⌁・support", "message-support", "FIMA SUPPORT"],
    ["moderation", "channel-moderation", "〆・staff-security-logs", "message-moderation", "FIMA MODERATION · SAFE TEST"],
    ["security", "channel-security", "quarantine-review", "message-security", "FIMA SECURITY · LIVE STATUS"],
    ["help", "channel-help", "⌁・faq-help", "message-help", "✦ FIMA MEMBER HELP"],
    ["staff", "channel-staff", staffChannelName, "message-staff", "✦ FIMA STAFF TEAM"]
  ];
  const messages = new Map();
  const channels = definitions.map(([key, channelId, name, messageId, title]) => {
    const message = { id: messageId, channelId, author: { id: botUserId }, embeds: [{ title }] };
    messages.set(key, message);
    return {
      id: channelId,
      name,
      isTextBased: () => true,
      messages: {
        fetch: async requestedId => {
          if (fetchErrorKey === key) throw new Error(`private-fetch-error-${messageId}`);
          const current = messages.get(key);
          return current?.id === requestedId ? current : null;
        }
      }
    };
  });
  const channelByKey = new Map(definitions.map(([key, channelId]) => [
    key,
    channels.find(channel => channel.id === channelId)
  ]));
  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    client: { user: { id: botUserId } },
    channels: {
      cache: new Collection(channels.map(channel => [channel.id, channel])),
      fetch: async channelId => channels.find(channel => channel.id === channelId) || null
    }
  };
  const guildConfig = {
    language: "en",
    channelMappings: {
      level_channel: channelByKey.get("textActivity").id,
      application_ticket_channel: channelByKey.get("application").id,
      support_ticket_channel: channelByKey.get("support").id,
      moderation_requests_channel: channelByKey.get("moderation").id,
      quarantine_review_channel: channelByKey.get("security").id,
      member_help_channel: channelByKey.get("help").id
    },
    smokePanelMessageIds: {
      textActivity: messages.get("textActivity").id,
      voiceActivity: messages.get("voiceActivity").id,
      activityRewards: messages.get("activityRewards").id,
      application: messages.get("application").id,
      support: messages.get("support").id,
      moderation: messages.get("moderation").id,
      security: messages.get("security").id
    },
    commandGuideMessageIds: { community: messages.get("help").id },
    staffTeamMessageId: messages.get("staff").id,
    applicationSettings: { panelTitle: applicationTitle }
  };
  return { guild, guildConfig, messages, channelByKey };
}

test("Decorated Discord channel names resolve by normalized suffix", () => {
  assert.equal(paradiseChannelNameMatches("⟡・top-10", "top-10"), true);
  assert.equal(paradiseChannelNameMatches("〢・PERSONEL-MERKEZİ", "personel-merkezi"), true);
  assert.equal(paradiseChannelNameMatches("ＳＴＡＦＦ－ＴＥＡＭ", "staff-team"), true);
  assert.equal(paradiseChannelNameMatches("top-100", "top-10"), false);

  const category = { id: "category", name: "⟡・top-10", isTextBased: () => false };
  const textChannel = { id: "text", name: "⟡・top-10", isTextBased: () => true };
  const guild = {
    channels: { cache: new Collection([[category.id, category], [textChannel.id, textChannel]]) }
  };
  assert.equal(paradiseTextChannelByName(guild, "top-10"), textChannel);
});

test("Community live evidence readiness requires all nine canonical messages", async () => {
  const fixture = communityLiveEvidenceFixture();
  const result = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  assert.equal(result.liveEvidenceAvailable, true);
  assert.equal(result.ready, true);
  assert.equal(result.verifiedCount, 9);
  assert.equal(result.requiredCount, 9);
});

test("Community live evidence resolves the decorated personnel staff channel and fails closed if its message moved", async () => {
  const fixture = communityLiveEvidenceFixture({ staffChannelName: "〢・personel-merkezi" });
  const ready = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  assert.equal(ready.staffTeamReady, true);
  assert.equal(ready.ready, true);

  fixture.messages.get("staff").channelId = "different-channel";
  const moved = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  assert.equal(moved.staffTeamReady, false);
  assert.equal(moved.ready, false);
});

test("Community live evidence fails closed for deleted, moved, or retitled messages", async () => {
  const deleted = communityLiveEvidenceFixture();
  deleted.messages.delete("support");
  const deletedResult = await inspectParadiseCommunityLiveEvidenceReadiness(deleted.guild, deleted.guildConfig);
  assert.equal(deletedResult.ready, false);
  assert.equal(deletedResult.supportPanelReady, false);

  const moved = communityLiveEvidenceFixture();
  moved.messages.get("moderation").channelId = "different-channel";
  const movedResult = await inspectParadiseCommunityLiveEvidenceReadiness(moved.guild, moved.guildConfig);
  assert.equal(movedResult.ready, false);
  assert.equal(movedResult.moderationPanelReady, false);

  const retitled = communityLiveEvidenceFixture();
  retitled.messages.get("security").embeds[0].title = "UNVERIFIED SECURITY";
  const retitledResult = await inspectParadiseCommunityLiveEvidenceReadiness(retitled.guild, retitled.guildConfig);
  assert.equal(retitledResult.ready, false);
  assert.equal(retitledResult.securityPanelReady, false);
});

test("Community live evidence accepts the sanitized configured application title", async () => {
  const fixture = communityLiveEvidenceFixture({ applicationTitle: "  FIMA   HELPER APPLICATIONS  " });
  fixture.messages.get("application").embeds[0].title = "FIMA HELPER APPLICATIONS";
  const result = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  assert.equal(result.applicationPanelReady, true);
  assert.equal(result.ready, true);
});

test("Community live evidence hides fetch errors and never returns Discord identifiers or contents", async () => {
  const fixture = communityLiveEvidenceFixture({ fetchErrorKey: "help" });
  const result = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  const serialized = JSON.stringify(result);
  assert.equal(result.ready, false);
  assert.equal(result.helpGuideReady, false);
  assert.equal(serialized.includes("message-help"), false);
  assert.equal(serialized.includes("channel-help"), false);
  assert.equal(serialized.includes("private-fetch-error"), false);
});

test("Community live evidence rejects a canonical message posted by another author without leaking identifiers", async () => {
  const fixture = communityLiveEvidenceFixture();
  fixture.messages.get("help").author.id = "synthetic-untrusted-user";
  const result = await inspectParadiseCommunityLiveEvidenceReadiness(fixture.guild, fixture.guildConfig);
  const serialized = JSON.stringify(result);

  assert.equal(result.ready, false);
  assert.equal(result.helpGuideReady, false);
  for (const sensitive of [
    "synthetic-bot-user",
    "synthetic-untrusted-user",
    "message-help",
    "channel-help",
    "FIMA MEMBER HELP"
  ]) {
    assert.equal(serialized.includes(sensitive), false);
  }
});

function communityRoleIconGuild({
  guildId = PARADISE_TEST_GUILD_ID,
  feature = true,
  premiumTier = 0,
  manageRoles = true,
  correct = true,
  roleIcons = PARADISE_COMMUNITY_ROLE_ICONS
} = {}) {
  const calls = [];
  const everyone = {
    id: guildId,
    name: "@everyone",
    managed: false,
    editable: false,
    position: 0,
    icon: null,
    unicodeEmoji: null,
    permissions: new PermissionsBitField()
  };
  const roles = PARADISE_COMMUNITY_ROLES.map((name, index) => {
    const descriptor = roleIcons[name] || null;
    const sanitizedDescriptor = descriptor
      ? sanitizeParadiseCommunityRoleIconDescriptor(descriptor)
      : null;
    const role = {
      id: `role-${index + 1}`,
      name,
      managed: false,
      editable: true,
      position: index + 1,
      icon: correct && sanitizedDescriptor?.kind === "icon"
        ? sanitizedDescriptor.discordContentHash
        : null,
      _iconUrl: null,
      unicodeEmoji: correct ? descriptor?.unicodeEmoji || null : null,
      permissions: new PermissionsBitField(),
      iconURL() {
        return this._iconUrl || null;
      },
      async setUnicodeEmoji(unicodeEmoji) {
        calls.push({ operation: "setUnicodeEmoji", roleName: name, unicodeEmoji });
        this.icon = null;
        this._iconUrl = null;
        this.unicodeEmoji = unicodeEmoji;
        return this;
      },
      async setIcon(iconBuffer) {
        const contentHash = iconBuffer
          ? crypto.createHash("md5").update(iconBuffer).digest("hex")
          : null;
        calls.push({
          operation: "setIcon",
          roleName: name,
          isBuffer: Buffer.isBuffer(iconBuffer),
          bytes: iconBuffer?.length || 0,
          contentHash
        });
        this.icon = contentHash;
        this._iconUrl = null;
        this.unicodeEmoji = null;
        return this;
      },
      async edit(options) {
        calls.push({ operation: "edit", roleName: name, options });
        if (Object.hasOwn(options, "icon")) {
          this.icon = options.icon
            ? crypto.createHash("md5").update(options.icon).digest("hex")
            : null;
          this._iconUrl = null;
        }
        if (Object.hasOwn(options, "unicodeEmoji")) this.unicodeEmoji = options.unicodeEmoji;
        return this;
      }
    };
    return role;
  });
  const cache = new Collection([[everyone.id, everyone], ...roles.map(role => [role.id, role])]);
  const me = {
    id: "fima-bot",
    permissions: new PermissionsBitField(manageRoles ? [PermissionsBitField.Flags.ManageRoles] : []),
    roles: { highest: { position: 1000 } }
  };
  const guild = {
    id: guildId,
    features: feature ? ["ROLE_ICONS"] : [],
    premiumTier,
    members: { me },
    roles: {
      everyone,
      cache,
      fetch: async () => cache
    },
    channels: { cache: new Collection() }
  };
  return {
    guild,
    calls,
    rolesByName: new Map(roles.map(role => [role.name, role]))
  };
}

test("Community role icon manifest covers semantic roles and rejects unsafe descriptors", () => {
  const semanticRoles = PARADISE_COMMUNITY_ROLES.filter(name => !name.includes("━"));
  assert.deepEqual(
    new Set(Object.keys(PARADISE_COMMUNITY_ROLE_ICONS)),
    new Set(semanticRoles)
  );
  assert.deepEqual(
    sanitizeParadiseCommunityRoleIconDescriptor(PARADISE_COMMUNITY_ROLE_ICONS.Owner),
    { kind: "unicode", unicodeEmoji: "👑" }
  );
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ unicodeEmoji: "🧨" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ iconUrl: "https://fimamacro.com/assets/role.png" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ assetId: "missing-role-asset" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ assetId: "category-start" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ assetId: "role-owner", unicodeEmoji: "👑" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({ assetId: "role-owner" }), null);
  assert.equal(sanitizeParadiseCommunityRoleIconDescriptor({
    assetId: "role-owner",
    sha256: "0".repeat(64)
  }), null);
  const reviewedIcon = sanitizeParadiseCommunityRoleIconDescriptor(
    PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS.Owner
  );
  assert.equal(reviewedIcon.kind, "icon");
  assert.equal(reviewedIcon.assetId, "role-owner");
  assert.match(reviewedIcon.sha256, /^[a-f0-9]{64}$/);
  assert.match(reviewedIcon.discordContentHash, /^[a-f0-9]{32}$/);
});

test("Community role icon reconciliation is hard-blocked outside managed community guilds", async () => {
  const fixture = communityRoleIconGuild({ guildId: "unknown-guild", correct: false });
  const result = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(result.status, "blocked");
  assert.equal(result.changed, 0);
  assert.ok(result.blockers.some(blocker => blocker.code === "managed_community_guild_only"));
  assert.equal(fixture.calls.length, 0);
});

test("Production FT Community role icons use the same managed reconciliation path", async () => {
  const fixture = communityRoleIconGuild({
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    correct: true
  });
  const result = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(result.status, "verified");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.readiness.scope, "managed_fima_community_guilds");
});

test("Community role icon preflight fails closed without ROLE_ICONS or sufficient boost tier", async () => {
  const fixture = communityRoleIconGuild({ feature: false, premiumTier: 1, correct: false });
  const result = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some(blocker => blocker.code === "role_icons_feature_unavailable"));
  assert.equal(fixture.calls.length, 0);

  const boosted = communityRoleIconGuild({ feature: false, premiumTier: 2, correct: true });
  const readiness = inspectParadiseRoleIconReadiness(boosted.guild);
  assert.equal(readiness.capability.roleIconsAvailable, true);
  assert.equal(readiness.ready, true);
});

test("Community role icon preflight requires ManageRoles and bot hierarchy", async () => {
  const noPermission = communityRoleIconGuild({ manageRoles: false, correct: false });
  const permissionResult = await reconcileParadiseCommunityRoleIcons(noPermission.guild);
  assert.equal(permissionResult.status, "blocked");
  assert.ok(permissionResult.blockers.some(blocker => blocker.code === "manage_roles_missing"));
  assert.equal(noPermission.calls.length, 0);

  const hierarchy = communityRoleIconGuild({ correct: true });
  const owner = hierarchy.rolesByName.get("Owner");
  owner.unicodeEmoji = null;
  owner.position = 1001;
  const hierarchyResult = await reconcileParadiseCommunityRoleIcons(hierarchy.guild);
  assert.equal(hierarchyResult.status, "blocked");
  assert.ok(hierarchyResult.blockers.some(blocker =>
    blocker.code === "role_icon_target_above_bot" && blocker.roleName === "Owner"
  ));
  assert.equal(hierarchy.calls.length, 0);
});

test("Community role icon reconciliation is idempotent and clears divider icons", async () => {
  const fixture = communityRoleIconGuild({ correct: true });
  const first = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(first.status, "verified");
  assert.equal(first.changed, 0);
  assert.equal(fixture.calls.length, 0);

  const divider = fixture.rolesByName.get(PARADISE_COMMUNITY_ROLES.find(name => name.includes("━")));
  divider.unicodeEmoji = "👑";
  const repaired = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(repaired.status, "verified");
  assert.equal(repaired.changed, 1);
  assert.equal(divider.unicodeEmoji, null);
  assert.equal(fixture.calls.length, 1);

  const repeated = await reconcileParadiseCommunityRoleIcons(fixture.guild);
  assert.equal(repeated.changed, 0);
  assert.equal(fixture.calls.length, 1);
});

test("Community role icon Discord failures retain live error evidence", async () => {
  const fixture = communityRoleIconGuild({ correct: true });
  const owner = fixture.rolesByName.get("Owner");
  const discordFailure = Object.assign(new Error("Missing Permissions"), { code: "50013" });
  owner.unicodeEmoji = null;
  owner.setUnicodeEmoji = async () => { throw discordFailure; };

  await assert.rejects(
    reconcileParadiseCommunityRoleIcons(fixture.guild),
    error => error.code === "role_icon_reconcile_failed"
      && error.roleId === owner.id
      && error.roleName === "Owner"
      && error.discordCode === "50013"
      && error.cause === discordFailure
  );
});

test("Extended FT Community role icons fail closed when the visual plan is not approved", async () => {
  const unapprovedVisualPlan = {
    ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN,
    liveMutationApproved: false
  };
  const fixture = communityRoleIconGuild({
    correct: false,
    roleIcons: PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS
  });
  const readiness = inspectParadiseCommunityExtendedRoleIconReadiness(fixture.guild, {
    visualPlan: unapprovedVisualPlan
  });
  assert.equal(readiness.canReconcile, false);
  assert.ok(readiness.blockers.some(blocker => blocker.code === "ft_community_visual_live_mutation_not_approved"));

  const result = await reconcileParadiseCommunityExtendedRoleIcons(fixture.guild, {
    visualPlan: unapprovedVisualPlan
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.changed, 0);
  assert.deepEqual(fixture.calls, []);
});

test("Approved extended FT Community role icons reconcile once and remain idempotent", async () => {
  const approvedVisualPlan = {
    ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN,
    liveMutationApproved: true
  };
  const fixture = communityRoleIconGuild({
    correct: false,
    roleIcons: PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS
  });

  const first = await reconcileParadiseCommunityExtendedRoleIcons(fixture.guild, {
    visualPlan: approvedVisualPlan,
    roleIconEvidence: {}
  });
  assert.equal(first.status, "verified");
  assert.equal(first.changed, Object.keys(PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS).length);
  assert.equal(fixture.calls.length, Object.keys(PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS).length);
  assert.ok(fixture.calls.every(call => call.operation === "setIcon"));
  assert.ok(fixture.calls.every(call => call.isBuffer === true));
  assert.ok(fixture.calls.every(call => call.bytes > 0));
  assert.ok(fixture.calls.every(call => /^[a-f0-9]{32}$/.test(call.contentHash)));
  assert.equal(Object.keys(first.roleIconEvidence).length, Object.keys(PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS).length);
  for (const [roleId, evidence] of Object.entries(first.roleIconEvidence)) {
    assert.equal(fixture.guild.roles.cache.get(roleId).icon, evidence.iconHash);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  }

  fixture.calls.length = 0;
  const repeated = await reconcileParadiseCommunityExtendedRoleIcons(fixture.guild, {
    visualPlan: approvedVisualPlan,
    roleIconEvidence: first.roleIconEvidence
  });
  assert.equal(repeated.status, "verified");
  assert.equal(repeated.changed, 0);
  assert.deepEqual(fixture.calls, []);
});

test("FT Community guide thumbnails resolve from the approved manifest and fail closed otherwise", () => {
  const expected = PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN.surfaces.categoryThumbnails.start;
  assert.equal(paradiseCommunityGuideThumbnailUrl("rules"), expected);
  assert.equal(paradiseCommunityGuideThumbnailUrl("unknown"), null);

  const unapprovedVisualPlan = {
    ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN,
    liveMutationApproved: false
  };
  assert.match(expected, /^https:\/\//);
  assert.equal(paradiseCommunityGuideThumbnailUrl("rules", unapprovedVisualPlan), null);
  assert.equal(paradiseCommunityGuideThumbnailUrl("unknown", unapprovedVisualPlan), null);

  const attachment = paradiseCommunityGuideThumbnailAttachment("rules");
  assert.equal(attachment.assetId, "category-start");
  assert.match(attachment.sha256, /^[a-f0-9]{64}$/);
  assert.equal(attachment.url, `attachment://${attachment.file.name}`);
  assert.ok(Buffer.isBuffer(attachment.file.attachment));
  assert.ok(attachment.file.attachment.length > 0);
  assert.equal(paradiseCommunityGuideThumbnailAttachment("unknown"), null);
  assert.equal(paradiseCommunityGuideThumbnailAttachment("rules", unapprovedVisualPlan), null);
  assert.equal(paradiseCommunityGuideThumbnailAttachment("rules", {
    ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN,
    assetBindings: {
      ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN.assetBindings,
      categoryThumbnails: {
        ...PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN.assetBindings.categoryThumbnails,
        start: { assetId: "category-start", sha256: "0".repeat(64) }
      }
    }
  }), null);
});

test("Community template verification enforces approved extended bitmap role icon evidence", () => {
  const fixture = communityRoleIconGuild({
    correct: true,
    roleIcons: PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS
  });
  const roleIconEvidence = Object.fromEntries(
    [...fixture.guild.roles.cache.values()]
      .filter(role => PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS[role.name])
      .map(role => {
        const expected = sanitizeParadiseCommunityRoleIconDescriptor(
          PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS[role.name]
        );
        return [role.id, {
          assetId: expected.assetId,
          sha256: expected.sha256,
          iconHash: role.icon
        }];
      })
  );
  const verified = verifyParadiseTemplateStructure(
    fixture.guild,
    PARADISE_SETUP_SCHEMAS.community,
    { roleIconEvidence }
  );
  assert.equal(verified.roleIconReadiness.ready, true);
  assert.deepEqual(verified.roleIconMismatches, []);
  assert.deepEqual(verified.roleIconBlockers, []);

  fixture.rolesByName.get("Owner").icon = null;
  const mismatch = verifyParadiseTemplateStructure(
    fixture.guild,
    PARADISE_SETUP_SCHEMAS.community,
    { roleIconEvidence }
  );
  assert.equal(mismatch.ready, false);
  assert.ok(mismatch.roleIconMismatches.some(item => item.roleName === "Owner"));
});

test("Community setup, missing-only repair, and smoke readiness use extended bitmap role icons", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /await reconcileParadiseCommunityExtendedRoleIcons\(interaction\.guild\)/);
  assert.match(source, /await reconcileParadiseCommunityExtendedRoleIcons\(guild\)/);
  assert.match(source, /inspectParadiseCommunityExtendedRoleIconReadiness\(guild, roleIconOptions\)/);
  assert.equal(
    (source.match(/inspectParadiseCommunityExtendedRoleIconReadiness\(guild\)/g) || []).length,
    2
  );
});

test("Community managed guild scope includes only test and production FT Community", () => {
  assert.equal(isFimaCommunityManagedGuild(PARADISE_TEST_GUILD_ID), true);
  assert.equal(isFimaCommunityManagedGuild(FIMA_COMMUNITY_PRODUCTION_GUILD_ID), true);
  assert.equal(isFimaCommunityManagedGuild("unknown-guild"), false);
  assert.equal(isFimaCommunityManagedGuild(null), false);
});

test("Community branding defaults are HTTPS-only, scoped to managed guilds, and non-mutating", () => {
  const input = {
    welcomeSettings: {
      bannerUrl: "https://cdn.example.test/custom-welcome.png",
      leaveBannerUrl: "http://cdn.example.test/unsafe-leave.png"
    },
    staffTeamBannerUrl: "https://cdn.example.test/custom-staff.png",
    videoTeamBannerUrl: "https://user:secret@cdn.example.test/unsafe-video.png",
    banners: {
      staffTeam: "javascript:alert(1)",
      videoTeam: "https://cdn.example.test/custom-video.png"
    },
    videoTeamMessageId: "video-message-42",
    untouched: { enabled: true }
  };
  const before = structuredClone(input);
  const merged = mergeParadiseCommunityAssetDefaults(input, {
    guildId: PARADISE_TEST_GUILD_ID,
    mode: "community"
  });

  assert.deepEqual(input, before);
  assert.notEqual(merged, input);
  assert.equal(merged.welcomeSettings.bannerUrl, input.welcomeSettings.bannerUrl);
  assert.equal(merged.welcomeSettings.leaveBannerUrl, PARADISE_COMMUNITY_ASSETS.leave);
  assert.equal(merged.staffTeamBannerUrl, input.staffTeamBannerUrl);
  assert.equal(merged.banners.staffTeam, PARADISE_COMMUNITY_ASSETS.staffTeam);
  assert.equal(merged.videoTeamBannerUrl, PARADISE_COMMUNITY_ASSETS.videoTeam);
  assert.equal(merged.banners.videoTeam, input.banners.videoTeam);
  assert.equal(merged.videoTeamMessageId, "video-message-42");
  assert.deepEqual(merged.untouched, { enabled: true });

  const production = mergeParadiseCommunityAssetDefaults(input, {
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    mode: "community"
  });
  assert.equal(production.welcomeSettings.bannerUrl, input.welcomeSettings.bannerUrl);
  assert.equal(production.welcomeSettings.leaveBannerUrl, PARADISE_COMMUNITY_ASSETS.leave);
  assert.equal(production.videoTeamBannerUrl, PARADISE_COMMUNITY_ASSETS.videoTeam);
  assert.deepEqual(
    mergeParadiseCommunityAssetDefaults(input, { guildId: "unknown-guild", mode: "community" }),
    input
  );
  assert.deepEqual(
    mergeParadiseCommunityAssetDefaults(input, { guildId: PARADISE_TEST_GUILD_ID, mode: "clan" }),
    input
  );
});

test("Community canonical image URLs and Video Team payload use the versioned banner assets", () => {
  for (const [key, value] of Object.entries(PARADISE_COMMUNITY_ASSETS)) {
    assert.equal(new URL(value).protocol, "https:", key);
    assert.match(
      value,
      /\/assets\/images\/discord\/v5\/ft-community-(?:welcome|leave|rules|staff|video-team|announcement|leaderboard|booster)-v5\.png$/
    );
  }
  assert.equal(paradiseCommunityGuideBannerUrl("rules"), PARADISE_COMMUNITY_ASSETS.rules);
  assert.equal(paradiseCommunityGuideBannerUrl("challenge_rules"), null);
  assert.equal(paradiseCommunityGuideBannerUrl("announcement"), PARADISE_COMMUNITY_ASSETS.announcement);
  assert.equal(paradiseCommunityGuideBannerUrl("booster"), PARADISE_COMMUNITY_ASSETS.booster);
  const payload = paradiseCommunityVideoTeamPanelPayload({ language: "tr" });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "✦ FIMA VIDEO TEAM");
  assert.equal(embed.image.url, PARADISE_COMMUNITY_ASSETS.videoTeam);
  assert.match(embed.description, /`video-upload-schedule`/);
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([, channels]) => channels.includes("video-hub")));
});

test("Paradise image URL sanitizer rejects insecure, credentialed, script, and malformed values", () => {
  assert.equal(sanitizeParadiseHttpsUrl("https://cdn.example.test/banner.png"), "https://cdn.example.test/banner.png");
  assert.equal(sanitizeParadiseHttpsUrl("http://cdn.example.test/banner.png"), null);
  assert.equal(sanitizeParadiseHttpsUrl("https://user:secret@cdn.example.test/banner.png"), null);
  assert.equal(sanitizeParadiseHttpsUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeParadiseHttpsUrl("not a URL"), null);
});

test("Paradise public asset base is HTTPS-only and strips query or fragment state", () => {
  assert.equal(sanitizeParadisePublicAssetBase("https://cdn.example.test/fima/?cache=1#asset"), "https://cdn.example.test/fima");
  assert.equal(sanitizeParadisePublicAssetBase("http://cdn.example.test"), "https://fimamacro.com");
  assert.equal(sanitizeParadisePublicAssetBase("https://user:secret@cdn.example.test"), "https://fimamacro.com");
  assert.equal(sanitizeParadisePublicAssetBase("javascript:alert(1)"), "https://fimamacro.com");
});

test("Community staff and lifecycle consumers never accept HTTP image URLs", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const staffStart = source.indexOf("async function updateStaffTeamEmbed");
  const staffEnd = source.indexOf("export async function handleParadiseGuildMemberUpdate", staffStart);
  const lifecycleStart = source.indexOf("async function sendMemberLifecycleMessage");
  const lifecycleEnd = source.indexOf("export async function handleParadiseGuildMemberAdd", lifecycleStart);
  assert.ok(staffStart >= 0 && staffEnd > staffStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
  assert.match(source.slice(staffStart, staffEnd), /sanitizeParadiseHttpsUrl/);
  assert.match(source.slice(staffStart, staffEnd), /〆・staff-hub/);
  assert.doesNotMatch(source.slice(staffStart, staffEnd), /\^https\?:/);
  assert.match(source.slice(lifecycleStart, lifecycleEnd), /sanitizeParadiseHttpsUrl/);
  assert.match(source.slice(lifecycleStart, lifecycleEnd), /mergeParadiseCommunityAssetDefaults/);
});

test("community help excludes competitive commands while clan help preserves them", () => {
  const community = localizedHelp("en-US", "community");
  assert.match(community, /FIMA commands/);
  assert.doesNotMatch(community, /profile|rank|leaderboard|verifyroblox|challenge|training|tryout|referee/i);
  assert.match(community, /\/help/);

  const communityCategories = paradiseHelpCategoryKeysForTemplate("community");
  for (const scope of ["profile", "leaderboard", "challenge", "training", "tryout", "referee"]) {
    assert.equal(communityCategories.includes(scope), false);
  }

  const clan = localizedHelp("en-US", "clan");
  assert.match(clan, /\/tryout start/);
  assert.match(clan, /\/training start/);
  assert.doesNotMatch(clan, /\/paradise(?:training|help)/);
  assert.match(clan, /\/challenge create/);
  for (const scope of ["profile", "leaderboard", "challenge", "training", "tryout", "referee"]) {
    assert.equal(paradiseHelpCategoryKeysForTemplate("clan").includes(scope), true);
    assert.equal(paradiseHelpCategoryKeysForTemplate("tsbtr").includes(scope), true);
  }
});

test("template-aware AutoMod names migrate safely without deleting managed duplicates", () => {
  const community = paradiseAutoModRuleNamesForTemplate("community");
  const clan = paradiseAutoModRuleNamesForTemplate("clan");
  assert.equal(community.link, "FIMA Invite & Scam Link Guard");
  assert.equal(community.mention, "FIMA Mention Spam Guard");
  assert.equal(clan.link, "FIMA Bot Invite & Scam Link Guard");
  assert.equal(clan.mention, "FIMA Bot Mention Spam Guard");
  for (const name of [community.link, community.mention, clan.link, clan.mention]) {
    assert.equal(community.managed.includes(name), true);
  }

  const migration = planParadiseAutoModRuleReconciliation([clan.link], "community");
  assert.equal(migration.rules.find(item => item.key === "link").action, "rename");
  const duplicate = planParadiseAutoModRuleReconciliation([community.link, clan.link], "community");
  assert.deepEqual(duplicate.rules.find(item => item.key === "link"), {
    key: "link",
    desiredName: community.link,
    existingName: community.link,
    action: "keep",
    duplicateNames: [clan.link]
  });
});

test("community notification panel preserves existing ping topics and Glads alongside FIMA", () => {
  const options = rolePanelOptionsForTemplate("ping", "community");
  assert.deepEqual(options.map(option => option.role), [
    "Live Notifications", "Upload Notifications", "Giveaway Notifications", "Community Notifications",
    "Poll Notifications", "Anti-Teamer Notifications", "Glads • Europe", "Glads • Asia", "Glads • North America",
    "Product Notifications", "FIMA Updates", "FIMA Macro Updates", "FIMA AI Updates",
    "Fieel Content Notifications", "Tatu Content Notifications", "Event Notifications", "Security Alerts"
  ]);
  assert.equal(options.some(option => /Training|Tryout|Spar|Tournament/.test(option.role)), false);

  const rows = rolePanelRows("ping", "en", "community").map(row => row.toJSON());
  assert.deepEqual(rows.map(row => row.components.length), [5, 5, 5, 2]);
  assert.equal(rows.flatMap(row => row.components).length, 17);
  assert.equal(new Set(rows.flatMap(row => row.components).map(button => button.custom_id)).size, 17);
  // Discord rejects plain geometric symbols as component emoji.
  for (const button of rows.flatMap(row => row.components)) {
    assert.match(button.emoji.name, /\p{Extended_Pictographic}/u);
  }
});

test("clan notification panel retains competitive role choices", () => {
  const roles = rolePanelOptionsForTemplate("ping", "clan").map(option => option.role);
  assert.ok(roles.includes("Training Ping"));
  assert.ok(roles.includes("Tryout Ping"));
  assert.ok(roles.includes("Spar Ping"));
  assert.ok(roles.includes("Tournament Ping"));
});

test("legacy Community ping compatibility cannot create competitive roles", () => {
  assert.deepEqual(legacyPingRoleOptionsForTemplate("community"), [
    { value: "Event", role: "Event Notifications" }
  ]);
  assert.ok(legacyPingRoleOptionsForTemplate("clan").some(option => option.role === "Training Ping"));
});

test("member help uses the visible brand selected by the server template", () => {
  const community = memberHelpPayload([], "en", null, "community").embeds[0].toJSON();
  const clan = memberHelpPayload([], "en", null, "clan").embeds[0].toJSON();
  assert.equal(community.title, "✦ FIMA MEMBER HELP");
  assert.match(community.description, /No FIMA member command/);
  assert.equal(clan.title, "✦ FIMA BOT MEMBER HELP");
  assert.match(clan.description, /No FIMA Bot member command/);
});

test("guild mutation lock is re-entrant for nested work on the same guild", async () => {
  const events = [];
  const result = await withParadiseGuildMutationLock("guild-lock-nested", "outer", async () => {
    const outerStatus = paradiseGuildMutationLockStatus("guild-lock-nested");
    events.push(["outer", outerStatus.active?.operation, outerStatus.active?.depth]);
    return withParadiseGuildMutationLock("guild-lock-nested", "inner", async () => {
      const nestedStatus = paradiseGuildMutationLockStatus("guild-lock-nested");
      events.push(["inner", nestedStatus.active?.operation, nestedStatus.active?.depth]);
      return "nested-result";
    });
  });

  assert.equal(result, "nested-result");
  assert.deepEqual(events, [["outer", "outer", 1], ["inner", "outer", 1]]);
  await new Promise(resolve => queueMicrotask(resolve));
  assert.deepEqual(paradiseGuildMutationLockStatus("guild-lock-nested"), {
    guildId: "guild-lock-nested", locked: false, acquiring: false, waiting: 0, active: null
  });
});

test("guild mutation lock serializes concurrent work and reports waiting operations", async () => {
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const events = [];
  const first = withParadiseGuildMutationLock("guild-lock-serial", "first", async () => {
    events.push("first:start");
    firstEntered.resolve();
    await releaseFirst.promise;
    events.push("first:end");
  });
  await firstEntered.promise;
  const second = withParadiseGuildMutationLock("guild-lock-serial", "second", async () => {
    events.push("second:start");
    events.push("second:end");
  });
  await new Promise(resolve => setImmediate(resolve));

  const queuedStatus = paradiseGuildMutationLockStatus("guild-lock-serial");
  assert.equal(queuedStatus.locked, true);
  assert.equal(queuedStatus.waiting, 1);
  assert.equal(queuedStatus.active?.operation, "first");
  assert.deepEqual(events, ["first:start"]);

  releaseFirst.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("guild mutation queue continues after a failed operation", async () => {
  const failure = withParadiseGuildMutationLock("guild-lock-failure", "failing", async () => {
    throw Object.assign(new Error("expected failure"), { code: "expected_failure" });
  });
  const recovery = withParadiseGuildMutationLock("guild-lock-failure", "recovery", async () => "recovered");

  await assert.rejects(failure, { code: "expected_failure" });
  assert.equal(await recovery, "recovered");
});

test("guild mutation locks allow different guilds to progress in parallel", async () => {
  const releaseA = deferred();
  const enteredA = deferred();
  const first = withParadiseGuildMutationLock("guild-lock-a", "hold", async () => {
    enteredA.resolve();
    await releaseA.promise;
  });
  await enteredA.promise;

  const second = withParadiseGuildMutationLock("guild-lock-b", "parallel", async () => "guild-b-finished");
  assert.equal(await second, "guild-b-finished");
  assert.equal(paradiseGuildMutationLockStatus("guild-lock-a").locked, true);
  releaseA.resolve();
  await first;
});

test("guide publishing and mapped-panel sync serialize on the same guild lease", async () => {
  const guideSendEntered = deferred();
  const releaseGuideSend = deferred();
  const guideChannel = {
    id: "guide-channel",
    name: "bot-commands",
    isTextBased: () => true,
    messages: { fetch: async () => null },
    send: async () => {
      guideSendEntered.resolve();
      await releaseGuideSend.promise;
      return { id: "guide-message", pin: async () => null };
    }
  };
  const guild = {
    id: "guild-guide-panel-serial",
    channels: {
      cache: new Collection([[guideChannel.id, guideChannel]]),
      fetch: async () => null
    }
  };

  const guides = publishParadiseGuidesFromDashboard(guild, "community");
  await guideSendEntered.promise;
  const panels = syncParadiseMappedPanels(guild);
  await new Promise(resolve => setImmediate(resolve));

  const queued = paradiseGuildMutationLockStatus(guild.id);
  assert.equal(queued.active?.operation, "publish_guides");
  assert.equal(queued.waiting, 1);

  releaseGuideSend.resolve();
  const [guideResult, panelResult] = await Promise.all([guides, panels]);
  assert.equal(guideResult.posted, 1);
  assert.equal(guideResult.verified, 0);
  assert.equal(guideResult.ready, false);
  assert.deepEqual(panelResult, { updated: 0, skipped: 1, details: [
    { panel: "challenge_create", status: "skipped", reason: "not_mapped" }
  ] });
});

test("role deduplication prefers member-bearing canonical roles and protects unsafe duplicates", () => {
  const member = { id: "member" };
  const emptyLow = { id: "empty-low", name: "Helper", managed: false, position: 2, members: new Collection() };
  const populated = {
    id: "populated", name: "Helper", managed: false, position: 3,
    members: new Collection([[member.id, member]])
  };
  const populatedHigher = {
    id: "populated-higher", name: "Helper", managed: false, position: 4,
    members: new Collection([[member.id, member]])
  };
  const managed = { id: "managed", name: "Helper", managed: true, position: 1, members: new Collection() };
  const aboveBot = { id: "above-bot", name: "Helper", managed: false, position: 20, members: new Collection() };
  const everyone = { id: "guild-role", name: "Helper", managed: false, position: 0, members: new Collection() };

  const plan = planParadiseDesiredRoleDeduplication(
    [emptyLow, populated, populatedHigher, managed, aboveBot, everyone],
    { everyoneRoleId: everyone.id, botHighestPosition: 10 }
  );

  assert.equal(plan.canonical, populatedHigher);
  assert.deepEqual(
    plan.duplicateActions.map(({ role, protection }) => [role.id, protection]),
    [
      ["empty-low", null],
      ["populated", null],
      ["managed", "managed_role"],
      ["above-bot", "above_bot_hierarchy"],
      ["guild-role", "everyone_role"]
    ]
  );
});

test("role deduplication never chooses a member-heavy role above the bot hierarchy", () => {
  const members = new Collection(Array.from({ length: 20 }, (_, index) => [
    `member-${index}`,
    { id: `member-${index}` }
  ]));
  const safe = { id: "safe", name: "Helper", managed: false, position: 4, members: new Collection() };
  const unsafe = { id: "unsafe", name: "Helper", managed: false, position: 12, members };

  const plan = planParadiseDesiredRoleDeduplication([unsafe, safe], {
    everyoneRoleId: "guild",
    botHighestPosition: 10
  });

  assert.equal(plan.canonical, safe);
  assert.deepEqual(plan.duplicateActions.map(({ role, protection }) => [role.id, protection]), [
    ["unsafe", "above_bot_hierarchy"]
  ]);
});

function duplicateRoleCleanupFixture({ migrationFails = false } = {}) {
  const migrations = [];
  const deleted = [];
  const canonicalMembers = new Collection([
    ["canonical-member-1", { id: "canonical-member-1" }],
    ["canonical-member-2", { id: "canonical-member-2" }]
  ]);
  const duplicateMember = {
    id: "duplicate-member",
    roles: {
      cache: new Collection(),
      add: async role => {
        if (migrationFails) throw Object.assign(new Error("migration failed"), { code: "missing_permissions" });
        migrations.push(["duplicate-member", role.id]);
        return role;
      }
    }
  };
  const canonical = {
    id: "canonical", name: "Helper", managed: false, editable: true, position: 5,
    members: canonicalMembers,
    delete: async () => { deleted.push("canonical"); }
  };
  const duplicate = {
    id: "duplicate", name: "Helper", managed: false, editable: true, position: 4,
    members: new Collection([[duplicateMember.id, duplicateMember]]),
    delete: async () => { deleted.push("duplicate"); }
  };
  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    roles: { cache: new Collection([[canonical.id, canonical], [duplicate.id, duplicate]]) }
  };
  const me = { roles: { highest: { position: 10 } } };
  return { guild, me, migrations, deleted };
}

test("duplicate role cleanup migrates members before deleting and removes the stale cache entry", async () => {
  const fixture = duplicateRoleCleanupFixture();
  const report = await cleanupParadiseDesiredRoleDuplicates(fixture.guild, ["Helper"], fixture.me);

  assert.deepEqual(fixture.migrations, [["duplicate-member", "canonical"]]);
  assert.deepEqual(fixture.deleted, ["duplicate"]);
  assert.equal(fixture.guild.roles.cache.has("duplicate"), false);
  assert.equal(report.memberMigrations, 1);
  assert.deepEqual(report.deleted, [{ id: "duplicate", name: "Helper", canonicalId: "canonical" }]);
  assert.deepEqual(report.failed, []);
});

test("duplicate role cleanup preserves the role when member migration fails", async () => {
  const fixture = duplicateRoleCleanupFixture({ migrationFails: true });
  const report = await cleanupParadiseDesiredRoleDuplicates(fixture.guild, ["Helper"], fixture.me);

  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.guild.roles.cache.has("duplicate"), true);
  assert.equal(report.deleted.length, 0);
  assert.deepEqual(report.failed, [{
    id: "duplicate", name: "Helper", reason: "member_migration_failed", code: "missing_permissions"
  }]);
});

test("normalized duplicate-role cleanup keeps the exact canonical role and protects managed roles", async () => {
  const migrations = [];
  const deleted = [];
  const member = {
    id: "normalized-member",
    roles: {
      cache: new Collection(),
      add: async role => { migrations.push(["normalized-member", role.id]); }
    }
  };
  const canonical = {
    id: "exact", name: "Helper", managed: false, editable: true, position: 3,
    members: new Collection(), delete: async () => { deleted.push("exact"); }
  };
  const normalizedDuplicate = {
    id: "normalized", name: "  helper  ", managed: false, editable: true, position: 5,
    members: new Collection([[member.id, member]]), delete: async () => { deleted.push("normalized"); }
  };
  const managed = {
    id: "managed", name: "HELPER", managed: true, editable: false, position: 1,
    members: new Collection(), delete: async () => { deleted.push("managed"); }
  };
  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    roles: { cache: new Collection([
      [canonical.id, canonical], [normalizedDuplicate.id, normalizedDuplicate], [managed.id, managed]
    ]) }
  };
  const me = { roles: { highest: { position: 10 } } };

  const report = await cleanupParadiseDesiredRoleDuplicates(guild, ["Helper"], me);

  assert.deepEqual(migrations, [[member.id, canonical.id]]);
  assert.deepEqual(deleted, [normalizedDuplicate.id]);
  assert.equal(guild.roles.cache.has(canonical.id), true);
  assert.equal(guild.roles.cache.has(managed.id), true);
  assert.deepEqual(report.protected, [{ id: managed.id, name: "Helper", reason: "managed_role" }]);
});

const setupChannel = ({ id, name, type, parentId = null, rawPosition = 0, deleted, reparented }) => ({
  id,
  name,
  type,
  parentId,
  rawPosition,
  isThread: () => false,
  delete: async () => { deleted.push(id); },
  setParent: async parent => { reparented.push([id, parent]); }
});

test("duplicate channel cleanup deletes duplicate categories and wrong-type channels from cache", async () => {
  const deleted = [];
  const reparented = [];
  const channels = [
    setupChannel({ id: "category", name: "GENERAL", type: ChannelType.GuildCategory, rawPosition: 1, deleted, reparented }),
    setupChannel({ id: "category-copy", name: "GENERAL", type: ChannelType.GuildCategory, rawPosition: 2, deleted, reparented }),
    setupChannel({ id: "chat", name: "chat", type: ChannelType.GuildText, parentId: "category", deleted, reparented }),
    setupChannel({ id: "chat-copy", name: "chat", type: ChannelType.GuildText, parentId: "category-copy", deleted, reparented }),
    setupChannel({ id: "chat-wrong-type", name: "chat", type: ChannelType.GuildVoice, parentId: "category", deleted, reparented })
  ];
  const guild = { id: PARADISE_TEST_GUILD_ID, channels: { cache: new Collection(channels.map(channel => [channel.id, channel])) } };
  const selected = { schema: [["GENERAL", ["chat"], false]] };

  const report = await cleanupParadiseDesiredChannelDuplicates(guild, selected);

  assert.deepEqual(new Set(deleted), new Set(["category-copy", "chat-copy", "chat-wrong-type"]));
  assert.equal(guild.channels.cache.has("category-copy"), false);
  assert.equal(guild.channels.cache.has("chat-copy"), false);
  assert.equal(guild.channels.cache.has("chat-wrong-type"), false);
  assert.deepEqual(reparented, []);
  assert.equal(report.deleted.length, 3);
  assert.deepEqual(report.failed, []);
});

test("normalized channel cleanup preserves mapped canonical channels, reparents them and ignores threads", async () => {
  const deleted = [];
  const reparented = [];
  const category = setupChannel({
    id: "category", name: "GENERAL", type: ChannelType.GuildCategory, deleted, reparented
  });
  const exact = setupChannel({
    id: "chat-exact", name: "chat", type: ChannelType.GuildText, parentId: category.id, deleted, reparented
  });
  const mapped = setupChannel({
    id: "chat-mapped", name: "  CHAT  ", type: ChannelType.GuildText, parentId: "legacy-category", deleted, reparented
  });
  const wrongType = setupChannel({
    id: "chat-wrong", name: "Chat", type: ChannelType.GuildVoice, parentId: category.id, deleted, reparented
  });
  const thread = {
    id: "chat-thread", name: "CHAT", type: ChannelType.PublicThread,
    isThread: () => true, delete: async () => { deleted.push("chat-thread"); }
  };
  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    channels: { cache: new Collection([category, exact, mapped, wrongType, thread].map(channel => [channel.id, channel])) }
  };

  const report = await cleanupParadiseDesiredChannelDuplicates(
    guild,
    { schema: [["GENERAL", ["chat"], false]] },
    { mappedChannelIds: new Set([mapped.id]) }
  );

  assert.deepEqual(new Set(deleted), new Set([exact.id, wrongType.id]));
  assert.deepEqual(reparented, [[mapped.id, category.id]]);
  assert.equal(guild.channels.cache.has(mapped.id), true);
  assert.equal(guild.channels.cache.has(thread.id), true);
  assert.deepEqual(report.reparented, [{ id: mapped.id, name: "chat", parentId: category.id }]);
});

test("duplicate cleanup is hard-blocked outside the fixed test guild", async () => {
  const guild = {
    id: "production-guild",
    roles: { cache: new Collection() },
    channels: { cache: new Collection() }
  };
  const me = { roles: { highest: { position: 10 } } };

  await assert.rejects(
    cleanupParadiseDesiredRoleDuplicates(guild, ["Helper"], me),
    error => error.code === "test_guild_only"
  );
  await assert.rejects(
    cleanupParadiseDesiredChannelDuplicates(guild, { schema: [] }),
    error => error.code === "test_guild_only"
  );
});

test("template verification treats Unicode-normalized desired names as canonical duplicates", () => {
  const deleted = [];
  const reparented = [];
  const category = setupChannel({
    id: "category", name: "  general  ", type: ChannelType.GuildCategory, deleted, reparented
  });
  const chat = setupChannel({
    id: "chat", name: " CHAT ", type: ChannelType.GuildText, parentId: category.id, deleted, reparented
  });
  const everyone = { id: PARADISE_TEST_GUILD_ID, name: "@everyone", managed: false, position: 0 };
  const helper = {
    id: "helper", name: " helper ", managed: false, position: 2,
    permissions: new PermissionsBitField()
  };
  const managed = { id: "managed", name: "HELPER", managed: true, position: 3 };
  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    channels: { cache: new Collection([[category.id, category], [chat.id, chat]]) },
    roles: { everyone, cache: new Collection([[everyone.id, everyone], [helper.id, helper], [managed.id, managed]]) }
  };
  const selected = { roles: ["Helper"], schema: [["GENERAL", ["chat"], false]] };

  const normalized = verifyParadiseTemplateStructure(guild, selected);
  assert.equal(normalized.ready, true);
  assert.deepEqual(normalized.extraChannels, []);
  assert.deepEqual(normalized.extraRoles, []);

  const duplicateRole = { ...helper, id: "helper-copy", name: "HELPER" };
  const duplicateChat = setupChannel({
    id: "chat-copy", name: "chat", type: ChannelType.GuildText, parentId: category.id, deleted, reparented
  });
  guild.roles.cache.set(duplicateRole.id, duplicateRole);
  guild.channels.cache.set(duplicateChat.id, duplicateChat);
  const duplicated = verifyParadiseTemplateStructure(guild, selected);
  assert.deepEqual(duplicated.duplicateDesiredRoles, [{ name: "Helper", count: 2 }]);
  assert.deepEqual(duplicated.duplicateDesiredChannels, [{ name: "chat", type: ChannelType.GuildText, count: 2 }]);
});

test("template verification fails for wrong-type names and extra roles but ignores managed roles", () => {
  const deleted = [];
  const reparented = [];
  const category = setupChannel({
    id: "category", name: "GENERAL", type: ChannelType.GuildCategory, deleted, reparented
  });
  const chat = setupChannel({
    id: "chat", name: "chat", type: ChannelType.GuildText, parentId: category.id, deleted, reparented
  });
  const wrongType = setupChannel({
    id: "chat-voice", name: "chat", type: ChannelType.GuildVoice, parentId: category.id, deleted, reparented
  });
  const desiredRole = { id: "helper", name: "Helper", managed: false, position: 2 };
  const extraRole = { id: "legacy", name: "Legacy", managed: false, position: 3 };
  const managedRole = { id: "managed", name: "FIMA", managed: true, position: 4 };
  const guildRole = { id: "guild", name: "@everyone", managed: false, position: 0 };
  const guild = {
    id: "guild",
    channels: { cache: new Collection([[category.id, category], [chat.id, chat], [wrongType.id, wrongType]]) },
    roles: { cache: new Collection([
      [guildRole.id, guildRole], [desiredRole.id, desiredRole], [extraRole.id, extraRole], [managedRole.id, managedRole]
    ]) }
  };
  const selected = { roles: ["Helper"], schema: [["GENERAL", ["chat"], false]] };

  const result = verifyParadiseTemplateStructure(guild, selected);

  assert.equal(result.ready, false);
  assert.deepEqual(result.extraChannels, [{ id: "chat-voice", name: "chat", type: ChannelType.GuildVoice }]);
  assert.deepEqual(result.extraRoles, [{ id: "legacy", name: "Legacy", position: 3 }]);
  assert.equal(result.extraRoles.some(role => role.id === "managed"), false);
});

test("role permission repair fails closed and preserves Discord failure evidence", async () => {
  const discordFailure = Object.assign(new Error("Missing Permissions"), { code: "50013" });
  const role = {
    id: "admin",
    name: "Admin",
    managed: false,
    editable: true,
    permissions: new PermissionsBitField(),
    setPermissions: async () => { throw discordFailure; }
  };
  const guild = { id: "guild", roles: { cache: new Collection([[role.id, role]]) } };

  await assert.rejects(
    ensureRole(guild, "Admin", true),
    error => error.code === "role_permission_repair_failed"
      && error.roleId === role.id
      && error.discordCode === "50013"
      && error.cause === discordFailure
  );
});

test("category permission repair reports a denied overwrite instead of claiming success", async () => {
  const everyone = { id: "guild" };
  const admin = { id: "admin", name: "Admin", managed: false };
  const category = {
    id: "private",
    name: "PRIVATE",
    permissionOverwrites: {
      edit: async target => {
        if (target.id === admin.id) throw Object.assign(new Error("Missing Permissions"), { code: "50013" });
      }
    }
  };
  const guild = {
    roles: { everyone, cache: new Collection([[everyone.id, everyone], [admin.id, admin]]) }
  };

  await assert.rejects(
    repairParadiseCategoryVisibilityPermissions(guild, category, ["Admin"], true),
    error => error.code === "category_permission_repair_failed"
      && error.categoryId === category.id
      && error.targetId === admin.id
      && error.discordCode === "50013"
  );
});

test("community channel repair enforces read-only Turkish announcements and private voice connect rules", async () => {
  const everyone = { id: "guild", name: "@everyone" };
  const turkish = { id: "turkish", name: "Turkish", managed: false };
  const helper = { id: "helper", name: "Helper", managed: false };
  const guild = {
    roles: {
      everyone,
      cache: new Collection([[everyone.id, everyone], [turkish.id, turkish], [helper.id, helper]])
    }
  };
  const edits = [];
  const channel = {
    id: "announcements",
    type: ChannelType.GuildText,
    permissionOverwrites: {
      edit: async (target, permissions) => edits.push({ target: target.id, permissions })
    }
  };

  await repairParadiseCommunityChannelPermissions(
    guild,
    channel,
    "〆・turkish-announcements",
    "〆・PRIVATE TURKISH"
  );

  assert.deepEqual(edits, [
    { target: everyone.id, permissions: { ViewChannel: false, SendMessages: false } },
    { target: turkish.id, permissions: { ViewChannel: true, SendMessages: false } },
    { target: helper.id, permissions: { ViewChannel: true, SendMessages: true } }
  ]);

  const legacyAnnouncementEdits = edits.slice();
  edits.length = 0;
  await repairParadiseCommunityChannelPermissions(guild, channel, "turkce-duyurular", "TURKISH");
  assert.deepEqual(edits, legacyAnnouncementEdits);

  edits.length = 0;
  channel.type = ChannelType.GuildVoice;
  await repairParadiseCommunityChannelPermissions(
    guild,
    channel,
    "〆・turkish-voice",
    "〆・PRIVATE TURKISH"
  );
  assert.deepEqual(edits, [
    { target: everyone.id, permissions: { ViewChannel: false, Connect: false } },
    { target: turkish.id, permissions: { ViewChannel: true, Connect: true } },
    { target: helper.id, permissions: { ViewChannel: true, Connect: true } }
  ]);
});

test("community channel permission repair fails closed with redacted Discord evidence", async () => {
  const everyone = { id: "guild", name: "@everyone" };
  const channel = {
    id: "voice",
    type: ChannelType.GuildVoice,
    permissionOverwrites: {
      edit: async () => { throw Object.assign(new Error("sensitive Discord response"), { code: "50013" }); }
    }
  };
  const guild = { roles: { everyone, cache: new Collection([[everyone.id, everyone]]) } };

  await assert.rejects(
    repairParadiseCommunityChannelPermissions(
      guild,
      channel,
      "〆・video-voice",
      "〆・PRIVATE VIDEO TEAM"
    ),
    error => error.code === "channel_permission_repair_failed"
      && error.channelId === channel.id
      && error.discordCode === "50013"
  );
});

test("template verification proves exact role permissions and private category visibility", () => {
  const deleted = [];
  const reparented = [];
  const everyone = { id: "guild", name: "@everyone", managed: false, position: 0 };
  const admin = {
    id: "admin",
    name: "Admin",
    managed: false,
    position: 2,
    permissions: new PermissionsBitField([PermissionsBitField.Flags.Administrator])
  };
  const category = setupChannel({
    id: "private", name: "PRIVATE", type: ChannelType.GuildCategory, deleted, reparented
  });
  category.permissionOverwrites = { cache: new Collection([
    [everyone.id, viewOverwrite("deny")],
    [admin.id, viewOverwrite("allow")]
  ]) };
  const chat = setupChannel({
    id: "staff-chat", name: "staff-chat", type: ChannelType.GuildText,
    parentId: category.id, deleted, reparented
  });
  const guild = {
    id: "guild",
    channels: { cache: new Collection([[category.id, category], [chat.id, chat]]) },
    roles: { everyone, cache: new Collection([[everyone.id, everyone], [admin.id, admin]]) }
  };
  const selected = { roles: ["Admin"], schema: [["PRIVATE", ["staff-chat"], true]] };

  const verified = verifyParadiseTemplateStructure(guild, selected);
  assert.equal(verified.ready, true);
  assert.deepEqual(verified.rolePermissionMismatches, []);
  assert.deepEqual(verified.categoryPermissionMismatches, []);

  admin.permissions = new PermissionsBitField();
  category.permissionOverwrites.cache.delete(admin.id);
  const failed = verifyParadiseTemplateStructure(guild, selected);
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.rolePermissionMismatches, [{
    id: admin.id,
    name: "Admin",
    expected: PermissionsBitField.Flags.Administrator.toString(),
    actual: "0"
  }]);
  assert.deepEqual(failed.categoryPermissionMismatches, [{
    categoryId: category.id,
    categoryName: "PRIVATE",
    targetId: admin.id,
    targetName: "Admin",
    expected: "allow",
    actual: "inherit"
  }]);
});

const viewOverwrite = decision => ({
  allow: new PermissionsBitField(decision === "allow" ? [PermissionsBitField.Flags.ViewChannel] : []),
  deny: new PermissionsBitField(decision === "deny" ? [PermissionsBitField.Flags.ViewChannel] : [])
});

function securityReadinessFixture({ layout = "compact", badStaffOverwrite = false, botThreadPermissions = true, panelTitle = "FIMA SECURITY · LIVE STATUS" } = {}) {
  const everyone = { id: "guild" };
  const blacklisted = { id: "blacklisted", name: "BLACKLISTED" };
  const channel = ({ id, name, everyoneView = null, blacklistedView = null, panel = false, privateThreads = false }) => {
    const overwrites = new Collection();
    if (everyoneView) overwrites.set(everyone.id, viewOverwrite(everyoneView));
    if (blacklistedView) overwrites.set(blacklisted.id, viewOverwrite(blacklistedView));
    return {
      id,
      name,
      type: ChannelType.GuildText,
      parent: null,
      parentId: null,
      isTextBased: () => true,
      permissionOverwrites: { cache: overwrites },
      permissionsFor: () => botThreadPermissions
        ? new PermissionsBitField([
            PermissionsBitField.Flags.CreatePrivateThreads,
            PermissionsBitField.Flags.SendMessagesInThreads
          ])
        : null,
      threads: privateThreads ? { create: async () => null } : undefined,
      messages: panel ? {
        fetch: async messageId => messageId === "security-message"
          ? { id: messageId, channelId: id, embeds: [{ title: panelTitle }] }
          : null
      } : undefined
    };
  };

  const channels = layout === "legacy"
    ? [
        channel({ id: "appeal", name: "blacklist-appeal", everyoneView: "deny", blacklistedView: "allow" }),
        channel({ id: "unblacklist", name: "unblacklist", everyoneView: "deny", panel: true }),
        channel({ id: "bail", name: "bail-review", everyoneView: "deny" }),
        channel({ id: "logs", name: "blacklist-logs", everyoneView: "deny" })
      ]
    : [
        channel({ id: "support", name: "◇・destek", privateThreads: true }),
        channel({ id: "review", name: "〢・incelemeler", everyoneView: badStaffOverwrite ? "allow" : "deny", panel: true }),
        channel({ id: "logs", name: "〢・personel-logları", everyoneView: "deny" })
      ];
  const cache = new Collection(channels.map(item => [item.id, item]));
  const guild = {
    id: "guild",
    name: "FT Community",
    roles: { everyone, cache: new Collection([[everyone.id, everyone], [blacklisted.id, blacklisted]]) },
    channels: { cache, fetch: async id => cache.get(id) || null },
    members: { me: { id: "bot" } }
  };
  const mappings = layout === "legacy"
    ? { quarantine_review_channel: "unblacklist", blacklist_logs_channel: "logs" }
    : { blacklist_appeal_channel: "support", quarantine_review_channel: "review", blacklist_logs_channel: "logs" };
  return {
    guild,
    config: { channelMappings: mappings, smokePanelMessageIds: { security: "security-message" } }
  };
}

test("live security readiness recognizes the protected legacy blacklist layout and real panel message", async () => {
  const { guild, config } = securityReadinessFixture({ layout: "legacy" });
  assert.deepEqual(await inspectParadiseLiveSecurityReadiness(guild, config), {
    liveReadinessAvailable: true,
    blacklistedRoleReady: true,
    blacklistPermissionReady: true,
    blacklistLayout: "legacy_dedicated",
    securityPanelReady: true
  });
});

test("live security readiness recognizes compact private-thread appeals and rejects unsafe staff visibility", async () => {
  const safe = securityReadinessFixture();
  assert.deepEqual(await inspectParadiseLiveSecurityReadiness(safe.guild, safe.config), {
    liveReadinessAvailable: true,
    blacklistedRoleReady: true,
    blacklistPermissionReady: true,
    blacklistLayout: "compact_private_thread",
    securityPanelReady: true
  });

  const unsafe = securityReadinessFixture({ badStaffOverwrite: true });
  const unsafeResult = await inspectParadiseLiveSecurityReadiness(unsafe.guild, unsafe.config);
  assert.equal(unsafeResult.blacklistPermissionReady, false);
  assert.equal(unsafeResult.blacklistLayout, null);
  assert.equal(unsafeResult.securityPanelReady, false);
});

test("live security readiness fails closed for a missing compact appeal mapping or unverified panel title", async () => {
  const missing = securityReadinessFixture();
  delete missing.config.channelMappings.blacklist_appeal_channel;
  const missingResult = await inspectParadiseLiveSecurityReadiness(missing.guild, missing.config);
  assert.equal(missingResult.blacklistPermissionReady, false);

  const wrongPanel = securityReadinessFixture({ panelTitle: "PARADISE SECURITY · STALE" });
  const wrongPanelResult = await inspectParadiseLiveSecurityReadiness(wrongPanel.guild, wrongPanel.config);
  assert.equal(wrongPanelResult.blacklistPermissionReady, true);
  assert.equal(wrongPanelResult.securityPanelReady, false);

  const unknownBotPermissions = securityReadinessFixture({ botThreadPermissions: false });
  const unknownBotPermissionsResult = await inspectParadiseLiveSecurityReadiness(
    unknownBotPermissions.guild,
    unknownBotPermissions.config
  );
  assert.equal(unknownBotPermissionsResult.blacklistPermissionReady, false);
  assert.equal(unknownBotPermissionsResult.blacklistLayout, null);
});

test("blacklist appeals add applicant and reviewer before sending the first private-thread message", async () => {
  const added = [];
  let sent = false;
  const thread = {
    id: "private-appeal",
    type: ChannelType.PrivateThread,
    members: { add: async id => { added.push(id); return { id }; } },
    send: async payload => {
      sent = true;
      assert.deepEqual(payload, { content: "appeal" });
      return { id: "first-message" };
    },
    delete: async () => true
  };
  const result = await createBlacklistAppealPrivateReview({
    guild: { id: "guild", ownerId: "owner", members: { cache: new Collection() } },
    parentChannel: {
      id: "support",
      type: ChannelType.GuildText,
      threads: { create: async options => {
        assert.equal(options.type, ChannelType.PrivateThread);
        assert.equal(options.invitable, false);
        return thread;
      } }
    },
    applicantId: "applicant",
    applicantName: "Applicant Name",
    reviewerIds: ["reviewer"],
    messagePayload: { content: "appeal" }
  });
  assert.equal(sent, true);
  assert.deepEqual(added, ["applicant", "owner", "reviewer"]);
  assert.equal(result.channel, thread);
  assert.equal(result.message.id, "first-message");
  assert.equal(result.privateThread, true);
});

test("blacklist appeal creation fails closed when thread creation or membership fails", async () => {
  const guild = { id: "guild", ownerId: "owner", members: { cache: new Collection() } };
  await assert.rejects(createBlacklistAppealPrivateReview({
    guild,
    parentChannel: { id: "support", type: ChannelType.GuildText, threads: { create: async () => { throw new Error("denied"); } } },
    applicantId: "applicant",
    messagePayload: { content: "appeal" }
  }), { code: "blacklist_appeal_private_review_unavailable", statusCode: 503 });

  let deleted = 0;
  const thread = {
    id: "private-appeal",
    type: ChannelType.PrivateThread,
    members: { add: async () => null },
    send: async () => ({ id: "must-not-send" }),
    delete: async () => { deleted += 1; }
  };
  await assert.rejects(createBlacklistAppealPrivateReview({
    guild,
    parentChannel: { id: "support", type: ChannelType.GuildText, threads: { create: async () => thread } },
    applicantId: "applicant",
    messagePayload: { content: "appeal" }
  }), { code: "blacklist_appeal_private_review_unavailable", statusCode: 503 });
  assert.equal(deleted, 1, "the orphan private thread is removed");
});

test("blacklist appeal delivery removes orphan message and thread when the first message is invalid", async () => {
  let messageDeleted = 0;
  let threadDeleted = 0;
  const orphanMessage = { delete: async () => { messageDeleted += 1; } };
  const thread = {
    id: "private-appeal",
    type: ChannelType.PrivateThread,
    members: { add: async id => ({ id }) },
    send: async () => orphanMessage,
    delete: async () => { threadDeleted += 1; }
  };
  await assert.rejects(createBlacklistAppealPrivateReview({
    guild: { id: "guild", ownerId: "owner", members: { cache: new Collection() } },
    parentChannel: { id: "support", type: ChannelType.GuildText, threads: { create: async () => thread } },
    applicantId: "applicant",
    messagePayload: { content: "appeal" }
  }), { code: "blacklist_appeal_private_review_unavailable", statusCode: 503 });
  assert.equal(messageDeleted, 1);
  assert.equal(threadDeleted, 1);
});

test("application evidence requirements default safely and allow explicit required questions", () => {
  const settings = {
    evidenceRequirements: {
      helper: { experience: "required", availability: "optional", motivation: "unexpected" }
    }
  };
  assert.equal(paradiseApplicationEvidenceRequirement(settings, "helper", "experience"), "required");
  assert.equal(paradiseApplicationEvidenceRequirement(settings, "helper", "availability"), "optional");
  assert.equal(paradiseApplicationEvidenceRequirement(settings, "helper", "motivation"), "optional");
  assert.equal(paradiseApplicationEvidenceRequirement({}, "helper", "experience"), "optional");
});

test("website applications fail closed unless a real private review thread is created", async () => {
  await assert.rejects(
    applicationPrivateReviewTarget({ id: "review", type: ChannelType.GuildText }, "application-id", "helper"),
    { code: "application_private_review_unavailable", statusCode: 503 }
  );
  await assert.rejects(
    applicationPrivateReviewTarget({
      id: "review",
      type: ChannelType.GuildText,
      threads: { create: async () => null }
    }, "application-id", "helper"),
    { code: "application_private_review_unavailable", statusCode: 503 }
  );
  const thread = { id: "private-thread", send: async () => ({ id: "message" }) };
  const target = await applicationPrivateReviewTarget({
    id: "review",
    type: ChannelType.GuildText,
    threads: { create: async options => {
      assert.equal(options.type, ChannelType.PrivateThread);
      assert.equal(options.invitable, false);
      return thread;
    } }
  }, "application-id", "helper");
  assert.deepEqual(target, {
    channel: thread,
    parentChannelId: "review",
    privateThread: true
  });
});

test("score approval excludes Trial Referee and Referee by default", () => {
  assert.equal(canRoleNamesApproveScore(["Trial Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Experienced Referee"]), true);
  assert.equal(canRoleNamesApproveScore(["Referee Manager"]), true);
  assert.equal(canRoleNamesApproveScore([], true), true);
});

test("approved challenge results validate first and commit leaderboard, ticket and availability together", () => {
  const input = {
    config: {}, guildConfigs: { guild: { challenge: { cooldownDays: 3, immunityDays: 3, top10CooldownDays: 7 } } },
    leaderboard: {}, leaderboards: { guild: {
      winner: { spot: 12, wins: 3, losses: 1 },
      loser: { spot: 11, wins: 4, losses: 2 }
    } },
    pendingChallenges: {
      ticket: { guildId: "guild", status: "open", challengerId: "winner", opponentId: "loser", challengerSpot: 12, opponentSpot: 11 },
      submission: { guildId: "guild", status: "pending", ticketId: "ticket", winnerId: "winner", loserId: "loser", winnerSpot: 12, loserSpot: 11, score: "10-4", refereeId: "ref" }
    },
    staffActivity: {}
  };
  const result = applyApprovedParadiseChallengeResult(input, {
    submissionId: "submission", approvedBy: "manager", now: Date.UTC(2026, 6, 12, 12, 0, 0)
  });
  assert.equal(input.pendingChallenges.ticket.status, "open", "input remains untouched if a caller needs to abort");
  assert.equal(result.state.pendingChallenges.ticket.status, "closed");
  assert.equal(result.state.pendingChallenges.submission.status, "approved");
  assert.equal(result.state.leaderboards.guild.winner.wins, 4);
  assert.equal(result.state.leaderboards.guild.loser.losses, 3);
  assert.match(String(result.state.leaderboards.guild.winner.availability.immunityUntil), /^178/);
  assert.match(String(result.state.leaderboards.guild.loser.availability.cooldownUntil), /^178/);
  assert.equal(result.state.staffActivity.ref.referee.length, 1);
  assert.equal(result.state.challengeAudits.guild[0].action, "approved");
  assert.equal(result.state.challengeAudits.guild[0].ticketId, "ticket");
});

test("challenge result rejects a closed or mismatched ticket without changing state", () => {
  const input = {
    config: {}, guildConfigs: { guild: {} }, leaderboard: {}, leaderboards: { guild: {} }, staffActivity: {},
    pendingChallenges: {
      ticket: { guildId: "guild", status: "closed", challengerId: "winner", opponentId: "loser" },
      submission: { guildId: "guild", status: "pending", ticketId: "ticket", winnerId: "winner", loserId: "loser", score: "3-1", refereeId: "ref" }
    }
  };
  assert.throws(() => applyApprovedParadiseChallengeResult(input, { submissionId: "submission", approvedBy: "manager" }), {
    code: "challenge_ticket_not_open"
  });
  assert.equal(input.pendingChallenges.submission.status, "pending");
});

test("leaderboard manual audit is guild-scoped and bounded", () => {
  const state = { leaderboardHistory: {} };
  recordParadiseLeaderboardAudit(state, { guildId: "guild-a", action: "move", actorId: "staff-a", metadata: { userId: "user", rank: 8 }, now: "2026-07-12T12:00:00.000Z" });
  recordParadiseLeaderboardAudit(state, { guildId: "guild-b", action: "clear", actorId: "staff-b", metadata: { previousCount: 3 }, now: "2026-07-12T12:01:00.000Z" });
  assert.equal(state.leaderboardHistory["guild-a"].length, 1);
  assert.equal(state.leaderboardHistory["guild-a"][0].metadata.rank, 8);
  assert.equal(state.leaderboardHistory["guild-b"][0].action, "clear");
});

test("challenge approval audit is guild-scoped and redacts sensitive metadata", () => {
  const state = { challengeAudits: {} };
  recordParadiseChallengeAudit(state, {
    guildId: "guild", action: "denied", actorId: "manager", submissionId: "submission", ticketId: "ticket",
    metadata: { note: "FIMA-ABCD-EFGH-IJKL" }, now: "2026-07-12T12:00:00.000Z"
  });
  assert.equal(state.challengeAudits.guild[0].action, "denied");
  assert.doesNotMatch(JSON.stringify(state.challengeAudits.guild[0]), /FIMA-ABCD/);
});

test("Paradise log envelopes classify events and redact private credential material", () => {
  const event = buildParadiseSafeLogEvent({
    guildId: "guild", type: "payment_license", title: "License check", correlationId: "case-1",
    description: "person@example.test FIMA-ABCD-EFGH-IJKL mfa.abcdefghijklmnopqrstuv https://discord.com/api/webhooks/123/secret",
    metadata: { customerEmail: "person@example.test", hwid: "device-123456789", allowed: true }
  });
  assert.equal(event.type, "payment_license");
  assert.equal(event.correlationId, "case-1");
  assert.doesNotMatch(`${event.description} ${JSON.stringify(event.metadata)}`, /person@example\.test|FIMA-ABCD|mfa\.abcdefghijklmnopqrstuv|webhooks\/123|device-123456789/);
  assert.equal(event.metadata.masked, "[masked]");
  assert.equal(event.metadata.allowed, true);
});

test("Paradise log policy enforces bounded retention and private viewer scopes", () => {
  assert.deepEqual(paradiseLogPolicy({ logSettings: { retentionDays: 9000, viewerScope: "invalid" } }, "ticket"), {
    retentionDays: 3650, viewerScope: "staff"
  });
  const event = buildParadiseSafeLogEvent({ guildId: "guild", type: "security", viewerScope: "managers" });
  assert.equal(canViewParadiseLogEvent({ event, roleKeys: ["moderator"] }), false);
  assert.equal(canViewParadiseLogEvent({ event, roleKeys: ["manager"] }), true);
  assert.equal(canViewParadiseLogEvent({ event: { ...event, viewerScope: "owners" }, roleKeys: ["manager"] }), false);
  assert.equal(canViewParadiseLogEvent({ event: { ...event, viewerScope: "owners" }, roleKeys: ["owner"] }), true);
});

test("invite, scam and unsafe attachment policy does not let trusted roles bypass high-risk content", () => {
  assert.deepEqual(evaluateParadiseContentSafety({ content: "join discord.gg/example", config: { blockInvites: true } }), {
    blocked: true, reason: "invite_not_approved", hasInvite: true, highRiskText: false, riskyAttachment: false, trustedRolePresent: false
  });
  assert.equal(evaluateParadiseContentSafety({
    content: "claim reward at discord.gg/example", roleKeys: ["link_trusted"], config: { blockInvites: false }
  }).blocked, true);
  assert.equal(evaluateParadiseContentSafety({
    attachments: [{ name: "proof.svg", contentType: "image/svg+xml" }], roleKeys: ["media_approved"]
  }).reason, "unsafe_attachment");
  assert.equal(evaluateParadiseContentSafety({
    content: "discord.gg/official", roleKeys: ["invite_approved"], config: { blockInvites: true }
  }).blocked, false);
});

test("daily moderation utilities are bounded, audited and routed through the moderation handlers", async () => {
  const mod = paradiseCommands().map(command => command.toJSON()).find(command => command.name === "mod");
  const names = mod.options.map(option => option.name);
  for (const name of ["purge", "slowmode", "nick-reset", "timeout-remove", "warn-remove", "case-edit", "case-revoke"]) assert.ok(names.includes(name), `missing /mod ${name}`);
  const channel = paradiseCommands().map(command => command.toJSON()).find(command => command.name === "channel");
  assert.deepEqual(channel.options.map(option => option.name), ["lock", "unlock", "hide", "unhide"]);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /async function handleChannelCommand/);
  assert.match(source, /if \(sub === "purge"\)/);
  assert.match(source, /Manage Messages permission required for purge/);
  assert.match(source, /Moderation case updated/);
  assert.match(source, /if \(interaction\.commandName === "channel"\)/);
});

test("score approval routes configured Discord role IDs through the shared Paradise RBAC vocabulary", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /paradiseRoleKeysForMember/);
  assert.match(source, /PARADISE_PERMISSIONS\.REFEREE_APPROVE/);
  assert.match(source, /mappings: guildConfig\.roleMappings/);
});

test("challenge autowin uses shared referee-work RBAC instead of a separate role-name check", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /async function memberHasParadisePermission/);
  assert.match(source, /async function canWorkReferee/);
  assert.match(source, /if \(!await canWorkReferee\(interaction\.member\)\)/);
  assert.doesNotMatch(source, /const hasRefereeRole/);
});

test("Paradise support panel has state-aware transcript-first ticket controls", async () => {
  const launcher = paradiseSupportPanelPayload(0).components[0].toJSON();
  assert.equal(launcher.components[0].custom_id, "paradise_support_category");
  assert.ok(launcher.components[0].options.some(option => option.value === "payment_license"));
  const open = paradiseSupportTicketControls("ticket-id", "open")[0].toJSON().components;
  assert.deepEqual(open.map(item => item.custom_id), [
    "paradise_support_claim:ticket-id",
    "paradise_support_close:ticket-id"
  ]);
  const claimed = paradiseSupportTicketControls("ticket-id", "claimed")[0].toJSON().components;
  assert.deepEqual(claimed.map(item => item.custom_id), [
    "paradise_support_unclaim:ticket-id",
    "paradise_support_close:ticket-id"
  ]);
  const closed = paradiseSupportTicketControls("ticket-id", "closed")[0].toJSON().components;
  assert.deepEqual(closed.map(item => item.custom_id), [
    "paradise_support_reopen:ticket-id",
    "paradise_support_delete:ticket-id"
  ]);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /paradise_support_delete_confirm:/);
  assert.match(source, /saveParadiseSupportTranscript\(interaction\.guild, interaction\.channel, locked, "delete"\)/);
  assert.match(source, /action: "transcript_failed"/);
  assert.match(source, /await interaction\.channel\.delete\("FIMA Bot transcript-first support ticket deletion"\)/);
  assert.match(source, /const canDelete = canApproveModeration\(interaction\.member\)/);
  assert.match(source, /\["support_logs_channel", "Private support ticket logs"\]/);
  assert.doesNotMatch(source.slice(source.indexOf("export function paradiseSupportTicketControls"), source.indexOf("function supportTicketStatusLabel")), /paradise_support_transcript/);
});

test("ticket categories remain template-scoped and lifecycle names never expose private account data", () => {
  assert.deepEqual(paradiseTicketCategoriesForMode("community").map(([id]) => id), ["support", "payment_license", "app_problem", "application", "security_report", "other"]);
  assert.equal(normalizeParadiseTicketCategory("community", "payment_license"), "payment_license");
  assert.equal(normalizeParadiseTicketCategory("clan", "payment_license"), null);
  assert.equal(normalizeParadiseTicketCategory("tsbtr", "leaderboard_profile"), "leaderboard_profile");
  const name = renderParadiseTicketChannelName({
    format: "{status}-{category}-{username}-{number}", status: "closed", category: "payment_license",
    username: "Fieel@example.test", number: 42
  });
  assert.equal(name, "closed-payment_license-fieel-example-test-42");
  assert.ok(name.length <= 90);
  assert.doesNotMatch(name, /@|\./);
});

test("canonical mainer copy uses a safe fallback and a localized stored-message design", () => {
  const missing = paradiseMainerAnnouncement({ language: "tr" });
  assert.match(missing, /henüz ayarlanmadı/i);
  assert.doesNotMatch(missing, /CODE_HERE|Not configured/i);
  const configured = paradiseMainerAnnouncement({ code: "PMSBXHWM", region: "EU", mainChannelId: "123", language: "tr" });
  assert.match(configured, /Mainer kodumuz hazır/);
  assert.match(configured, /`PMSBXHWM`/);
  assert.match(configured, /<#123>/);
  assert.match(configured, /\/mainclan code:PMSBXHWM region:EU/);
  const command = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "mainer");
  assert.ok(command.options.some(option => option.name === "panel"));
  assert.ok(command.options.find(option => option.name === "set").options.some(option => option.name === "main-channel"));
});

test("war and spar state is guild-scoped, audited and requires safe evidence before completion", () => {
  const open = { id: "war-1", guildId: "guild-a", kind: "war", status: "open", auditTrail: [] };
  const assigned = transitionParadiseWar(open, { action: "assign_referee", actorId: "manager", refereeId: "referee", now: "2026-07-12T12:00:00.000Z" });
  const scored = transitionParadiseWar(assigned, { action: "score", actorId: "referee", score: "3-1", now: "2026-07-12T12:01:00.000Z" });
  const completed = transitionParadiseWar(scored, { action: "result", actorId: "manager", winner: "paradise", proof: "https://discord.com/channels/1/2/3", now: "2026-07-12T12:02:00.000Z" });
  assert.equal(open.status, "open");
  assert.equal(completed.status, "completed");
  assert.equal(completed.score, "3-1");
  assert.equal(completed.auditTrail.length, 3);
  assert.throws(() => transitionParadiseWar(scored, { action: "result", actorId: "manager", winner: "paradise", proof: "http://unsafe.example" }), { code: "war_result_invalid" });
  assert.throws(() => transitionParadiseWar(completed, { action: "cancel", actorId: "manager", reason: "late" }), { code: "war_not_open" });
  const commands = paradiseCommands().map(item => item.toJSON());
  assert.ok(commands.some(command => command.name === "spar"));
  assert.deepEqual(commands.find(command => command.name === "war").options.map(option => option.name), ["create", "referee", "score", "result", "cancel", "logs"]);
  assert.equal(paradiseCommandAllowedForMode("war", "community"), false);
});

test("XP defaults grant separate text progression roles without weakening link or scam safety", async () => {
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("Media Trusted"));
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("Link Trusted"));
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("Text Level 5"));
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("Voice Level 5"));
  const defaults = paradiseXpPolicy();
  assert.equal(defaults.roleRewards["5"], "Text Level 5");
  assert.equal(defaults.roleRewards["10"], "Text Level 10");
  const overridden = paradiseXpPolicy({ xpSettings: { chatCooldownSeconds: 1, levelUpDeleteSeconds: 99999, roleRewards: { "5": "Manual Media" } } });
  assert.equal(overridden.chatCooldownSeconds, 15);
  assert.equal(overridden.levelUpDeleteSeconds, 3600);
  assert.equal(overridden.roleRewards["5"], "Manual Media");
  assert.equal(overridden.roleRewards["10"], "Text Level 10");
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /ensureCommunityProgressionPermissions/);
  assert.match(source, /AttachFiles: mediaChannel \? true : false/);
  assert.match(source, /EmbedLinks: false/);
  assert.match(source, /Trusted media\/link roles intentionally never clear high-risk content/);
});

test("support ticket transitions prevent stale actions and keep transcript failure retryable", () => {
  const base = { id: "ticket-1", status: "open", auditTrail: [] };
  const claimed = transitionParadiseSupportTicket(base, { action: "claim", actorId: "staff-1", now: "2026-07-12T12:00:00.000Z" });
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.claimedBy, "staff-1");
  const closed = transitionParadiseSupportTicket(claimed, { action: "close", actorId: "staff-1" });
  assert.equal(closed.status, "closed");
  const pending = transitionParadiseSupportTicket(closed, { action: "begin_delete", actorId: "admin-1" });
  const failed = transitionParadiseSupportTicket(pending, { action: "transcript_failed", actorId: "admin-1" });
  assert.equal(failed.status, "transcript_failed");
  assert.deepEqual(paradiseSupportTicketControls("ticket-id", failed.status)[0].toJSON().components.map(item => item.custom_id), [
    "paradise_support_reopen:ticket-id", "paradise_support_delete:ticket-id"
  ]);
  assert.throws(() => transitionParadiseSupportTicket(base, { action: "reopen", actorId: "staff-1" }), { code: "support_ticket_invalid_transition" });
  assert.throws(() => transitionParadiseSupportTicket(pending, { action: "close", actorId: "staff-1" }), { code: "support_ticket_invalid_transition" });
});

test("ticket slash commands exist and dispatch to the same lifecycle transition gate", () => {
  const command = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "ticket");
  assert.ok(command);
  const names = command.options.map(option => option.name);
  for (const required of ["open", "info", "claim", "unclaim", "close", "reopen", "delete", "rename", "add", "remove", "escalate", "transcript", "panel", "config", "repair", "logs"]) {
    assert.ok(names.includes(required), `missing /ticket ${required}`);
  }
});

test("support ticket heading and state text follow the configured guild language", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /language === "tr" \? `DESTEK TICKETI — \$\{status\}` : `SUPPORT TICKET — \$\{status\}`/);
  assert.match(source, /if \(language === "en"\) \{/);
  assert.match(source, /return "CLOSED"/);
});

test("Paradise support transcripts mask common secrets before staff storage", () => {
  const masked = maskParadiseTranscriptText("mail person@example.com FIMA-ABCD-EFGH-IJKL mfa.abcdefghijklmnopqrstuv aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccc password @everyone");
  assert.doesNotMatch(masked, /person@example\.com|FIMA-ABCD|mfa\.abcdefghijklmnopqrstuv|@everyone/);
  assert.match(masked, /\[masked-email\].*\[masked-license-key\].*\[masked-token\].*@ blocked/);
});

test("test-guild smoke includes transcript-first close and reopen coverage", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /runParadiseSupportTicketLifecycleSmoke/);
  assert.match(source, /saveParadiseSupportTranscript\(guild, channel, record, "smoke-close"\)/);
  assert.match(source, /closedThenReopened: true/);
  assert.match(source, /supportTicketTranscriptReady/);
});

test("test-guild session lifecycle replies to the original Markdown announcement", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const smokeReply = async \(message, content, code\)/);
  assert.match(source, /await smokeReply\(training, `\$\{trainingCopy\.lockedReply\}/);
  assert.match(source, /await smokeReply\(tryout, `\$\{tryoutCopy\.lockedReply\}/);
  assert.match(source, /function tryoutAnnouncementMarkdown/);
  assert.match(source, /function trainingAnnouncementMarkdown/);
  assert.match(source, /trainingPlainMarkdown/);
  assert.match(source, /tryoutPlainMarkdown/);
});

test("training and tryout announcements follow the selected language and have no branding footer", () => {
  const trainingTr = trainingAnnouncementMarkdown({
    language: "tr", server: "Frankfurt, Germany", format: "First To 3", characters: "Saitama, Garou, Metal Bat",
    rules: ["LH yok", "Wall yok"], link: "https://example.test/private", hoster: "@hoster"
  });
  const tryoutTr = tryoutAnnouncementMarkdown({
    language: "tr", server: "Frankfurt, Germany", link: "https://example.test/private", hoster: "@hoster"
  });
  const trainingEn = trainingAnnouncementMarkdown({
    language: "en", server: "Frankfurt, Germany", format: "First To 3", characters: "Saitama", rules: ["No LH"], link: "https://example.test/private", hoster: "@hoster"
  });
  assert.match(trainingTr, /# ANTRENMAN[\s\S]*◇ Sunucu:[\s\S]*◇ Kurallar:[\s\S]*• LH yok/);
  assert.match(tryoutTr, /# DENEME AÇIK[\s\S]*◇ Sunucu:[\s\S]*◇ Değerlendirme:[\s\S]*◇ Kurallar:/);
  assert.match(trainingEn, /# TRAINING[\s\S]*◇ Server:[\s\S]*◇ Rules:/);
  assert.doesNotMatch(`${trainingTr}\n${tryoutTr}\n${trainingEn}`, /Made By Fieel/);
  assert.equal(sessionLanguageCopy("tr", "tryout").endButton, "DENEMEYİ BİTİR");
  assert.equal(sessionLanguageCopy("en", "tryout").endButton, "END TRYOUT");
});

test("repeat smoke refreshes boards without replaying a full template repair", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /reason: "existing_test_lab"/);
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: false,
    blacklistPermissionReady: true
  }), "skip_existing_lab");
  assert.match(source, /const staffTeam = await updateStaffTeamEmbed\(guild\)/);
  assert.match(source, /leaderboardBoardCount/);
  assert.match(source, /staffTeamReady/);
});

test("repeat smoke repairs an existing lab when blacklist permissions are unhealthy", () => {
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: false,
    blacklistPermissionReady: false
  }), "repair_permissions");
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: false,
    needsCompactLab: false,
    blacklistPermissionReady: false
  }), "repair_permissions");
});

test("repeat Community smoke repairs stale role icons instead of claiming the lab is healthy", () => {
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: false,
    blacklistPermissionReady: true,
    roleIconReady: false
  }), "repair_permissions");
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: false,
    blacklistPermissionReady: true,
    roleIconReady: true
  }), "skip_existing_lab");
});

test("repeat Community smoke repairs canonical structure drift", () => {
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: false,
    blacklistPermissionReady: true,
    roleIconReady: true,
    structureReady: false
  }), "repair_permissions");
});

test("Community smoke evidence requires every workflow and exactly two leaderboards", () => {
  const complete = {
    welcomeLeaveReady: true,
    leaderboardBoardCount: 2,
    staffTeamReady: true,
    helpGuideReady: true,
    applicationPanelReady: true,
    supportPanelReady: true,
    supportTicketReady: true,
    supportTicketTranscriptReady: true,
    supportTicketReopenReady: true,
    moderationPanelReady: true,
    securityPanelReady: true,
    textActivityReady: true,
    voiceActivityReady: true,
    activityRewardsPanelReady: true,
    rewardPolicyReady: true,
    activityWorkerReady: true,
    activityDatabaseReady: true,
    blacklistedRoleReady: true,
    blacklistPermissionReady: true
  };
  const ready = paradiseCommunitySmokeEvidenceReadiness(complete);
  assert.equal(ready.ready, true);
  assert.equal(ready.missingCount, 0);

  const incomplete = paradiseCommunitySmokeEvidenceReadiness({
    ...complete,
    helpGuideReady: false,
    supportTicketTranscriptReady: false
  });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.missingCount, 2);
  assert.deepEqual(incomplete.missing, ["helpGuideReady", "supportTicketTranscriptReady"]);
});

test("compact lab revision still takes precedence over permission-only repair", () => {
  assert.equal(paradiseAutoSmokeRepairAction({
    existingTestLab: true,
    needsCompactLab: true,
    blacklistPermissionReady: false
  }), "compact_rebuild");
});

test("availability panel uses a restart-safe guild-scoped component ID while keeping old panels repairable", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /family: "availability", guildId: guild\.id, entityId: "availability", action: "refresh"/);
  assert.match(source, /parseParadiseComponentId\(interaction\.customId, \{ guildId: interaction\.guildId \}\)/);
  assert.match(source, /outdatedParadiseComponentMessage/);
  assert.match(source, /interaction\.customId === "paradise_availability_refresh"/);
});

test("reconciliation is a test-guild-canary, rate-limited, and performs no Discord repair", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /async function runParadiseGuildReconciliation\(guild\)/);
  assert.match(source, /feature: "reconciliation_health"/);
  assert.match(source, /shouldRunParadiseReconciliation\(\{ lastRunAt:/);
  assert.match(source, /summarizeParadiseReconciliation\(result\)/);
  assert.match(source, /await runParadiseGuildReconciliation\(guild\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(source.slice(source.indexOf("async function runParadiseGuildReconciliation"), source.indexOf("async function runParadiseMaintenance")), /\.delete\(|\.create\(/);
});

test("production rebuild rejects absent, forged, mismatched, and expired execution proofs before mutation", async t => {
  const guild = { id: FIMA_COMMUNITY_PRODUCTION_GUILD_ID };
  const planId = "00000000-0000-4000-8000-000000000001";
  const backupDigest = "a".repeat(64);
  const base = signedProductionExecutionProof();
  const cases = [
    ["absent", undefined, base.secret, "production_rebuild_execution_proof_schema_invalid"],
    ["forged", { ...base.proof, signature: "0".repeat(64) }, base.secret, "production_rebuild_execution_proof_authenticity_invalid"],
    ["scope mismatch", signedProductionExecutionProof({ guildId: "wrong-guild" }).proof, base.secret, "production_rebuild_execution_proof_scope_mismatch"],
    ["expired", signedProductionExecutionProof({
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(1).toISOString()
    }).proof, base.secret, "production_rebuild_execution_proof_expired"]
  ];

  for (const [name, executionProof, executionProofSecret, code] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        rebuildFimaCommunityProduction(guild, "community", "unused-production-confirmation", {
          expectedBackupDigest: backupDigest,
          executionProof,
          planId,
          executionProofSecret
        }),
        error => error?.code === code
      );
    });
  }
});

test("test-guild rebuild still requires its exact typed confirmation", async () => {
  await assert.rejects(
    rebuildParadiseTestTemplate({ id: PARADISE_TEST_GUILD_ID }, "community", "wrong"),
    error => error?.code === "typed_confirmation_mismatch"
  );
});

test("valid production execution proof cannot authorize destructive rebuilding", async () => {
  const { secret, proof } = signedProductionExecutionProof();
  let accesses = 0;
  const guild = new Proxy({ id: FIMA_COMMUNITY_PRODUCTION_GUILD_ID }, {
    get(target, key) {
      if (key === 'id') return target.id;
      accesses++;
      throw new Error('Discord must not be accessed');
    }
  });
  await assert.rejects(rebuildFimaCommunityProduction(guild, 'community', 'unused', {
    expectedBackupDigest: proof.backupDigest, executionProof: proof,
    executionProofSecret: secret, planId: proof.planId
  }), error => error.code === 'production_destructive_rebuild_disabled');
  assert.equal(accesses, 0);
});

test("test and production rebuilds remain isolated behind explicit mutation policies", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const guardStart = source.indexOf("function assertParadiseMutationPolicy");
  const guardEnd = source.indexOf("async function requireParadiseRebuildPreflight", guardStart);
  const publicRebuildStart = source.indexOf("export async function rebuildParadiseTestTemplate");
  const publicRebuildEnd = source.indexOf("async function rebuildParadiseTemplateWithPolicy", publicRebuildStart);
  const policyRebuildStart = publicRebuildEnd;
  const policyRebuildEnd = source.indexOf("function roleMemberCount", policyRebuildStart);
  const rebuildStart = source.indexOf("async function rebuildParadiseTemplateUnlocked");
  const rebuildEnd = source.indexOf("async function upsertParadiseCommunitySmokePanel", rebuildStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  assert.ok(publicRebuildStart >= 0 && publicRebuildEnd > publicRebuildStart);
  assert.ok(policyRebuildStart >= 0 && policyRebuildEnd > policyRebuildStart);
  assert.ok(rebuildStart >= 0 && rebuildEnd > rebuildStart);
  const guardSource = source.slice(guardStart, guardEnd);
  const publicRebuildSource = source.slice(publicRebuildStart, publicRebuildEnd);
  const policyRebuildSource = source.slice(policyRebuildStart, policyRebuildEnd);
  const rebuildSource = source.slice(rebuildStart, rebuildEnd);
  assert.match(source, /const PARADISE_TEST_LAB_LAYOUT_REVISION/);
  assert.match(source, /const PARADISE_TEST_REBUILD_POLICY = Object\.freeze\(\{/);
  assert.match(source, /allowedGuildId: PARADISE_TEST_GUILD_ID/);
  assert.match(source, /const FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY = Object\.freeze\(\{/);
  assert.match(source, /allowedGuildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID/);
  assert.match(source, /expectedConfirmation: FIMA_COMMUNITY_REBUILD_CONFIRMATION/);
  assert.match(guardSource, /policy\.isProduction && mode !== "community"/);
  assert.match(guardSource, /production_community_only/);
  assert.match(source, /const rebuildConfirmation = smokeTemplate === "community"/);
  assert.match(source, /"REBUILD TEST COMMUNITY"/);
  assert.match(source, /"REBUILD TEST CLAN"/);
  assert.match(source, /"REBUILD TEST TSBTR"/);
  assert.match(source, /rebuildParadiseTestTemplate\(guild, smokeTemplate, rebuildConfirmation\)/);
  assert.match(guardSource, /policy\.isProduction && guildId === PARADISE_TEST_GUILD_ID/);
  assert.match(guardSource, /typed_confirmation_mismatch/);
  assert.match(guardSource, /return \{ selected, expected \}/);
  assert.match(publicRebuildSource, /rebuildParadiseTemplateWithPolicy\(guild, mode, confirmation, PARADISE_TEST_REBUILD_POLICY\)/);
  assert.match(publicRebuildSource, /FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY/);
  assert.match(policyRebuildSource, /assertParadiseMutationPolicy\(guild, mode, confirmation, policy/);
  const firstExecutionProofCheck = policyRebuildSource.indexOf("assertParadiseProductionExecutionCapability(guild, mode, policy)");
  const firstPreflight = policyRebuildSource.indexOf("await requireParadiseRebuildPreflight(guild, inheritedCorrelationId, policy)");
  const lockStart = policyRebuildSource.indexOf("return withParadiseGuildMutationLock");
  const lockedPreflight = policyRebuildSource.indexOf("await requireParadiseRebuildPreflight(guild, ownedLease?.correlationId || null, policy)");
  const phaseUpdate = policyRebuildSource.indexOf('await updateParadiseMutationLease({ phase: "backup_and_rebuild" })');
  const unlockedCall = policyRebuildSource.indexOf("return rebuildParadiseTemplateUnlocked(guild, mode, confirmation, policy)");
  assert.ok(firstExecutionProofCheck >= 0 && firstExecutionProofCheck < firstPreflight);
  assert.ok(firstPreflight >= 0 && firstPreflight < lockStart);
  assert.ok(lockStart >= 0 && lockedPreflight > lockStart);
  assert.ok(phaseUpdate > lockedPreflight && unlockedCall > phaseUpdate);
  assert.match(rebuildSource, /const \{ selected, expected \} = assertParadiseMutationPolicy\(guild, mode, confirmation, mutationPolicy/);
  assert.match(rebuildSource, /assertParadiseProductionExecutionCapability\(guild, mode, mutationPolicy\)/);
  assert.match(rebuildSource, /assertNoUnresolvedParadiseRollback\(guild\.id\)/);
  assert.match(rebuildSource, /captureParadiseGuildBackupSnapshot\(guild, \{ state \}\)/);
  assert.match(rebuildSource, /createParadiseBackupEnvelope\(snapshot\)/);
  assert.match(rebuildSource, /validateParadiseBackupEnvelope\(backup\)/);
  assert.match(rebuildSource, /buildParadiseRestoreDryRun\(\{[\s\S]*?backup,[\s\S]*?currentSnapshot: snapshot,[\s\S]*?expectedGuildId: guild\.id,[\s\S]*?allowedGuildId: mutationPolicy\.allowedGuildId[\s\S]*?\}\)/);
  assert.match(rebuildSource, /backup_restore_dry_run_failed/);
  assert.match(rebuildSource, /`\$\{mutationPolicy\.artifactPrefix\}-pre-rebuild-backup\.json`/);
  assert.match(rebuildSource, /readPersistedBackup\("timestamped", timestampedBackupPath\)/);
  assert.match(rebuildSource, /readPersistedBackup\("canonical", canonicalBackupPath\)/);
  assert.match(rebuildSource, /validateParadiseBackupArtifactCopies\(\{/);
  assert.match(rebuildSource, /persisted_backup_validation_failed/);
  assert.match(rebuildSource, /armParadiseRollbackMarker\(\{/);
  assert.match(rebuildSource, /status: "rebuild_in_progress"/);
  assert.match(rebuildSource, /status: "rollback_in_progress"/);
  assert.match(rebuildSource, /restoreParadiseGuildBackup\(\{[\s\S]*?persistRestoredState/);
  assert.match(rebuildSource, /status: "restored_pending_reconciliation"/);
  assert.match(rebuildSource, /mutationsPlanned !== 0/);
  assert.match(rebuildSource, /resolveParadiseRollbackMarker\(/);
  assert.match(rebuildSource, /status: "rollback_required"/);
  assert.match(rebuildSource, /originalError\.rollback = rollback/);
  assert.match(rebuildSource, /originalError\.rollbackError = rollbackError/);
  assert.match(rebuildSource, /originalError\.reconciliation = reconciliation/);
  assert.match(rebuildSource, /originalError\.rollbackMarker = rollbackMarker/);
});

test("application panel follows the selected server language and defaults to Turkish", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /function paradiseApplicationPanelPayload\(color, language = "tr", applicationSettings = \{\}\)/);
  assert.match(source, /FIMA BA\\u015eVURU MERKEZ\\u0130/);
  assert.match(source, /paradiseApplicationPanelPayload\(\s*await paradiseBrandColor\(\), language, guildConfig\.applicationSettings\s*\)/);
});

test("Discord application panels link multi-role staff and business workflows to the shared website queue", async () => {
  const paradiseSource = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const legacyBotSource = await (await import("node:fs/promises")).readFile(new URL("../src/discordBot.js", import.meta.url), "utf8");

  assert.match(paradiseSource, /setStyle\(ButtonStyle\.Link\)[\s\S]*fima-bot\/apply\?workflow=staff`/);
  assert.match(paradiseSource, /fima-bot\/apply\?workflow=business`/);
  assert.match(paradiseSource, /uygun personel, topluluk, i\\u015f birli\\u011fi ve i\\u00e7erik rollerini/);
  assert.match(paradiseSource, /hi\\u00e7bir rol otomatik verilmez/);
  assert.doesNotMatch(paradiseSource, /paradiseApplicationPanelPayloadLegacy/);
  assert.doesNotMatch(paradiseSource, /personel başlangıcı yalnızca \*\*Helper\*\*/);
  assert.doesNotMatch(paradiseSource, /setCustomId\("paradise_application_open"\)[\s\S]{0,300}setLabel\(safeApplicationPanelText/);
  assert.match(legacyBotSource, /function applicationPanelPayload\(\)[\s\S]*setLabel\("Open application center"\)[\s\S]*setStyle\(ButtonStyle\.Link\)[\s\S]*workflow=staff`/);
  assert.match(legacyBotSource, /setLabel\("Business application"\)[\s\S]*workflow=business&type=partnership/);
  assert.match(legacyBotSource, /same private review queue and are never auto-granted/);
  assert.doesNotMatch(legacyBotSource, /setLabel\("Apply as Helper"\)|workflow=staff&type=helper/);
  assert.match(paradiseSource, /website-first application center and choose an available staff, support, event, content or FIMA product role/);
  assert.match(paradiseSource, /website-first başvuru merkezini açar; uygun staff, support, etkinlik, içerik veya FIMA ürün rolünü seçersin/);
  assert.doesNotMatch(paradiseSource, /Product support, events, Helper applications|Ürün desteği, etkinlikler, Helper başvuruları/);
});

test("application draft interaction messages preserve Turkish characters", async () => {
  const paradiseSource = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(paradiseSource, /Başvuru bölümü kaydedildi/);
  assert.match(paradiseSource, /Sonraki bölümü doldurmak için devam et/);
  assert.match(paradiseSource, /Başvuru taslağı iptal edildi\. İstersen panelden tekrar başlayabilirsin/);
  assert.doesNotMatch(paradiseSource, /Basvuru (?:bolumu|taslagi)/);
});

test("application forms stay within Discord's five-input modal limit and retain the required role-specific scenario", () => {
  const macroChunks = applicationQuestionChunks("macro_staff");
  assert.ok(macroChunks.length >= 2);
  assert.ok(macroChunks.every(chunk => chunk.length > 0 && chunk.length <= 5));
  const trainingPrompts = applicationQuestionChunks("training_hoster").flat().map(question => question[2]).join(" ");
  assert.match(trainingPrompts, /Sunucuda 10 kişi var, takımları nasıl dengeli kurarsın\?/);
  assert.doesNotMatch(trainingPrompts, /5v5 takımları/i);
});

test("application more-info follow-up returns the same record to private review without creating a duplicate", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /setName\("continue"\)/);
  assert.match(source, /paradise_application_more_info:/);
  assert.match(source, /record\.status !== "more_info"/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /applicationReviewComponents\(id\)/);
  const application = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "application");
  assert.ok(application.options.some(option => option.name === "continue"));
  const registrySource = await (await import("node:fs/promises")).readFile(new URL("../src/paradiseCommandRegistry.js", import.meta.url), "utf8");
  assert.match(registrySource, /CMD-APPLICATION-CONTINUE/);
  assert.match(registrySource, /memberSafe: true/);
});

test("server templates hide irrelevant command families", () => {
  assert.equal(paradiseCommandAllowedForMode("challenge", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("roster", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "community"), true);
  assert.equal(paradiseCommandAllowedForMode("fima_support_ai", "community"), true);
  assert.equal(paradiseCommandAllowedForMode("challenge", "clan"), true);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "clan"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_support_ai", "clan"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_update", "tsbtr"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_support_ai", "tsbtr"), false);
});

test("runtime command access uses the registry even when a command is still registered", () => {
  assert.equal(paradiseRuntimeCommandAccess({
    command: "challenge", subcommand: "create", template: "community", enabledModules: ["challenge"], channelConstraintConfigured: false
  }).code, "command_not_registered_for_template");
  assert.equal(paradiseRuntimeCommandAccess({
    command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Trial Referee"], channelConstraintConfigured: false
  }).code, "command_permission_denied");
  assert.equal(paradiseRuntimeCommandAccess({
    command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], channelConstraintConfigured: false
  }).allowed, true);
});

test("rank progression follows Weak -> Stable -> Strong -> next level", () => {
  assert.equal(compareRanks(
    { stage: 1, level: "Low", strength: "Stable" },
    { stage: 1, level: "Low", strength: "Weak" }
  ), 1);
  assert.equal(compareRanks(
    { stage: 1, level: "Mid", strength: "Weak" },
    { stage: 1, level: "Low", strength: "Strong" }
  ), 1);
  assert.equal(compareRanks(
    { stage: 0, level: "Low", strength: "Weak" },
    { stage: 1, level: "High", strength: "Strong" }
  ), 1);
});

test("tryout staff cannot assign above own authority or below Stage 3 Low Weak", () => {
  const staff = { stage: 2, level: "High", strength: "Strong" };
  assert.equal(canAssignRank(staff, { stage: 2, level: "High", strength: "Strong" }), true);
  assert.equal(canAssignRank(staff, { stage: 1, level: "Low", strength: "Weak" }), false);
  assert.equal(canAssignRank(staff, { stage: 4, level: "High", strength: "Strong" }), false);
  assert.equal(canAssignRank(staff, { stage: 3, level: "Low", strength: "Weak" }), true);
});

test("rank labels are canonical and invalid ranks fail", () => {
  assert.equal(rankToRoleName({ stage: 0, level: "High", strength: "Strong" }), "Stage 0 High Strong");
  assert.throws(() => rankPower({ stage: 5, level: "Low", strength: "Weak" }), /invalid_rank/);
});

test("all Paradise slash command schemas serialize and names are unique", () => {
  const commands = paradiseCommands().map(command => command.toJSON());
  const names = commands.map(command => command.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.some(name => name.startsWith("paradise")), false);
  assert.ok(names.includes("challenge"));
  assert.ok(names.includes("activity"));
  assert.ok(names.includes("whitelist"));
  assert.ok(names.includes("mainer"));
  assert.ok(names.includes("report"));
  assert.ok(names.includes("findfcw"));
  assert.ok(names.includes("branding"));
  assert.ok(names.includes("help"));
  assert.ok(names.includes("relation"));
  assert.ok(names.includes("availability"));
  assert.ok(names.includes("loa"));
  assert.ok(names.includes("setupfieelstsbtr"));
  assert.ok(names.includes("profile"));
  assert.ok(names.includes("training"));
  assert.ok(names.includes("set"));
  assert.ok(names.includes("handbook"));
  assert.ok(names.includes("lineup"));
  assert.ok(names.includes("roster"));
  assert.ok(names.includes("blacklist"));
  assert.ok(names.includes("appeal"));
  assert.ok(names.includes("bail"));
  assert.ok(names.includes("setlogchannel"));
  assert.ok(names.includes("setcommunitychannel"));
  assert.ok(names.includes("qotd"));
  assert.ok(names.includes("answer"));
  assert.ok(names.includes("application"));
  assert.ok(names.includes("mod"));
  assert.ok(names.includes("security"));
  assert.ok(names.includes("rank"));
  assert.ok(names.includes("leaderboard"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "post"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "autowin"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "close"));
  assert.deepEqual(commands.find(command => command.name === "profile").options.map(option => option.name), ["create", "view", "edit", "privacy", "verify-status"]);
  const mappingCommands = ["set", "setlogchannel", "setcommunitychannel"].flatMap(name => commands.find(command => command.name === name).options);
  assert.equal(mappingCommands.length, PARADISE_CHANNEL_MAPPINGS.length);
  assert.ok(commands.find(command => command.name === "set").options.length <= 25);
  assert.ok(commands.find(command => command.name === "setlogchannel").options.length <= 25);
  assert.ok(commands.find(command => command.name === "setcommunitychannel").options.length <= 25);
  assert.deepEqual(commands.find(command => command.name === "lineup").options.map(option => option.name), ["add", "remove", "move", "edit", "clear", "panel", "repost"]);
  assert.deepEqual(commands.find(command => command.name === "roster").options.map(option => option.name), ["add", "update", "remove", "panel", "repost"]);
  assert.deepEqual(commands.find(command => command.name === "application").options.map(option => option.name), ["panel", "apply", "status", "continue"]);
  assert.deepEqual(commands.find(command => command.name === "training").options.map(option => option.name), ["setup", "create", "start", "result"]);
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "kick-request"));
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "ban-request"));
});

test("ranked leaderboard keeps public notes opt-in and exposes audited edit/clear/history operations", async () => {
  const command = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "leaderboard");
  for (const required of ["add", "edit", "move", "swap", "remove", "clear", "repost", "import", "export", "history"]) {
    assert.ok(command.options.some(option => option.name === required), `missing /leaderboard ${required}`);
  }
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const showPublicNotes = guildConfig\.leaderboard\?\.showPublicNotes === true/);
  assert.match(source, /recordParadiseLeaderboardAudit\(next/);
  assert.match(source, /Type `CLEAR` exactly to confirm/);
});

test("Top 10/20/30 cards retain stored IDs and edit in place", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /rankedLeaderboardMessageIds/);
  assert.match(source, /message\.edit\(\{ content: boardContent, embeds: cards\.slice\(0, 10\) \}\)/);
  assert.match(source, /setTitle\(language === "tr" \? `✦ #\$\{rank\} — Boş`/);
  assert.match(source, /Bağışıklık bitiyor: <t:\$\{stamp\}:R>/);
});

test("temporary voice names reject explicit and scam-like names", () => {
  assert.equal(sanitizeTemporaryVoiceName("Fieel's Arena", "Fieel's room"), "Fieel's Arena");
  assert.equal(sanitizeTemporaryVoiceName("PORNO room", "Fieel's room"), "Fieel's room");
  assert.equal(sanitizeTemporaryVoiceName("free token cookie", "Safe room"), "Safe room");
  assert.equal(sanitizeTemporaryVoiceName("   ", "Safe room"), "Safe room");
});

test("daily question answers are normalized without fuzzy false positives", () => {
  assert.equal(isQuestionAnswerMatch("İletişim", ["iletisim", "dinlemek"]), true);
  assert.equal(isQuestionAnswerMatch("  STAGE-0 ", ["stage 0"]), true);
  assert.equal(isQuestionAnswerMatch("stage 1", ["stage 0"]), false);
});

test("Roblox verification codes stay short and avoid ambiguous filtered characters", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = shortVerificationCode();
    assert.equal(code.length, 6);
    assert.match(code, /^P[A-HJ-NP-Z2-9]{5}$/);
    assert.doesNotMatch(code, /[IO01-]/);
  }
});

test("profile identity rejects duplicate Roblox verification and keeps completion guild-scoped", async () => {
  assert.equal(assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-a", "roblox-a"), true);
  assert.equal(assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-b", "roblox-b"), true);
  assert.throws(() => assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-b", "roblox-a"), { code: "roblox_identity_already_verified" });
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /state\.guildProfiles\[interaction\.guildId\]/);
  assert.match(source, /setName\("privacy"\)/);
  assert.match(source, /visibility === "private"/);
  const profile = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "profile");
  assert.ok(profile.options.some(option => option.name === "privacy"));
});

test("Discord command options never put required inputs after optional inputs", () => {
  const inspect = (options = [], path = "") => {
    let optionalSeen = false;
    for (const option of options) {
      if (option.required === false || option.required === undefined && !option.options) optionalSeen = true;
      if (option.required === true) {
        assert.equal(optionalSeen, false, `${path}/${option.name} is required after an optional input`);
      }
      if (option.options) inspect(option.options, `${path}/${option.name}`);
    }
  };
  for (const command of paradiseCommands().map(item => item.toJSON())) inspect(command.options, command.name);
});

test("Paradise brand color accepts safe HEX and rejects malformed values", () => {
  assert.equal(normalizeParadiseBrandColor("#12abEF"), "#12ABEF");
  assert.equal(normalizeParadiseBrandColor("001122"), "#001122");
  assert.equal(normalizeParadiseBrandColor("javascript:red"), "#000000");
  assert.equal(paradiseBrandColorInteger("#12ABEF"), 0x12abef);
});

test("Community, Clan and TSBTR setup templates remain separate", () => {
  assert.deepEqual(Object.keys(PARADISE_SETUP_SCHEMAS), ["community", "clan", "tsbtr"]);
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([, channels]) => channels.includes("support")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("◆・lineuplar")));
  assert.ok(PARADISE_SETUP_SCHEMAS.tsbtr.schema.some(([, channels]) => channels.includes("⟡・top-30")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("⟡・müsaitlik-ve-loa")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Stage 2 High Strong"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Top 30"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Frankfurt, Germany"));
  assert.ok(PARADISE_CLAN_ROLES.includes("BLACKLISTED"));
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("BLACKLISTED"));
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("⟡・sonuçlar"), false);
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("◇・destek"), false);
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("support"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("◇・destek"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("◜・oda-oluştur"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.tsbtr.schema.flatMap(([, channels]) => channels).includes("〢・incelemeler"), true);
  const communitySurface = [
    ...PARADISE_SETUP_SCHEMAS.community.schema.map(([category]) => category),
    ...PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels),
    ...PARADISE_SETUP_SCHEMAS.community.roles
  ];
  assert.equal(communitySurface.some(value => /(?:^|[・\s_-])(challenge|referee|training|tryout|competitive|savaş|war)(?:$|[・\s_-])/i.test(value)), false);
});

test("voice-purpose setup entries are real voice channels and wrong text mappings are detectable", async () => {
  for (const name of ["◜・oda-oluştur", "◜・topluluk-sesi", "◜・savaş-odası", "◞・afk"]) {
    assert.equal(PARADISE_VOICE_CHANNEL_NAMES.includes(name), true);
    assert.equal(paradiseSetupChannelType("━━ SESLER ━━", name), ChannelType.GuildVoice);
    assert.equal(paradiseSetupChannelTypeMismatch({ type: ChannelType.GuildText }, "━━ SESLER ━━", name), true);
    assert.equal(paradiseSetupChannelTypeMismatch({ type: ChannelType.GuildVoice }, "━━ SESLER ━━", name), false);
  }
  assert.equal(paradiseSetupChannelType("BAŞLANGIÇ", "rules"), ChannelType.GuildText);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const wrongTypeChannelIds = new Set\(\)/);
  assert.match(source, /wrongChannelTypes/);
  assert.match(source, /joined\?\.type === ChannelType\.GuildVoice/);
});

test("canonical templates keep their required public and private surfaces", () => {
  const count = mode => PARADISE_SETUP_SCHEMAS[mode].schema.flatMap(([, channels]) => channels).length;
  const publicCount = mode => PARADISE_SETUP_SCHEMAS[mode].schema
    .filter(([, , privateCategory]) => !privateCategory)
    .flatMap(([, channels]) => channels)
    .filter(name => !PARADISE_VOICE_CHANNEL_NAMES.includes(name)).length;
  const privateCount = mode => PARADISE_SETUP_SCHEMAS[mode].schema
    .filter(([, , privateCategory]) => privateCategory)
    .flatMap(([, channels]) => channels).length;
  assert.equal(count("community"), 39);
  assert.equal(count("clan"), 28);
  assert.equal(count("tsbtr"), 25);
  assert.equal(publicCount("community"), 19);
  assert.equal(publicCount("clan"), 18);
  assert.equal(publicCount("tsbtr"), 16);
  assert.equal(privateCount("community"), 17);
  for (const mode of ["clan", "tsbtr"]) assert.equal(privateCount(mode), 6);
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([name]) => name === "TURKISH"));
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([name]) => name === "VIDEO TEAM"));
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([name]) => name === "PERSONNEL"));
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("roles"), true);
  for (const role of ["Manager", "Glads", "Text Top 1", "Text Top 2", "Text Top 3", "Voice Top 1", "Voice Top 2", "Voice Top 3", "Level 5", "Level 50"]) {
    assert.ok(PARADISE_SETUP_SCHEMAS.community.roles.includes(role));
  }
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("〢・personel-rehberleri"), true);
});

test("FT Community operational projection preserves identity, private access and voice semantics", () => {
  const projection = buildParadiseCommunityOperationalSemantics();
  assert.equal(projection.identity, "FT Community");
  assert.equal(projection.publicLanguage, "en");
  assert.deepEqual(projection.privateCategories.map(category => category.purpose), [
    "turkish", "staff", "video_team"
  ]);
  assert.equal(
    projection.privateCategories.find(category => category.purpose === "turkish")
      .channels.find(channel => channel.purpose === "turkish_voice").type,
    "voice"
  );
  assert.equal(
    projection.privateCategories.find(category => category.purpose === "video_team")
      .channels.find(channel => channel.purpose === "video_voice").type,
    "voice"
  );
  assert.ok(projection.privateCategories.find(category => category.purpose === "staff")
    .accessClasses.includes("staff"));
  assert.ok(projection.channelNames.includes(projection.mappings.applications));
  assert.equal(projection.mappings.announcements, "announcements");
  assert.equal(projection.mappings.activityRewards, "levels");
  assert.ok(PARADISE_CHANNEL_MAPPINGS.some(([key]) => key === "announcement_channel"));
  assert.ok(PARADISE_CHANNEL_MAPPINGS.some(([key]) => key === "activity_rewards_channel"));
});

test("canonical handbooks are pinned and operational guides do not receive the global footer", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const GUIDE_FOOTER_KEYS = new Set\(\["rules", "role_guide", "faq_trust"\]\)/);
  assert.match(source, /message\.pin\?\.\("FIMA Bot canonical channel handbook"\)/);
  assert.doesNotMatch(source, /\*\*SERVER LOCKED\*\*, \*\*UNLOCK\*\*, \*\*END\*\*/);
});

test("staff command guide is a single role-aware panel and language details are ephemeral", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /setCustomId\("paradise_staff_guide_category"\)/);
  assert.match(source, /visibleParadiseStaffCommands\(paradiseRegistryContextForInteraction/);
  assert.match(source, /interaction\.reply\(\{ \.\.\.staffGuidePayload\(language\), ephemeral: true \}\)/);
  assert.match(source, /definition\.key === "staff_command_guide"\s*\? staffGuidePayload/);
});

test("guild panel language stays separate from a visitor dashboard preference and public member help remains private", async () => {
  assert.equal(paradiseGuildContentLanguage({ language: "tr", dashboardLanguage: "en" }), "tr");
  assert.equal(paradiseGuildContentLanguage({ locale: "en", dashboardLanguage: "tr" }), "en");
  assert.equal(paradiseGuildContentLanguage({ dashboardLanguage: "en" }), "tr");
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const languageHandler = source.slice(source.indexOf('if (interaction.customId.startsWith("paradise_member_help_lang:"))'), source.indexOf('if (String(interaction.customId || "").startsWith("pv:"))'));
  assert.match(languageHandler, /interaction\.reply\(\{ \.\.\.payload, ephemeral: true \}\)/);
  assert.doesNotMatch(languageHandler, /interaction\.update\(payload\)/);
});

test("canonical guide text has Turkish copy for every non-dynamic handbook", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const guideSection = source.slice(source.indexOf("const GUIDE_POSTS"), source.indexOf("const GUIDE_MAPPING_KEYS"));
  const guideKeys = [...guideSection.matchAll(/key: "([a-z_]+)"/g)].map(match => match[1]);
  const expected = guideKeys.filter(key => key !== "staff_command_guide");
  for (const key of expected) {
    assert.ok(PARADISE_GUIDE_TR_COPY[key], `missing Turkish copy for ${key}`);
    const localized = localizeParadiseGuide({ key, title: "English", body: "English body" }, "tr");
    assert.notEqual(localized.title, "English");
    assert.notEqual(localized.body, "English body");
  }
  const english = localizeParadiseGuide({ key: "rules", title: "English", body: "English body" }, "en");
  assert.equal(english.title, "English");
});

test("FT Community preserves all seven original rules without changing another guild's handbook", () => {
  const definition = { key: "rules", title: "Existing rules", body: "Existing body" };
  for (const language of ["en", "tr"]) {
    const localized = localizeParadiseGuide(definition, language, "1419335632324657306");
    assert.equal([...localized.body.matchAll(/\*\*\d\./g)].length, 7);
    assert.match(localized.body, /https:\/\/discord.com\/terms/);
    assert.match(localized.body, /https:\/\/discord.com\/guidelines/);
    assert.ok(localized.body.length < 4096);
  }
  assert.deepEqual(localizeParadiseGuide(definition, "en", "another-guild"), definition);
});

test("announcement and booster handbooks are canonical mapped visual consumers", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const guideSection = source.slice(source.indexOf("const GUIDE_POSTS"), source.indexOf("const GUIDE_MAPPING_KEYS"));
  const mappingSection = source.slice(source.indexOf("const GUIDE_MAPPING_KEYS"), source.indexOf("const GUIDE_FOOTER_KEYS"));
  assert.match(guideSection, /key: "announcement"[\s\S]*channel: "⟐・announcements"/);
  assert.match(guideSection, /key: "booster"[\s\S]*channel: "⌁・activity-rewards"/);
  assert.match(mappingSection, /announcement: "announcement_channel"/);
  assert.match(mappingSection, /booster: "activity_rewards_channel"/);
});

test("availability board separates timed entries and active tickets", () => {
  const state = {
    leaderboard: {
      "1": { spot: 25, availability: { cooldownUntil: 4_102_444_800_000 } },
      "2": { spot: 7, availability: {} },
      "3": { spot: 8, availability: {} }
    },
    pendingChallenges: {
      ticket: { status: "open", ticketId: "110", challengerId: "3", opponentId: "2" }
    }
  };
  assert.match(timedAvailabilityLines(state, "cooldownUntil", 0), /<@1>.*Rank #25.*<t:4102444800:R>/);
  assert.match(challengedLines(state), /<@2> \(#7\).*<@3> \(#8\).*Ticket ID: 110/s);
});

test("challenge ranges follow leaderboard distance rules", () => {
  assert.deepEqual(challengeTargetSpots(null), [29, 30]);
  assert.deepEqual(challengeTargetSpots(30), [27, 28, 29]);
  assert.deepEqual(challengeTargetSpots(20), [18, 19]);
  assert.deepEqual(challengeTargetSpots(10), [9]);
  assert.deepEqual(challengeTargetSpots(1), []);
  assert.deepEqual(challengeTargetSpots(null, { topSize: 50 }), [49, 50]);
  assert.deepEqual(challengeTargetSpots(40, { topSize: 50, top30Range: 5 }), [35, 36, 37, 38, 39]);
  const groups = [
    { label: "Leaders", minRank: 1, maxRank: 5, upwardDistance: 1, downwardDistance: 0 },
    { label: "Contenders", minRank: 6, maxRank: 12, upwardDistance: 4, downwardDistance: 1 }
  ];
  assert.equal(normalizeChallengeGroups({ topSize: 12, groups }).length, 2);
  assert.deepEqual(challengeTargetSpots(8, { topSize: 12, groups }), [4, 5, 6, 7, 9]);
  assert.throws(() => normalizeChallengeGroups({
    topSize: 5,
    groups: [{ minRank: 1, maxRank: 3 }, { minRank: 3, maxRank: 5 }]
  }), /overlapping_challenge_groups/);
});

test("unranked challenge eligibility requires Stage 2 High Weak or better", () => {
  assert.equal(meetsMinimumChallengeRank({ stage: 2, level: "High", strength: "Weak" }), true);
  assert.equal(meetsMinimumChallengeRank({ stage: 1, level: "Low", strength: "Weak" }), true);
  assert.equal(meetsMinimumChallengeRank({ stage: 2, level: "Mid", strength: "Strong" }), false);
});

test("challenge creation explains cooldown, immunity and active ticket blocks", () => {
  const now = 1_800_000_000_000;
  const base = {
    leaderboard: {
      challenger: { availability: { cooldownUntil: now + 60_000 } },
      opponent: { availability: { immunityUntil: now + 120_000 } }
    },
    pendingChallenges: {}
  };
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /cooldown.*<t:1800000060:R>/);
  base.leaderboard.challenger.availability.cooldownUntil = 0;
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /currently immune.*<t:1800000120:R>/);
  base.pendingChallenges.ticket = {
    status: "open", ticketId: "123456789012345678", challengerId: "other", opponentId: "opponent"
  };
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /already in a challenge.*<#123456789012345678>/);
});

test("challenge score submissions require a referee, valid score and the open ticket participants", async () => {
  assert.equal(normalizeParadiseChallengeScore("10 - 5"), "10-5");
  assert.equal(normalizeParadiseChallengeScore("auto"), "Auto");
  assert.throws(() => normalizeParadiseChallengeScore("10 to 5"), { code: "invalid_challenge_score" });
  assert.throws(() => normalizeParadiseChallengeScore("10-10"), { code: "invalid_challenge_score" });
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /if \(!await canWorkReferee\(interaction\.member\)\) return interaction\.reply/);
  assert.match(source, /Submit the score inside an open FIMA Bot challenge ticket/);
  assert.match(source, /Winner and loser must be the two fighters recorded in this challenge ticket/);
  assert.match(source, /resolveParadiseChallengeCoReferee/);
  assert.match(source, /recordParadiseChallengeAudit/);
});

test("challenge tickets and leaderboards stay isolated between managed guilds", () => {
  const now = 1_800_000_000_000;
  const state = {
    leaderboard: {},
    leaderboards: {
      guildA: { challenger: { availability: { cooldownUntil: now + 60_000 } }, opponent: { availability: {} } },
      guildB: { challenger: { availability: {} }, opponent: { availability: {} } }
    },
    pendingChallenges: {
      ticketA: { guildId: "guildA", status: "open", ticketId: "111", challengerId: "other", opponentId: "opponent" }
    },
    loa: {}
  };
  assert.match(challengeBlockReason(state, "challenger", "opponent", now, "guildA"), /already in a challenge/);
  assert.equal(challengeBlockReason(state, "challenger", "opponent", now, "guildB"), null);
  assert.match(timedAvailabilityLines(state, "cooldownUntil", now, "guildA"), /<@challenger>/);
  assert.equal(timedAvailabilityLines(state, "cooldownUntil", now, "guildB"), "_None._");
});

test("notification role mutations acknowledge before Discord work and finish the deferred reply", async () => {
  for (const mode of ["add", "remove", "error"]) {
    const calls = [];
    const role = { id: "poll-role", name: "Poll Notifications", managed: false };
    const interaction = {
      guild: { id: "panel-test", roles: { cache: new Collection([[role.id, role]]) } },
      member: { roles: {
        cache: new Collection(mode === "remove" ? [[role.id, role]] : []),
        add: async () => { calls.push("add"); if (mode === "error") throw new Error("Discord unavailable"); },
        remove: async () => { calls.push("remove"); }
      } },
      deferReply: async payload => { assert.equal(payload.ephemeral, true); calls.push("defer"); },
      editReply: async payload => { calls.push("finish"); assert.match(payload.content, mode === "error" ? /could not update/ : /Poll Notifications/); },
      reply: async () => assert.fail("must finish deferred response")
    };
    await handleRolePanelButton(interaction, "ping", "poll", "community");
    assert.deepEqual(calls, ["defer", mode === "remove" ? "remove" : "add", "finish"]);
  }
});
