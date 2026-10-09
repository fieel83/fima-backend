import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFtMessageSafety as evaluate, ftSafetyHost, createFtSafetyProcessor } from "../src/ftCommunityMessageSafety.js";

test("ordinary Nitro, Roblox and crypto discussion is delivered; official gifts remain valid", () => {
  for (const content of ["I bought Robux in Roblox", "Nitro looks nice", "crypto prices today", "Free Nitro gift https://discord.gift/example", "Roblox login https://www.roblox.com/login"]) {
    assert.equal(evaluate({ content }).blocked, false, content);
    assert.equal(evaluate({ content }).risk, "LOW", content);
  }
});

test("combined scam evidence covers lookalikes, withdrawals, secrets and fake influencer cash", () => {
  for (const content of [
    "Claim free Nitro now https://discord.com.attacker.test/reward?token=secret",
    "MrBeast cash giveaway! Claim money here https://giveaway.invalid/",
    "Pay activation deposit to unlock your withdrawal",
    "Çekim için aktivasyon ödemesi yatır",
    "Enter your seed phrase to verify",
    "Log in at https://dіscord.test/verify",
    "Claim free Robux https://roblox-login.invalid/reward"
  ]) {
    const result = evaluate({ content, roleKeys: ["links_approved"], isOwner: true });
    assert.equal(result.blocked, true, content);
    assert.equal(result.risk, "HIGH", content);
    assert.equal(JSON.stringify(result).includes("token=secret"), false);
  }
});

test("embeds and edited content are analyzed; secret URL values never enter evidence", () => {
  const result = evaluate({ content: "see details", embeds: [{ title: "Claim free Nitro", description: "Verify now", url: "https://discord-gift.invalid/?email=private" }] });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.hosts, ["discord-gift.invalid"]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(evaluate({ content: "ordinary message" }).blocked, false);
});

test("official domains use exact boundaries and credential URLs remain suspicious", () => {
  assert.equal(ftSafetyHost("https://discord.com.example.test").official, false);
  assert.equal(ftSafetyHost("https://support.discord.com").official, true);
  assert.equal(ftSafetyHost("https://discord.com@evil.test").credentialUrl, true);
  assert.equal(ftSafetyHost("file:///etc/passwd"), null);
  assert.equal(ftSafetyHost("not a URL"), null);
});

test("private ticket evidence and educational warnings are retained for staff review", () => {
  const content = "Pay a deposit to unlock withdrawal https://fraud.invalid/";
  assert.equal(evaluate({ content }).blocked, true);
  const privateReport = evaluate({ content, privateTicket: true, attachments: [{ name: "scam.exe" }] });
  assert.equal(privateReport.blocked, false);
  assert.equal(privateReport.retainForReview, true);
  assert.equal(privateReport.risk, "HIGH");
  assert.equal(evaluate({ content: `This is a scam. ${content}` }).blocked, false);
  assert.equal(evaluate({ content: "Never share your seed phrase" }).blocked, false);
});

test("unsafe files block, uninspected media honestly reports not_scanned, shortened URLs only queue review", () => {
  assert.equal(evaluate({ attachments: [{ name: "photo.png.exe", contentType: "image/png" }] }).blocked, true);
  assert.equal(evaluate({ attachments: [{ name: "photo.png", size: 90000000 }] }).mediaScan, "not_scanned");
  const shortened = evaluate({ content: "https://bit.ly/example" });
  assert.equal(shortened.risk, "MEDIUM");
  assert.equal(shortened.blocked, false);
});

test("invite control respects approved roles and dashboard disable switch", () => {
  assert.equal(evaluate({ content: "discord.gg/example" }).blocked, true);
  assert.equal(evaluate({ content: "discord.gg/example", roleKeys: ["invite_approved"] }).blocked, false);
  assert.equal(evaluate({ content: "discord.gg/example", config: { blockInvites: false } }).blocked, false);
});

test("processor serializes duplicate create/edit events, allows changed edits and logs no content", async () => {
  const process = createFtSafetyProcessor();
  const logs = [];
  let deletes = 0;
  let notifications = 0;
  const message = { id: "m", guild: { id: "g" }, channelId: "c", author: { id: "u", send: async () => { notifications++; } }, delete: async () => { deletes++; } };
  const record = async value => logs.push(value);
  const normal = evaluate({ content: "normal" });
  await process({ message, safety: normal, record });
  const unsafe = evaluate({ content: "Enter your seed phrase" });
  await Promise.all([process({ message, safety: unsafe, record }), process({ message, safety: unsafe, record })]);
  assert.equal(deletes, 1);
  assert.equal(logs.length, 1);
  assert.equal(notifications, 1);
  assert.equal(JSON.stringify(logs).includes("seed phrase"), false);
  assert.equal(logs[0].removed, true);
});

test("failed removal is recorded and can be retried; reports never delete or DM", async () => {
  const process = createFtSafetyProcessor();
  const logs = [];
  let calls = 0;
  const message = { id: "m", guild: { id: "g" }, author: { id: "u" }, delete: async () => { calls++; throw { code: 50013 }; } };
  const record = async value => logs.push(value);
  const safety = evaluate({ content: "Pay deposit to unlock withdrawal" });
  await process({ message, safety, record });
  await process({ message, safety, record });
  assert.equal(calls, 2);
  assert.equal(logs[0].failureCode, "50013");
  await process({ message: { ...message, id: "report" }, safety: evaluate({ content: "Pay deposit to unlock withdrawal", privateTicket: true }), record });
  assert.equal(calls, 2);
  assert.equal(logs.at(-1).retainedForReview, true);
});

test("deduplication expires and memory has a strict entry cap", async () => {
  let clock = 0;
  let records = 0;
  const process = createFtSafetyProcessor({ now: () => clock, ttlMs: 10, maxEntries: 1 });
  const safety = evaluate({ content: "https://bit.ly/test" });
  const message = id => ({ id, guild: { id: "g" }, author: { id: "u" } });
  const record = async () => { records++; };
  await process({ message: message("1"), safety, record });
  await process({ message: message("2"), safety, record });
  await process({ message: message("1"), safety, record });
  assert.equal(records, 3);
  clock = 20;
  await process({ message: message("1"), safety, record });
  assert.equal(records, 4);
});

test("three concurrent edits serialize and logging failures do not re-enable removed content", async () => {
  const process = createFtSafetyProcessor();
  let active = 0;
  let peak = 0;
  let deletes = 0;
  let notices = 0;
  const message = { id: "m", guild: { id: "g" }, author: { id: "u", send: async () => { notices++; } }, delete: async () => {
    active++; peak = Math.max(peak, active); deletes++;
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
  } };
  const record = async () => { throw new Error("logging unavailable"); };
  const results = await Promise.all(["one", "two", "three"].map(suffix => process({ message, safety: evaluate({ content: `Enter your seed phrase ${suffix}` }), record })));
  assert.deepEqual(results, [true, true, true]);
  assert.equal(peak, 1);
  assert.equal(deletes, 3);
  assert.equal(notices, 3);
  await process({ message, safety: evaluate({ content: "Enter your seed phrase three" }), record });
  assert.equal(deletes, 3);
});
