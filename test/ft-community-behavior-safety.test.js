import test from "node:test";
import assert from "node:assert/strict";
import { createFtBehaviorSafety } from "../src/ftCommunityBehaviorSafety.js";

const message = (id, channelId, extra = {}) => ({ guildId: "guild", authorId: "author", messageId: String(id), channelId,
  content: "Repeated campaign with private content", ...extra });

test("four-channel campaign creates one private review without leaking content or claiming DM access", () => {
  const observe = createFtBehaviorSafety({ now: () => 1000 });
  for (let i = 0; i < 3; i++) assert.equal(observe(message(i, `channel-${i}`)), null);
  const review = observe(message(3, "channel-3"));
  assert.equal(review.risk, "MEDIUM");
  assert.deepEqual(review.evidence, ["repeated_campaign_four_channels"]);
  assert.equal(review.distinctChannels, 4);
  assert.equal(review.privateDmsObserved, false);
  assert.equal(JSON.stringify(review).includes("private content"), false);
  assert.equal(observe(message(4, "channel-4")), null);
});

test("edits, private tickets, other authors and guilds never inflate campaign counts", () => {
  const observe = createFtBehaviorSafety({ now: () => 1000 });
  for (let i = 0; i < 10; i++) assert.equal(observe(message(0, `channel-${i}`)), null);
  for (let i = 1; i < 5; i++) {
    assert.equal(observe(message(i, `channel-${i}`, { privateTicket: true })), null);
    assert.equal(observe(message(i, `channel-${i}`, { authorId: `other-${i}` })), null);
    assert.equal(observe(message(i, `channel-${i}`, { guildId: `other-${i}` })), null);
  }
});

test("very new repeated posters and repeated mention blasts get reviews, ordinary conversation stays allowed", () => {
  const observe = createFtBehaviorSafety({ now: () => 100000 });
  for (let i = 0; i < 4; i++) assert.equal(observe(message(i, "chat", { authorCreatedAt: 0 })), null);
  assert.deepEqual(observe(message(4, "chat", { authorCreatedAt: 0 })).evidence, ["new_account_repeated_campaign"]);
  const mentions = Array.from({ length: 10 }, (_, i) => `<@${100000000000000n + BigInt(i)}>`).join(" ");
  for (let i = 0; i < 2; i++) assert.equal(observe(message(i, "chat", { authorId: "mentions", content: mentions })), null);
  assert.deepEqual(observe(message(2, "chat", { authorId: "mentions", content: mentions })).evidence, ["repeated_mention_blast"]);
  for (let i = 0; i < 40; i++) assert.equal(observe(message(i, `chat-${i}`, { authorId: "ordinary", content: "gg" })), null);
});

test("window expiry, alert cooldown and bounded author eviction are deterministic", () => {
  let time = 0;
  const observe = createFtBehaviorSafety({ now: () => time, windowMs: 100, alertCooldownMs: 200, maxAuthors: 2 });
  for (let i = 0; i < 3; i++) observe(message(i, `channel-${i}`));
  time = 101;
  assert.equal(observe(message(3, "channel-3")), null);
  for (let i = 4; i < 6; i++) observe(message(i, `channel-${i}`));
  assert.equal(observe(message(6, "channel-6")).risk, "MEDIUM");
  assert.equal(observe(message(7, "channel-7")), null);
  time = 302;
  for (let i = 8; i < 11; i++) assert.equal(observe(message(i, `channel-${i}`)), null);
  assert.equal(observe(message(11, "channel-11")).risk, "MEDIUM");
  observe(message(1, "chat", { authorId: "second" }));
  observe(message(1, "chat", { authorId: "third" }));
  assert.equal(observe(message(12, "channel-12")), null);
});
