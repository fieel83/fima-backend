import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ticketAccountAccess, TICKET_ACCOUNT_LINK_MESSAGE } from "../src/fimaTicketAccount.js";

test("ordinary tickets resolve only the authoritative Discord account binding", async () => {
  let query;
  const result = await ticketAccountAccess({ user: { findUnique: async value => {
    query = value; return { id: "account-1" };
  } } }, "discord-1", "product_support");
  assert.deepEqual(query, { where: { discordUserId: "discord-1" }, select: { id: true } });
  assert.deepEqual(result, { allowed: true, accountId: "account-1", recoveryException: false });
});

test("unlinked accounts cannot open ordinary tickets", async () => {
  const result = await ticketAccountAccess({ user: { findUnique: async () => null } }, "unlinked", "other");
  assert.equal(result.allowed, false);
  assert.equal(result.accountId, null);
});

test("account recovery remains available without a database or linked account", async () => {
  assert.deepEqual(await ticketAccountAccess(null, "unlinked", "account_recovery"), {
    allowed: true, accountId: null, recoveryException: true
  });
});

test("lookup failure cannot turn into an allowed ordinary ticket", async () => {
  await assert.rejects(ticketAccountAccess({ user: { findUnique: async () => {
    throw new Error("database unavailable");
  } } }, "member", "payment_help"), /database unavailable/);
});

const source = readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function handler(name, dependencies) {
  const start = source.search(new RegExp(`async function ${name}\\(`));
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, dependencies);
}

test("category selection refuses unlinked users before displaying intake", async () => {
  let response;
  const select = handler("handleTicketCategorySelect", {
    fimaTicketSettingsForGuild: async () => ({ enabled: true }),
    TICKET_CATEGORIES: [{ id: "other" }], prisma: {},
    ticketAccountAccess: async () => ({ allowed: false }), TICKET_ACCOUNT_LINK_MESSAGE
  });
  await select({ guildId: "FT", values: ["other"], user: { id: "member" },
    showModal: () => assert.fail("unlinked user received modal"),
    reply: async value => { response = value; }
  });
  assert.equal(response.ephemeral, true);
  assert.equal(response.content, TICKET_ACCOUNT_LINK_MESSAGE);
});

test("unlinking while intake is open rejects submission before fetching channels", async () => {
  let response;
  const submit = handler("handleTicketIntakeSubmit", {
    TICKET_CATEGORIES: [{ id: "product_support" }], prisma: {},
    fimaTicketSettingsForGuild: async () => ({ enabled: true }),
    ticketAccountAccess: async () => ({ allowed: false }), TICKET_ACCOUNT_LINK_MESSAGE
  });
  await submit({ customId: "fima_ticket_intake:product_support", user: { id: "member" },
    guild: { id: "FT", channels: { fetch: () => assert.fail("channels accessed before account validation") } },
    deferReply: async () => {}, editReply: async value => { response = value; }
  });
  assert.equal(response, TICKET_ACCOUNT_LINK_MESSAGE);
});
