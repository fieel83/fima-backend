import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createDesktopLoginRequest,
  desktopDeviceCodeHash,
  desktopPkceChallenge,
  desktopUserCodeHash,
  normalizeDesktopUserCode,
  verifyDesktopLoginProof
} from "../src/desktopLogin.js";

const now = new Date("2026-07-18T12:00:00.000Z");
const verifier = crypto.randomBytes(32).toString("base64url");
const state = crypto.randomBytes(24).toString("base64url");
const deviceIdHash = crypto.createHash("sha256").update("device-a").digest("hex");

function requestFixture() {
  return createDesktopLoginRequest({
    pkceChallenge: desktopPkceChallenge(verifier),
    deviceIdHash,
    state,
    appVersion: "0.2.0-candidate",
    now
  });
}

test("desktop login stores only domain-separated hashes for user, device and state codes", () => {
  const result = requestFixture();
  const persisted = JSON.stringify(result.record);
  assert.equal(result.record.deviceCodeHash, desktopDeviceCodeHash(result.deviceCode));
  assert.equal(result.record.userCodeHash, desktopUserCodeHash(result.userCode));
  assert.equal(persisted.includes(result.deviceCode), false);
  assert.equal(persisted.includes(result.userCode), false);
  assert.equal(persisted.includes(state), false);
  assert.equal(persisted.includes(verifier), false);
});

test("user codes normalize safely without ambiguous characters", () => {
  const { userCode } = requestFixture();
  assert.equal(normalizeDesktopUserCode(` ${userCode.toLowerCase().replace("-", " ")} `), userCode);
  assert.equal(normalizeDesktopUserCode("ABCI-1234"), null);
  assert.equal(normalizeDesktopUserCode("short"), null);
});

test("valid proof succeeds before expiry", () => {
  const { deviceCode, record } = requestFixture();
  assert.deepEqual(verifyDesktopLoginProof(record, {
    deviceCode,
    pkceVerifier: verifier,
    state,
    deviceIdHash,
    now: new Date(now.getTime() + 60_000)
  }), { ok: true });
});

test("expired, wrong-device, wrong-state and wrong-PKCE proofs fail closed", () => {
  const { deviceCode, record } = requestFixture();
  const proof = { deviceCode, pkceVerifier: verifier, state, deviceIdHash };
  assert.equal(verifyDesktopLoginProof(record, { ...proof, now: record.expiresAt }).reason, "desktop_login_expired");
  assert.equal(verifyDesktopLoginProof(record, {
    ...proof,
    deviceIdHash: crypto.createHash("sha256").update("device-b").digest("hex"),
    now
  }).reason, "desktop_login_device_mismatch");
  assert.equal(verifyDesktopLoginProof(record, {
    ...proof,
    state: crypto.randomBytes(24).toString("base64url"),
    now
  }).reason, "desktop_login_state_mismatch");
  assert.equal(verifyDesktopLoginProof(record, {
    ...proof,
    pkceVerifier: crypto.randomBytes(32).toString("base64url"),
    now
  }).reason, "desktop_login_pkce_mismatch");
});

test("invalid PKCE and state inputs are rejected during initiation", () => {
  assert.throws(() => createDesktopLoginRequest({
    pkceChallenge: "not-pkce",
    deviceIdHash,
    state,
    appVersion: "0.2.0"
  }), { code: "invalid_pkce_challenge" });
  assert.throws(() => createDesktopLoginRequest({
    pkceChallenge: desktopPkceChallenge(verifier),
    deviceIdHash,
    state: "short",
    appVersion: "0.2.0"
  }), { code: "invalid_state" });
});

test("consumed requests cannot be treated as a second successful poll", () => {
  const { deviceCode, record } = requestFixture();
  const consumed = { ...record, status: "consumed", consumedAt: new Date(now.getTime() + 5_000) };
  const proof = verifyDesktopLoginProof(consumed, { deviceCode, pkceVerifier: verifier, state, deviceIdHash, now });
  assert.equal(proof.ok, true);
  assert.notEqual(consumed.status, "approved");
});
