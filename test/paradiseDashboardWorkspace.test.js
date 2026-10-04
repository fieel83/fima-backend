import assert from "node:assert/strict";
import test from "node:test";
import {
  applyParadiseCustomerWorkspacePatch,
  buildParadiseCustomerWorkspaceView,
  customerWorkspaceConfigView,
  normalizeParadiseCustomerWorkspaceExpectedVersion,
  normalizeParadiseCustomerWorkspacePatch,
  normalizeParadiseWorkspaceRoute,
  paradiseCustomerWorkspaceVersion,
  PARADISE_CUSTOMER_WORKSPACE_ROUTES
} from "../src/paradiseDashboardWorkspace.js";

test("customer workspace exposes isolated route configuration only for the selected managed guild", () => {
  const config = {
    activeSetupMode: "clan",
    channelMappings: { support_ticket_channel: "123456789012345678" },
    roleMappings: { admin: "223456789012345678" },
    automod: { enabled: true },
    hiddenProviderToken: "must-not-be-exposed"
  };
  const view = buildParadiseCustomerWorkspaceView({
    card: { guildId: "guild-a", name: "Guild A", canManage: true, botInstalled: true, activePlan: "pro", activeTemplate: "clan" },
    config,
    route: "channels"
  });
  assert.equal(view.workspace.guildId, "guild-a");
  assert.equal(view.version, 0);
  assert.deepEqual(view.config, { channelMappings: { support_ticket_channel: "123456789012345678" } });
  assert.equal("hiddenProviderToken" in view.config, false);
  assert.equal(view.inviteRequired, false);
  assert.ok(view.routes.some(route => route.id === "tickets"));
  assert.ok(view.routes.some(route => route.id === "audit"));
});

test("customer workspace route selection is allowlisted and uninstalled guilds expose no configuration", () => {
  assert.equal(normalizeParadiseWorkspaceRoute("SECURITY"), "security");
  assert.equal(normalizeParadiseWorkspaceRoute("../owner"), "overview");
  assert.deepEqual(customerWorkspaceConfigView({ featureFlags: { owner: true } }, "audit"), {});
  const view = buildParadiseCustomerWorkspaceView({
    card: { guildId: "guild-b", name: "Invite me", canManage: true, botInstalled: false }
  });
  assert.equal(view.inviteRequired, true);
  assert.deepEqual(view.config, {});
  assert.ok(PARADISE_CUSTOMER_WORKSPACE_ROUTES.length >= 20);
});

test("customer workspace patch is route-scoped, validates Discord mappings and increments a local config version", () => {
  const normalized = normalizeParadiseCustomerWorkspacePatch({
    route: "channels",
    value: { channelMappings: { support_ticket_channel: "123456789012345678" } }
  });
  const next = applyParadiseCustomerWorkspacePatch({ customerWorkspaceVersion: 3 }, normalized);
  assert.equal(normalized.route, "channels");
  assert.equal(next.channelMappings.support_ticket_channel, "123456789012345678");
  assert.equal(next.customerWorkspaceVersion, 4);
  assert.equal(paradiseCustomerWorkspaceVersion(next), 4);
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "channels",
    value: { channelMappings: { provider_token: "123456789012345678" } }
  }), { code: "invalid_channel_mappings" });
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "roles",
    value: { roleMappings: { moderator: "not-a-discord-id" } }
  }), { code: "invalid_role_mappings" });
});

test("customer workspace expected versions accept only explicit safe non-negative integers", () => {
  assert.equal(normalizeParadiseCustomerWorkspaceExpectedVersion(0), 0);
  assert.equal(normalizeParadiseCustomerWorkspaceExpectedVersion(7), 7);
  for (const invalid of [undefined, null, "0", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeParadiseCustomerWorkspaceExpectedVersion(invalid), { code: "invalid_workspace_version" });
  }
  assert.equal(paradiseCustomerWorkspaceVersion({ customerWorkspaceVersion: "9" }), 9);
  assert.equal(paradiseCustomerWorkspaceVersion({ customerWorkspaceVersion: -1 }), 0);
});

test("customer workspace mapping snapshots can remove stale channel and role entries", () => {
  const config = {
    channelMappings: { welcome: "123456789012345678", stale: "223456789012345678" },
    roleMappings: { moderator: "323456789012345678", stale: "423456789012345678" }
  };
  const channels = normalizeParadiseCustomerWorkspacePatch({
    route: "channels",
    value: { channelMappings: { welcome: "123456789012345678" } }
  });
  const roles = normalizeParadiseCustomerWorkspacePatch({
    route: "roles",
    value: { roleMappings: { moderator: "323456789012345678" } }
  });
  const next = applyParadiseCustomerWorkspacePatch(applyParadiseCustomerWorkspacePatch(config, channels), roles);
  assert.deepEqual(next.channelMappings, { welcome: "123456789012345678" });
  assert.deepEqual(next.roleMappings, { moderator: "323456789012345678" });
});

test("customer workspace patch rejects owner-only, unsafe and read-only settings", () => {
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "modules",
    value: { modules: { tickets: true, owner: true } }
  }), { code: "invalid_workspace_modules" });
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "branding",
    value: { brandColor: "not-a-color" }
  }), { code: "invalid_brand_color" });
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "audit",
    value: { enabled: true }
  }), { code: "workspace_route_read_only" });
});

test("ticket and session route views return the same customer-safe settings their write routes persist", () => {
  const ticketPatch = normalizeParadiseCustomerWorkspacePatch({
    route: "tickets",
    value: { enabled: true, autoTranscript: true, deleteDelayMinutes: 15 }
  });
  const sessionPatch = normalizeParadiseCustomerWorkspacePatch({
    route: "sessions",
    value: { trainingEnabled: true, tryoutEnabled: true, resultApprovalRequired: true }
  });
  const config = applyParadiseCustomerWorkspacePatch(
    applyParadiseCustomerWorkspacePatch({}, ticketPatch),
    sessionPatch
  );
  assert.equal(customerWorkspaceConfigView(config, "tickets").ticketSettings.deleteDelayMinutes, 15);
  assert.equal(customerWorkspaceConfigView(config, "sessions").sessionSettings.tryoutEnabled, true);
});

test("customer application patches cannot enable automatic role grants", () => {
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({
    route: "applications",
    value: { enabled: true, autoGrantRole: true }
  }), { code: "invalid_workspace_applications" });

  const normalized = normalizeParadiseCustomerWorkspacePatch({
    route: "applications",
    value: { enabled: true, membershipRequired: true, cooldownDays: 7 }
  });
  assert.deepEqual(normalized.patch.applicationSettings, {
    enabled: true,
    membershipRequired: true,
    cooldownDays: 7
  });
});
