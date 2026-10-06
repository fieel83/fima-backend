import test from "node:test";
import assert from "node:assert/strict";
import {
  FIEELS_COMMUNITY_NAMING_STYLE,
  buildFieelsCommunityStructureDraft,
  normalizeFieelsCommunityNamingStyle,
  reconcileFieelsCommunityRoles,
  validateFieelsCommunityOperationalParity,
  validateFieelsCommunityStructureDraft
} from "../src/fieelsCommunityStructure.js";
import { buildParadiseCommunityOperationalSemantics } from "../src/paradise3a59.js";

test("Fieel's Community draft contains one protected Turkish category", () => {
  const draft = buildFieelsCommunityStructureDraft({ language: "tr" });
  const result = validateFieelsCommunityStructureDraft(draft);
  assert.deepEqual(result, { ok: true, errors: [] });
  const turkish = draft.categories.filter((category) => category.key === "turkish");
  assert.equal(turkish.length, 1);
  assert.deepEqual(turkish[0].channels.map((channel) => channel.type), ["text", "text", "text", "voice"]);
  assert.equal(turkish[0].channels.find((channel) => channel.key === "turkish_announcements").permissions.turkish.send, false);
});

test("channel names are plain and role separators are permissionless", () => {
  const draft = buildFieelsCommunityStructureDraft();
  assert.equal(FIEELS_COMMUNITY_NAMING_STYLE.importantMarker, "");
  assert.equal(FIEELS_COMMUNITY_NAMING_STYLE.normalMarker, "");
  assert.equal(FIEELS_COMMUNITY_NAMING_STYLE.privateMarker, "");
  assert.deepEqual(draft.categories.find((category) => category.key === "onboarding").channels.map((channel) => channel.proposedName), [
    "start-here", "rules", "announcements", "roles", "fieel-info", "joins-leaves"
  ]);
  assert.deepEqual(draft.categories.find((category) => category.key === "fieel_style").channels.map((channel) => channel.proposedName), [
    "fake-headless", "outfits", "capes"
  ]);
  assert.deepEqual(draft.categories.find((category) => category.key === "turkish").channels.map((channel) => channel.proposedName), [
    "turkce-sohbet", "turkce-medya", "turkce-duyurular", "Türkçe Sohbet"
  ]);
  assert.ok(draft.categories.every((category) => !/[⟐⌁〆━]/u.test(category.proposedName)));
  assert.ok(draft.roleTree.every((separator) =>
    separator.permissions.length === 0
    && separator.members.length === 0
    && separator.mentionable === false
    && separator.hoisted === false
  ));
});

test("existing role and channel IDs are preserved without destructive actions", () => {
  const existingRoles = [
    { id: "role-tr", purposeKey: "turkish", name: "Türkçe" },
    { id: "role-video", purposeKey: "video_team", name: "Video Team" },
    { id: "role-member", purposeKey: "member", name: "Member" },
    { id: "role-buyer", purposeKey: "buyer", name: "Buyer" }
  ];
  const existingChannels = [
    { id: "channel-tr-chat", purposeKey: "turkish_chat", name: "eski-türk-sohbet" },
    { id: "channel-video-hub", purposeKey: "video_hub", name: "old-video-hub" }
  ];
  const draft = buildFieelsCommunityStructureDraft({ existingRoles, existingChannels });
  const turkishChat = draft.categories
    .find((category) => category.key === "turkish")
    .channels.find((channel) => channel.key === "turkish_chat");
  assert.equal(turkishChat.existingId, "channel-tr-chat");
  assert.equal(turkishChat.action, "rename_preserve_id");
  assert.equal(draft.roleReconciliation.mapped.find((role) => role.key === "turkish").existingId, "role-tr");
  assert.equal(draft.roleReconciliation.mapped.find((role) => role.key === "video_team").existingId, "role-video");
  assert.equal(
    draft.categories.find((category) => category.key === "video_team").channels.find((channel) => channel.key === "video_hub").existingId,
    "channel-video-hub"
  );
  assert.deepEqual(draft.roleReconciliation.unrelated, [{ id: "role-buyer", name: "Buyer", action: "preserve_untouched" }]);
  assert.deepEqual(draft.roleReconciliation.destructiveActions, []);
});

test("duplicate existing role purposes fail validation instead of replacing roles", () => {
  const reconciliation = reconcileFieelsCommunityRoles([
    { id: "one", purposeKey: "turkish" },
    { id: "two", purposeKey: "turkish" }
  ]);
  assert.equal(reconciliation.duplicates.length, 1);
  const draft = buildFieelsCommunityStructureDraft({
    existingRoles: [
      { id: "one", purposeKey: "turkish" },
      { id: "two", purposeKey: "turkish" }
    ]
  });
  assert.equal(validateFieelsCommunityStructureDraft(draft).ok, false);
});

test("all required permission personas are explicit", () => {
  const draft = buildFieelsCommunityStructureDraft();
  const personas = new Map(draft.personaMatrix.map((persona) => [persona.key, persona]));
  assert.equal(personas.size, 12);
  assert.equal(personas.get("new_member").turkishVisible, false);
  assert.equal(personas.get("new_member").videoTeamVisible, false);
  assert.equal(personas.get("english_member").turkishVisible, false);
  assert.equal(personas.get("turkish_member").chatSend, true);
  assert.equal(personas.get("turkish_member").announcementsSend, false);
  assert.equal(personas.get("turkish_member").videoTeamVisible, false);
  assert.equal(personas.get("video_team").videoTeamVisible, true);
  assert.equal(personas.get("video_editor").moderate, false);
  assert.equal(personas.get("thumbnail_designer").videoTeamVisible, true);
  assert.equal(personas.get("helper").moderate, "assist_only");
  assert.equal(personas.get("helper").videoTeamVisible, true);
  assert.equal(personas.get("manager").moderate, true);
  assert.equal(personas.get("owner").moderate, true);
});

test("administrator, manager, ranking, level and ping role policies are explicit", () => {
  const draft = buildFieelsCommunityStructureDraft();
  assert.deepEqual(draft.rolePolicies.administrator.permissions, ["Administrator"]);
  assert.equal(draft.rolePolicies.administrator.hoisted, true);
  assert.equal(draft.rolePolicies.manager.permissions.includes("Administrator"), false);
  assert.deepEqual(draft.rolePolicies.manager.permissions, [
    "ManageGuild", "ManageChannels", "ManageRoles", "ManageMessages", "ManageEvents", "ManageThreads"
  ]);
  assert.equal(draft.rolePolicies.manager.hoisted, true);
  for (const key of ["top_1", "top_2", "top_3", "level_25", "level_50", "level_75", "level_100"]) {
    assert.equal(draft.rolePolicies[key].hoisted, true);
    assert.deepEqual(draft.rolePolicies[key].permissions, []);
  }
  for (const key of ["glads", "announcements_ping", "events_ping", "giveaway_ping"]) {
    assert.equal(draft.rolePolicies[key].mentionable, true);
    assert.deepEqual(draft.rolePolicies[key].permissions, []);
  }
});

test("private Video Team category is complete and hidden from everyone else", () => {
  const draft = buildFieelsCommunityStructureDraft();
  const videoTeam = draft.categories.find((category) => category.key === "video_team");
  assert.ok(videoTeam);
  assert.equal(videoTeam.access, "video_team");
  assert.deepEqual(videoTeam.channels.map((channel) => channel.key), [
    "video_hub",
    "video_ideas",
    "video_scripts",
    "video_assets",
    "video_review",
    "video_upload_schedule",
    "video_voice"
  ]);
  assert.deepEqual(videoTeam.channels.map((channel) => channel.type), [
    "text", "text", "text", "text", "text", "text", "voice"
  ]);
  for (const channel of videoTeam.channels) {
    assert.equal(channel.permissions.everyone.view, false);
    assert.equal(channel.permissions.video_team.view, true);
    assert.equal(channel.permissions.video_team.moderate, false);
    assert.equal(channel.permissions.staff.view, true);
    assert.equal(channel.permissions.staff.moderate, true);
  }
});

test("Video Team roles are managed once under a permissionless separator", () => {
  const draft = buildFieelsCommunityStructureDraft();
  const group = draft.roleTree.find((separator) => separator.key === "video_team");
  assert.ok(group);
  assert.deepEqual(group.roles, ["video_team", "video_editor", "thumbnail_designer"]);
  assert.equal(group.mentionable, false);
  assert.equal(group.hoisted, false);
  assert.deepEqual(group.permissions, []);
  assert.deepEqual(group.members, []);

  const managed = new Map(draft.roleReconciliation.mapped.map((role) => [role.key, role]));
  assert.equal(managed.get("video_team").action, "create_if_approved");
  assert.equal(managed.get("video_editor").action, "create_if_approved");
  assert.equal(managed.get("thumbnail_designer").action, "create_if_approved");
  assert.equal(managed.get("manager").action, "create_if_approved");
  assert.equal(managed.get("glads").action, "create_if_approved");
  assert.equal(managed.get("top_1").action, "create_if_approved");
  assert.equal(managed.get("level_100").action, "create_if_approved");
});

test("unsafe or incomplete naming inputs fall back to the coherent identity family", () => {
  const normalized = normalizeFieelsCommunityNamingStyle({
    categoryFrame: "missing placeholder",
    importantMarker: "\u0000",
    normalMarker: "  ◇  ",
    voiceStyle: "voice without placeholder",
    roleSeparatorStyle: "╺ {name} ╸"
  });
  assert.equal(normalized.categoryFrame, FIEELS_COMMUNITY_NAMING_STYLE.categoryFrame);
  assert.equal(normalized.importantMarker, FIEELS_COMMUNITY_NAMING_STYLE.importantMarker);
  assert.equal(normalized.normalMarker, "◇");
  assert.equal(normalized.voiceStyle, FIEELS_COMMUNITY_NAMING_STYLE.voiceStyle);
  assert.equal(normalized.roleSeparatorStyle, "╺ {name} ╸");

  const draft = buildFieelsCommunityStructureDraft({ language: "tr", style: normalized });
  assert.equal(draft.categories[0].names.tr, "BAŞLANGIÇ");
  assert.equal(draft.categories[0].channels[0].names.tr, "başlangıç");
  assert.equal(draft.roleTree[0].names.tr, "SAHİPLİK");
  assert.deepEqual(validateFieelsCommunityStructureDraft(draft), { ok: true, errors: [] });
});

test("canonical FT Community draft matches the runtime operational structure", () => {
  const result = validateFieelsCommunityOperationalParity(
    buildFieelsCommunityStructureDraft(),
    buildParadiseCommunityOperationalSemantics()
  );
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("operational parity rejects identity, category, type, access and mapping drift", () => {
  const draft = buildFieelsCommunityStructureDraft();
  const canonical = buildParadiseCommunityOperationalSemantics();
  const clone = () => structuredClone(canonical);

  const wrongIdentity = clone();
  wrongIdentity.identity = "Legacy Community";
  assert.ok(validateFieelsCommunityOperationalParity(draft, wrongIdentity).errors.includes(
    "operational_identity_must_be_ft_community"
  ));

  const duplicateTurkish = clone();
  duplicateTurkish.privateCategories.push(structuredClone(duplicateTurkish.privateCategories.find(
    category => category.purpose === "turkish"
  )));
  assert.ok(validateFieelsCommunityOperationalParity(draft, duplicateTurkish).errors.includes(
    "exactly_one_operational_turkish_category_required"
  ));

  const wrongVoice = clone();
  wrongVoice.privateCategories.find(category => category.purpose === "video_team")
    .channels.find(channel => channel.purpose === "video_voice").type = "text";
  assert.ok(validateFieelsCommunityOperationalParity(draft, wrongVoice).errors.includes(
    "operational_invalid_video_voice_type"
  ));

  const missingAccess = clone();
  missingAccess.privateCategories.find(category => category.purpose === "staff").accessClasses = [];
  assert.ok(validateFieelsCommunityOperationalParity(draft, missingAccess).errors.includes(
    "operational_staff_missing_staff_access"
  ));

  const invalidMapping = clone();
  invalidMapping.mappings.welcome = "missing-channel";
  assert.ok(validateFieelsCommunityOperationalParity(draft, invalidMapping).errors.includes(
    "operational_invalid_welcome_mapping"
  ));
});
