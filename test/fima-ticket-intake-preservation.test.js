import test from "node:test";
import assert from "node:assert/strict";
import { retainedTicketIntakeFields, ticketIntakeFields } from "../src/fimaTicketIntake.js";

test("claim, assignment, close and reopen preserve the original request without stale lifecycle fields", () => {
  const request = ticketIntakeFields("product_support").map((field, index) => ({ name: field.label, value: `Request detail ${index}`, inline: false }));
  let embed = { fields: [{ name: "Status", value: "OPEN" }, ...request] };
  for (const status of ["CLAIMED", "ASSIGNED", "CLOSED", "OPEN"]) {
    embed = { fields: [{ name: "Status", value: status }, { name: "Claimed by", value: "Staff" }, ...retainedTicketIntakeFields(embed)] };
    assert.deepEqual(retainedTicketIntakeFields(embed), request);
    assert.equal(embed.fields.filter(field => field.name === "Status").length, 1);
  }
});

test("category-specific intake labels are retained and unknown fields excluded", () => {
  for (const category of ["payment_help", "license_hwid_help", "macro_timing_problem", "fake_headless", "security_report", "creator_partnership", "app_bug", "other"]) {
    const fields = ticketIntakeFields(category).map(field => ({ name: field.label, value: "Masked request" }));
    assert.equal(retainedTicketIntakeFields({ fields: [...fields, { name: "Transcript", value: "old" }] }).length, 3);
  }
  assert.deepEqual(retainedTicketIntakeFields(), []);
});
