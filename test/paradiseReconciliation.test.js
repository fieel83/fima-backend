import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParadiseReconciliation,
  PARADISE_RECONCILIATION_MIN_INTERVAL_MS,
  shouldRunParadiseReconciliation,
  summarizeParadiseReconciliation
} from "../src/paradiseReconciliation.js";

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

test("reconciliation interval is rate-limited and summary persists no Discord identifiers", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z");
  assert.equal(shouldRunParadiseReconciliation({ now }), true);
  assert.equal(shouldRunParadiseReconciliation({
    lastRunAt: new Date(now - PARADISE_RECONCILIATION_MIN_INTERVAL_MS + 1).toISOString(), now
  }), false);
  assert.equal(shouldRunParadiseReconciliation({
    lastRunAt: new Date(now - PARADISE_RECONCILIATION_MIN_INTERVAL_MS).toISOString(), now
  }), true);

  const summary = summarizeParadiseReconciliation({
    status: "auto_repairable",
    healthy: false,
    issueCount: 2,
    issues: [
      { code: "missing_mapped_channel", guildId: "guild-private", mappingKey: "support" },
      { code: "missing_mapped_channel", guildId: "guild-private", mappingKey: "logs" }
    ],
    checked: { guildConfigs: 1, leaderboards: 2, supportTickets: 3 }
  }, "2026-07-11T12:00:00.000Z");
  assert.deepEqual(summary, {
    lastRunAt: "2026-07-11T12:00:00.000Z",
    status: "auto_repairable",
    healthy: false,
    issueCount: 2,
    issueCodes: ["missing_mapped_channel"],
    checked: { guildConfigs: 1, leaderboards: 2, supportTickets: 3 },
    autoRepairExecuted: false
  });
  assert.doesNotMatch(JSON.stringify(summary), /guild-private|"support"|"logs"/);
});
