import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParadiseCustomerWorkspaceView,
  customerWorkspaceConfigView,
  normalizeParadiseWorkspaceRoute,
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
