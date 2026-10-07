import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketIntakeModal, ticketIntakeFields } from "../src/fimaTicketIntake.js";

test("ticket form respects Discord limits and requires an issue before creation", () => {
  for (const id of ["product_support", "payment_help", "license_hwid_help", "trial_help", "gift_redeem_help", "old_tgmacro_buyer", "app_bug", "macro_timing_problem", "fake_headless", "security_report", "creator_partnership", "other"]) {
    const modal = buildTicketIntakeModal({ id, label: id }).toJSON();
    assert.equal(modal.custom_id, `fima_ticket_intake:${id}`);
    assert.equal(modal.components.length, 3);
    const fields = modal.components.map((row) => row.components[0]);
    assert.equal(fields[0].required, true);
    assert.equal(fields[0].min_length, 10);
    assert.equal(fields[1].required, false);
    assert.ok(fields.every((field) => field.label.length <= 45 && field.max_length <= 1000));
  }
});

test("category questions collect relevant context without asking for credentials", () => {
  assert.match(ticketIntakeFields("license_hwid_help")[1].label, /no license key/);
  assert.match(ticketIntakeFields("payment_help")[1].label, /no card details/);
  assert.match(ticketIntakeFields("security_report")[1].label, /no credentials/);
  assert.match(ticketIntakeFields("fake_headless")[1].label, /Avatar/);
  assert.match(ticketIntakeFields("macro_timing_problem")[1].label, /ping, FPS/);
});
