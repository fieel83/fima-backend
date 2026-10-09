import test from "node:test";
import assert from "node:assert/strict";
import { organizeFimaRolePositions } from "../src/fimaRolePositions.js";

function fixture({ reject = false, drift = false, unreadable = false, managed = false, permission = true } = {}) {
  const calls = [];
  const role = { id: "buyer", name: "Buyers", position: 4, managed, editable: !managed,
    async setPosition(position) {
      calls.push(position);
      if (reject) throw new Error("permission changed");
      this.position = position;
    } };
  const guild = { id: "guild", members: { async fetchMe(options) {
    assert.equal(options.force, true);
    return { permissions: { has: () => permission }, roles: { highest: { position: 10 } } };
  } }, roles: { async fetch(id) {
    if (id) return role;
    if (unreadable) throw new Error("network unavailable");
    if (drift) role.position = 8;
    return new Map([[role.id, role]]);
  } } };
  return { guild, role, calls, run: () => organizeFimaRolePositions(guild, { buyer: { id: "buyer" } }, { buyer: { fallbackName: "Buyers" } }) };
}

test("a role move is counted only after fresh final hierarchy verification", async () => {
  const state = fixture();
  const result = await state.run();
  assert.equal(result.success, true);
  assert.equal(result.verified, true);
  assert.equal(result.moved, 1);
  assert.equal(state.role.id, "buyer");
  assert.deepEqual(state.calls, [9]);
});

test("a rejected move never reports a moved role or success", async () => {
  const result = await fixture({ reject: true }).run();
  assert.equal(result.moved, 0);
  assert.equal(result.success, false);
  assert.equal(result.verified, false);
  assert.match(result.warnings.join(" "), /permission changed/);
});

test("a successful API response with later hierarchy drift fails verification", async () => {
  const result = await fixture({ drift: true }).run();
  assert.equal(result.moved, 0);
  assert.equal(result.success, false);
  assert.match(result.warnings.join(" "), /final position/);
});

test("readback failure does not turn accepted mutations into a live pass", async () => {
  const result = await fixture({ unreadable: true }).run();
  assert.equal(result.moved, 0);
  assert.equal(result.verified, false);
  assert.equal(result.success, false);
});

test("managed roles and missing Manage Roles cannot trigger mutations", async () => {
  for (const options of [{ managed: true }, { permission: false }]) {
    const state = fixture(options);
    const result = await state.run();
    assert.equal(result.success, false);
    assert.equal(result.moved, 0);
    assert.deepEqual(state.calls, []);
  }
});
