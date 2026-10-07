import test from "node:test";
import assert from "node:assert/strict";
import { ticketClaimant, topicWithClaim, topicWithAssignment, withTicketLock } from "../src/fimaTicketState.js";

const staff = "123456789012345678";
test("assignment transfers ownership and preserves opener and category", () => {
  const before = `Fima ticket: Security. openedBy:987654321098765432 claimedBy:${staff}`;
  const assigned = topicWithAssignment(before, "234567890123456789");
  assert.equal(assigned, "Fima ticket: Security. openedBy:987654321098765432 claimedBy:234567890123456789");
  assert.equal(topicWithAssignment(assigned, "234567890123456789"), assigned);
  assert.throws(() => topicWithAssignment(before, "invalid"), /invalid_ticket_claimant/);
});
test("claim persists in topic without changing existing ticket metadata", () => {
  const before = "Fima ticket: Security. openedBy:987654321098765432";
  const saved = topicWithClaim(before, staff);
  assert.equal(ticketClaimant(saved), staff);
  assert.ok(saved.startsWith(before));
  assert.equal(topicWithClaim(saved, staff), saved);
  assert.throws(() => topicWithClaim(saved, "234567890123456789"), /already_claimed/);
  assert.throws(() => topicWithClaim("x".repeat(1024), staff), /topic_full/);
  assert.throws(() => topicWithClaim(before, "invalid"), /invalid_ticket_claimant/);
});

test("overlapping lifecycle actions are rejected and failed actions release the lock", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = withTicketLock("ticket", () => gate);
  await assert.rejects(withTicketLock("ticket", async () => assert.fail("must not run")), /in_progress/);
  assert.equal(await withTicketLock("other-ticket", async () => 42), 42);
  release();
  await first;
  await assert.rejects(withTicketLock("ticket", async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await withTicketLock("ticket", async () => "available"), "available");
});
