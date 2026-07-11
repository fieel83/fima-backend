import assert from "node:assert/strict";
import test from "node:test";
import { buildParadiseConfigRollbackPreview, canRollbackParadiseConfig, createParadiseConfigVersion } from "../src/paradiseConfigVersioning.js";
import { assertParadiseFeatureEnabled, normalizeParadiseFeatureFlags, resolveParadiseFeatureFlag } from "../src/paradiseFeatureFlags.js";
import { assertParadiseGuildWorkspaceAccess, paradiseGuildWorkspaceAccess } from "../src/paradiseGuildScope.js";
import { PARADISE_PERMISSIONS, assertParadisePermission, hasParadisePermission, paradiseRoleKeysForMember } from "../src/paradiseRbac.js";
import { paradiseCommandAccess, paradiseCommandChannelContext, paradiseCommandRegistrationAllowed, visibleParadiseCommands } from "../src/paradiseCommandRegistry.js";
import { buildParadiseComponentId, outdatedParadiseComponentMessage, parseParadiseComponentId } from "../src/paradiseComponentProtocol.js";
import { PARADISE_TEST_GUILD_ID } from "../src/runtimeEnvironment.js";

test("config version records a guild-scoped redacted diff and supports same-guild rollback only", () => {
  const version = createParadiseConfigVersion({
    guildId: "guild-a", actorId: "owner-a", source: "dashboard", now: "2026-07-11T00:00:00.000Z",
    previous: { language: "tr", nested: { token: "never-store" } },
    next: { language: "en", nested: { token: "still-never-store" } }
  });
  assert.equal(version.schemaVersion, 1);
  assert.equal(version.previous.nested.token, "[REDACTED]");
  assert.equal(version.next.nested.token, "[REDACTED]");
  assert.deepEqual(version.diff.map(item => item.path), ["language"]);
  assert.equal(canRollbackParadiseConfig(version, "guild-a"), true);
  assert.equal(canRollbackParadiseConfig(version, "guild-b"), false);
  const preview = buildParadiseConfigRollbackPreview(version, "guild-a");
  assert.equal(preview.rollbackStatus, "preview_only");
  assert.equal(preview.targetConfig.nested.token, "[REDACTED]");
  assert.throws(() => buildParadiseConfigRollbackPreview(version, "guild-b"), { code: "config_rollback_preview_denied" });
});

test("feature flags default to disabled and permit only selected rollout scopes", () => {
  assert.equal(resolveParadiseFeatureFlag({ feature: "ticket_ai" }).allowed, false);
  assert.equal(resolveParadiseFeatureFlag({ feature: "command_registry_enforcement", guildId: PARADISE_TEST_GUILD_ID }).allowed, true);
  assert.equal(resolveParadiseFeatureFlag({ feature: "command_registry_enforcement", guildId: "production-guild" }).allowed, false);
  assert.equal(resolveParadiseFeatureFlag({ feature: "command_registry_enforcement", guildId: PARADISE_TEST_GUILD_ID, flags: { command_registry_enforcement: { state: "disabled" } } }).allowed, false);
  assert.equal(resolveParadiseFeatureFlag({ feature: "ticket_ai", guildId: PARADISE_TEST_GUILD_ID, flags: { ticket_ai: { state: "test_guild" } } }).allowed, true);
  assert.equal(resolveParadiseFeatureFlag({ feature: "ticket_ai", guildId: "production-guild", flags: { ticket_ai: { state: "test_guild" } } }).allowed, false);
  assert.equal(resolveParadiseFeatureFlag({ feature: "ticket_ai", guildId: "guild-a", flags: { ticket_ai: { state: "allowlist", guildAllowlist: ["guild-a"] } } }).allowed, true);
  assert.throws(() => assertParadiseFeatureEnabled({ feature: "ticket_ai" }), { code: "feature_disabled" });
  assert.deepEqual(normalizeParadiseFeatureFlags({ ticket_ai: { state: "test_guild", guildAllowlist: ["guild-a", "guild-a"] } }), {
    ticket_ai: { state: "test_guild", guildAllowlist: ["guild-a"], userAllowlist: [] }
  });
  assert.throws(() => normalizeParadiseFeatureFlags({ ticket_ai: { state: "enabled" } }), { code: "feature_global_enable_blocked" });
});

test("guild workspace access never leaks a guild without owner, Administrator or Manage Guild", () => {
  const memberships = [
    { id: "owner", owner: true, permissions: "0" },
    { id: "admin", permissions: "8" },
    { id: "manager", permissions: "32" },
    { id: "member", permissions: "0" }
  ];
  assert.equal(paradiseGuildWorkspaceAccess({ guildId: "owner", memberships, installedGuildIds: ["owner"] }).code, "guild_workspace_allowed");
  assert.equal(paradiseGuildWorkspaceAccess({ guildId: "admin", memberships }).code, "guild_invite_required");
  assert.equal(paradiseGuildWorkspaceAccess({ guildId: "manager", memberships }).allowed, true);
  assert.equal(paradiseGuildWorkspaceAccess({ guildId: "member", memberships }).code, "manage_guild_required");
  assert.equal(paradiseGuildWorkspaceAccess({ guildId: "other", memberships }).code, "guild_not_authorized");
  assert.throws(() => assertParadiseGuildWorkspaceAccess({ guildId: "member", memberships }), { code: "manage_guild_required" });
});

test("RBAC keeps Trial Referee and hoster authority narrower than managers", () => {
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.REFEREE_WORK, roleKeys: ["Trial Referee"] }), true);
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.REFEREE_APPROVE, roleKeys: ["Trial Referee"] }), false);
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.TRAINING_MANAGE, roleKeys: ["Training Hoster"] }), false);
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.TRAINING_MANAGE, roleKeys: ["Training Manager"] }), true);
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.LICENSE_REPAIR, roleKeys: ["Fima Support"] }), false);
  assert.equal(hasParadisePermission({ permission: PARADISE_PERMISSIONS.LICENSE_REPAIR, isOwner: true }), true);
  assert.throws(() => assertParadisePermission({ permission: PARADISE_PERMISSIONS.REFEREE_APPROVE, roleKeys: ["Referee"] }), { code: "paradise_permission_denied" });
  assert.deepEqual(paradiseRoleKeysForMember({
    roleIds: ["role-ref"], roleNames: ["Unrelated Role"], mappings: { experienced_referee_role: "role-ref" }
  }), ["experienced_referee", "unrelated_role"]);
});

test("central command registry filters help and runtime access by template, module and role", () => {
  const communityMember = visibleParadiseCommands({ template: "community", enabledModules: ["profiles", "tickets", "fima_support"], roleKeys: [], plan: "free" });
  assert.equal(communityMember.some(item => item.command === "challenge"), false);
  assert.equal(communityMember.some(item => item.command === "lineup"), false);
  assert.equal(paradiseCommandAccess({ command: "challenge", subcommand: "create", template: "community", enabledModules: ["challenge"] }).code, "command_not_available_for_template");
  assert.equal(paradiseCommandAccess({ command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], channelKey: "training_channel" }).allowed, true);
  assert.equal(paradiseCommandAccess({ command: "challenge", subcommand: "close", template: "tsbtr", enabledModules: ["challenge"], roleKeys: ["Trial Referee"], channelKey: "challenge_ticket" }).code, "command_permission_denied");
});

test("registry controls guild command scope, channel mappings and plan denial without hiding legacy commands", () => {
  assert.equal(paradiseCommandRegistrationAllowed({ command: "challenge", template: "community" }).allowed, false);
  assert.equal(paradiseCommandRegistrationAllowed({ command: "roster", template: "community" }).allowed, false);
  assert.equal(paradiseCommandRegistrationAllowed({ command: "fima_help", template: "community" }).code, "legacy_command");
  const rightChannel = paradiseCommandChannelContext({
    config: { channelMappings: { training_channel: "training-1" } }, command: "training", subcommand: "start", channelId: "training-1"
  });
  const wrongChannel = paradiseCommandChannelContext({
    config: { channelMappings: { training_channel: "training-1" } }, command: "training", subcommand: "start", channelId: "general-1"
  });
  assert.equal(paradiseCommandAccess({ command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], ...rightChannel }).allowed, true);
  assert.equal(paradiseCommandAccess({ command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], ...wrongChannel }).code, "command_wrong_channel");
  assert.equal(paradiseCommandAccess({ command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], channelConstraintConfigured: false }).allowed, true);
  assert.equal(paradiseCommandAccess({ command: "fima_license_repair", template: "community", enabledModules: ["fima_support"], plan: "free", roleKeys: ["owner"] }).code, "command_plan_required");
  assert.equal(paradiseCommandAccess({ command: "fima_license_repair", template: "community", enabledModules: ["fima_support"], plan: "premium", roleKeys: ["owner"] }).allowed, true);
});

test("versioned persistent component IDs are guild-scoped and reject stale or malformed replay", () => {
  const id = buildParadiseComponentId({ family: "ticket", guildId: "guild-a", entityId: "ticket123", action: "close" });
  assert.deepEqual(parseParadiseComponentId(id, { guildId: "guild-a" }), {
    ok: true, version: "v1", family: "ticket", guildId: "guild-a", entityId: "ticket123", action: "close"
  });
  assert.equal(parseParadiseComponentId(id, { guildId: "guild-b" }).code, "component_cross_guild");
  assert.equal(parseParadiseComponentId(id.replace("v1", "v0"), { guildId: "guild-a" }).code, "component_outdated");
  assert.equal(parseParadiseComponentId("paradise_ticket_close", { guildId: "guild-a" }).code, "component_not_paradise_vnext");
  assert.match(outdatedParadiseComponentMessage("tr"), /eski sürüm/i);
});
