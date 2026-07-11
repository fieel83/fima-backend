import assert from "node:assert/strict";
import test from "node:test";
import { buildParadiseCustomerWorkspaceCards } from "../src/paradiseCustomerWorkspaces.js";

test("customer workspace cards include only Manage Guild/Admin memberships and never foreign guilds", () => {
  const cards = buildParadiseCustomerWorkspaceCards({
    memberships: [
      { id: "guild-admin", name: "Managed", permissions: "32", icon: "hash-a" },
      { id: "guild-member", name: "Member only", permissions: "0", icon: "hash-b" },
      { id: "guild-owner", name: "Owner", owner: true, permissions: "0" }
    ],
    managedGuilds: [{ id: "guild-admin", memberCount: 20, lastSuccessfulSyncAt: "2026-07-11T00:00:00.000Z" }],
    planByGuildId: { "guild-admin": "pro" },
    templateByGuildId: { "guild-admin": "community" }
  });
  assert.deepEqual(cards.map(card => card.guildId), ["guild-admin", "guild-owner"]);
  assert.equal(cards[0].botInstalled, true);
  assert.equal(cards[0].activePlan, "pro");
  assert.equal(cards[1].botInstalled, false);
});
