import assert from "node:assert/strict";
import test from "node:test";
import { buildParadiseReconciliation } from "../src/paradiseReconciliation.js";

test("reconciliation reports safe classifications without automatically changing Paradise state", () => {
  const result = buildParadiseReconciliation({
    state: {
      guildConfigs: {
        "guild-a": { channelMappings: { support_channel: "missing-channel" }, smokePanelMessageIds: { help: "missing-message" } },
        "removed-guild": {}
      },
      leaderboards: { "guild-a": { one: { spot: 1 }, two: { spot: 1 } } },
      supportTickets: { one: { guildId: "removed-guild" } }
    },
    managedGuildIds: ["guild-a"],
    existingChannelIds: ["known-channel"],
    existingMessageIds: ["known-message"]
  });
  assert.equal(result.status, "unsafe_blocking");
  assert.equal(result.autoRepairExecuted, false);
  assert.equal(result.issues.some(issue => issue.code === "duplicate_leaderboard_position"), true);
  assert.equal(result.issues.some(issue => issue.code === "missing_mapped_channel"), true);
});
