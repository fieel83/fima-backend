import test from "node:test";
import assert from "node:assert/strict";
import {
  FIEELS_COMMUNITY_NAMING_STYLE,
  buildFieelsCommunityStructureDraft,
  normalizeFieelsCommunityNamingStyle,
  reconcileFieelsCommunityRoles,
  validateFieelsCommunityStructureDraft
} from "../src/fieelsCommunityStructure.js";

test("Fieel's Community draft contains one protected Turkish category", () => {
  const draft = buildFieelsCommunityStructureDraft({ language: "tr" });
  const result = validateFieelsCommunityStructureDraft(draft);
  assert.deepEqual(result, { ok: true, errors: [] });
  const turkish = draft.categories.filter((category) => category.key === "turkish");
  assert.equal(turkish.length, 1);
  assert.deepEqual(turkish[0].channels.map((channel) => channel.type), ["text", "text", "text", "voice"]);
  assert.equal(turkish[0].channels.find((channel) => channel.key === "turkish_announcements").permissions.turkish.send, false);
});

test("naming hierarchy is coherent and role separators are permissionless", () => {
  const draft = buildFieelsCommunityStructureDraft();
  assert.notEqual(FIEELS_COMMUNITY_NAMING_STYLE.importantMarker, FIEELS_COMMUNITY_NAMING_STYLE.normalMarker);
  assert.notEqual(FIEELS_COMMUNITY_NAMING_STYLE.privateMarker, FIEELS_COMMUNITY_NAMING_STYLE.normalMarker);
  assert.ok(draft.categories.every((category) => category.proposedName.includes("━")));
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
    { id: "role-member", purposeKey: "member", name: "Member" },
    { id: "role-buyer", purposeKey: "buyer", name: "Buyer" }
  ];
  const existingChannels = [
    { id: "channel-tr-chat", purposeKey: "turkish_chat", name: "eski-türk-sohbet" }
  ];
  const draft = buildFieelsCommunityStructureDraft({ existingRoles, existingChannels });
  const turkishChat = draft.categories
    .find((category) => category.key === "turkish")
    .channels.find((channel) => channel.key === "turkish_chat");
  assert.equal(turkishChat.existingId, "channel-tr-chat");
  assert.equal(turkishChat.action, "rename_preserve_id");
  assert.equal(draft.roleReconciliation.mapped.find((role) => role.key === "turkish").existingId, "role-tr");
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
  assert.equal(personas.size, 8);
  assert.equal(personas.get("new_member").turkishVisible, false);
  assert.equal(personas.get("english_member").turkishVisible, false);
  assert.equal(personas.get("turkish_member").chatSend, true);
  assert.equal(personas.get("turkish_member").announcementsSend, false);
  assert.equal(personas.get("helper").moderate, "assist_only");
  assert.equal(personas.get("owner").moderate, true);
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
