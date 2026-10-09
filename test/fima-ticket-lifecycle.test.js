import test from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { ticketIsClosed, queueTicketRename, ticketParticipantAccess, ticketChannelOverwrites } from "../src/fimaTicketLifecycle.js";

test("private tickets allow participant media despite denied parent permissions", () => {
  const overwrites = ticketChannelOverwrites({ everyoneId: "everyone", openerId: "buyer", botId: "bot", supportRoleId: "staff" });
  const baseline = new PermissionsBitField();
  for (const id of ["buyer", "bot", "staff"]) {
    const overwrite = overwrites.find(entry => entry.id === id);
    const effective = new PermissionsBitField(baseline).remove(overwrite.deny || []).add(overwrite.allow);
    assert.equal(effective.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]), true);
    assert.equal(effective.has(PermissionFlagsBits.ManageChannels), id === "bot");
  }
  assert.deepEqual(overwrites[0], { id: "everyone", deny: [PermissionFlagsBits.ViewChannel] });
  assert.equal(ticketChannelOverwrites({ everyoneId: "everyone", openerId: "buyer", botId: "bot", supportRoleId: "everyone" }).length, 3);
});

test("closing denies media access and reopening restores it", () => {
  for (const permission of ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"]) {
    assert.equal(ticketParticipantAccess(true)[permission], false);
    assert.equal(ticketParticipantAccess(false)[permission], true);
  }
});

test("participant access takes precedence over a delayed channel name", () => {
  const opener = "762858334440521739";
  const overwrite = { allow: new PermissionsBitField(), deny: new PermissionsBitField(PermissionFlagsBits.ViewChannel) };
  const channel = { name: "ticket-support", topic: `openedBy:${opener}.`, permissionOverwrites: { cache: new Map([[opener, overwrite]]) } };
  assert.equal(ticketIsClosed(channel), true);
  channel.name = "closed-ticket-support";
  overwrite.deny = new PermissionsBitField();
  overwrite.allow = new PermissionsBitField(PermissionFlagsBits.ViewChannel);
  assert.equal(ticketIsClosed(channel), false);
  channel.permissionOverwrites.cache.clear();
  assert.equal(ticketIsClosed(channel), true);
});

test("a reopen during a blocked rename wins without blocking lifecycle actions", async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const calls = [];
  const channel = { id: "queue-test", name: "ticket-support", async setName(name) { calls.push(name); if (calls.length === 1) await blocked; return { ...this, name }; } };
  const closing = queueTicketRename(channel, true);
  const reopening = queueTicketRename(channel, false);
  assert.equal(closing, reopening);
  assert.deepEqual(calls, ["closed-ticket-support"]);
  release();
  await reopening;
  assert.deepEqual(calls, ["closed-ticket-support", "ticket-support"]);
});

test("failed renames are reported and do not leave the queue locked", async () => {
  const errors = [];
  const channel = { id: "failure-test", name: "ticket-support", async setName() { throw new Error("missing_permission"); } };
  await queueTicketRename(channel, true, error => errors.push(error.message));
  await queueTicketRename(channel, true, error => errors.push(error.message));
  assert.deepEqual(errors, ["missing_permission", "missing_permission"]);
});
