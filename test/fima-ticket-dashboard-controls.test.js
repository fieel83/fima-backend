import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const source = readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function handler(name, dependencies) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0);
  const end = source.indexOf("\n}\n", start) + 2;
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, dependencies);
}

test("disabled claim button keeps close and transcript available", () => {
  const rows = handler("ticketActionRows", { ActionRowBuilder, ButtonBuilder, ButtonStyle })({ claimEnabled: false }).map(row => row.toJSON());
  assert.equal(rows[0].components[0].disabled, true);
  assert.equal(rows[0].components[1].disabled, false);
  assert.notEqual(rows[1].components[0].disabled, true);
});

test("paused ticket intake rejects an already open modal before channel creation", async () => {
  let requestedGuild;
  let response;
  const submit = handler("handleTicketIntakeSubmit", {
    TICKET_CATEGORIES: [{ id: "other" }],
    fimaTicketSettingsForGuild: async guildId => { requestedGuild = guildId; return { enabled: false }; }
  });
  await submit({ customId: "fima_ticket_intake:other", guild: { id: "FT" }, deferReply: async () => {}, editReply: async text => { response = text; } });
  assert.equal(requestedGuild, "FT");
  assert.match(response, /paused/);
});

test("paused category selection never opens a modal", async () => {
  let response;
  const select = handler("handleTicketCategorySelect", { fimaTicketSettingsForGuild: async () => ({ enabled: false }) });
  await select({ guildId: "FT", reply: async value => { response = value; } });
  assert.equal(response.ephemeral, true);
  assert.match(response.content, /paused/);
});

test("stale claim buttons respect the current guild setting before any mutation", async () => {
  let requestedGuild;
  let response;
  const claim = handler("handleTicketButtonLocked", {
    isTicketStaff: () => true,
    fimaTicketSettingsForGuild: async guildId => { requestedGuild = guildId; return { claimEnabled: false }; }
  });
  await claim({ customId: "fima_ticket_claim", guildId: "FT", reply: async value => { response = value; } });
  assert.equal(requestedGuild, "FT");
  assert.equal(response.ephemeral, true);
  assert.match(response.content, /disabled/);
});

test("ticket pause still permits staff to close an existing ticket", async () => {
  let closed = false;
  let response;
  const close = handler("handleTicketButtonLocked", {
    isTicketStaff: () => true,
    fimaTicketSettingsForGuild: async () => ({ enabled: false, claimEnabled: false, autoTranscript: false }),
    auditDiscordBotAction: async () => {}, ticketClaimant: () => null, ticketIsClosed: () => false,
    setClosedTicketParticipantAccess: async () => { closed = true; },
    ticketLifecycleEmbed: () => ({}), ticketActionRows: () => [],
    getTicketCategoryLabel: () => "Other", getTicketOpenedUserId: () => "member",
    queueTicketRename: async () => {}, fimaAiSupportBridge: null, console
  });
  await close({ customId: "fima_ticket_close", guildId: "FT", user: { id: "staff" },
    guild: { channels: { fetch: async () => ({ id: "ticket" }) } },
    message: { embeds: [{}], edit: async () => {} },
    deferReply: async () => {}, editReply: async value => { response = value; }
  });
  assert.equal(closed, true);
  assert.match(response.content, /Ticket closed/);
});
