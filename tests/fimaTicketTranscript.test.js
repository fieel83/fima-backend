import test from "node:test";
import assert from "node:assert/strict";
import { collectTicketMessages, ticketMessageText } from "../src/fimaTicketTranscript.js";

test("transcript includes older pages and keeps chronological order", async () => {
  const all = Array.from({ length: 215 }, (_, i) => ({ id: String(1000 + i), createdTimestamp: i }));
  const calls = [];
  const rows = await collectTicketMessages({ fetch: async (options) => {
    calls.push(options);
    return new Map(all.filter(m => !options.before || BigInt(m.id) < BigInt(options.before)).reverse().slice(0, 100).map(m => [m.id, m]));
  } });
  assert.equal(rows.length, 215);
  assert.equal(rows[0].id, "1000");
  assert.equal(calls.length, 3);
  assert.equal(calls[1].before, "1115");
});

test("failed or stalled pagination cannot produce a partial transcript", async () => {
  const page = new Map(Array.from({ length: 100 }, (_, i) => [String(1000 + i), { id: String(1000 + i) }]));
  await assert.rejects(collectTicketMessages({ fetch: async () => page }), /pagination_stalled/);
  let calls = 0;
  await assert.rejects(collectTicketMessages({ fetch: async () => { if (calls++) throw new Error("Discord unavailable"); return page; } }), /Discord unavailable/);
});

test("intake embed fields and attachment references are masked in exports", () => {
  const text = ticketMessageText({ content: "", embeds: [{ title: "Intake", fields: [{ name: "Reason", value: "secret@example.com" }] }], attachments: new Map([["1", { name: "proof.png", url: "https://example.com/proof" }]]) }, value => value.replace("secret@example.com", "[masked-email]"));
  assert.match(text, /Reason: \[masked-email\]/);
  assert.match(text, /proof.png/);
  assert.match(text, /https:\/\/example.com\/proof/);
});
