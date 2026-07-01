import test from "node:test";
import assert from "node:assert/strict";
import {
  canAssignRank, challengedLines, compareRanks, normalizeParadiseBrandColor, paradiseBrandColorInteger,
  paradiseCommands, PARADISE_SETUP_SCHEMAS, rankPower, rankToRoleName, shortVerificationCode,
  timedAvailabilityLines
} from "../src/paradise3a59.js";

test("rank progression follows Weak -> Stable -> Strong -> next level", () => {
  assert.equal(compareRanks(
    { stage: 1, level: "Low", strength: "Stable" },
    { stage: 1, level: "Low", strength: "Weak" }
  ), 1);
  assert.equal(compareRanks(
    { stage: 1, level: "Mid", strength: "Weak" },
    { stage: 1, level: "Low", strength: "Strong" }
  ), 1);
  assert.equal(compareRanks(
    { stage: 0, level: "Low", strength: "Weak" },
    { stage: 1, level: "High", strength: "Strong" }
  ), 1);
});

test("tryout staff cannot assign above own authority or below Stage 3 Low Weak", () => {
  const staff = { stage: 2, level: "High", strength: "Strong" };
  assert.equal(canAssignRank(staff, { stage: 2, level: "High", strength: "Strong" }), true);
  assert.equal(canAssignRank(staff, { stage: 1, level: "Low", strength: "Weak" }), false);
  assert.equal(canAssignRank(staff, { stage: 4, level: "High", strength: "Strong" }), false);
  assert.equal(canAssignRank(staff, { stage: 3, level: "Low", strength: "Weak" }), true);
});

test("rank labels are canonical and invalid ranks fail", () => {
  assert.equal(rankToRoleName({ stage: 0, level: "High", strength: "Strong" }), "Stage 0 High Strong");
  assert.throws(() => rankPower({ stage: 5, level: "Low", strength: "Weak" }), /invalid_rank/);
});

test("all Paradise slash command schemas serialize and names are unique", () => {
  const commands = paradiseCommands().map(command => command.toJSON());
  const names = commands.map(command => command.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("challenge"));
  assert.ok(names.includes("activity"));
  assert.ok(names.includes("whitelist"));
  assert.ok(names.includes("mainer"));
  assert.ok(names.includes("report"));
  assert.ok(names.includes("findfcw"));
  assert.ok(names.includes("branding"));
  assert.ok(names.includes("help"));
  assert.ok(names.includes("relation"));
  assert.ok(names.includes("availability"));
  assert.ok(names.includes("loa"));
  assert.ok(names.includes("setupfieelstsbtr"));
  assert.ok(names.includes("profile"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "post"));
});

test("Roblox verification codes stay short and avoid ambiguous filtered characters", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = shortVerificationCode();
    assert.equal(code.length, 6);
    assert.match(code, /^P[A-HJ-NP-Z2-9]{5}$/);
    assert.doesNotMatch(code, /[IO01-]/);
  }
});

test("Discord command options never put required inputs after optional inputs", () => {
  const inspect = (options = [], path = "") => {
    let optionalSeen = false;
    for (const option of options) {
      if (option.required === false || option.required === undefined && !option.options) optionalSeen = true;
      if (option.required === true) {
        assert.equal(optionalSeen, false, `${path}/${option.name} is required after an optional input`);
      }
      if (option.options) inspect(option.options, `${path}/${option.name}`);
    }
  };
  for (const command of paradiseCommands().map(item => item.toJSON())) inspect(command.options, command.name);
});

test("Paradise brand color accepts safe HEX and rejects malformed values", () => {
  assert.equal(normalizeParadiseBrandColor("#12abEF"), "#12ABEF");
  assert.equal(normalizeParadiseBrandColor("001122"), "#001122");
  assert.equal(normalizeParadiseBrandColor("javascript:red"), "#000000");
  assert.equal(paradiseBrandColorInteger("#12ABEF"), 0x12abef);
});

test("Community, Clan and TSBTR setup templates remain separate", () => {
  assert.deepEqual(Object.keys(PARADISE_SETUP_SCHEMAS), ["community", "clan", "tsbtr"]);
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([, channels]) => channels.includes("fima-macro")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("clan-relations")));
  assert.ok(PARADISE_SETUP_SCHEMAS.tsbtr.schema.some(([, channels]) => channels.includes("top-30")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("loa")));
});

test("availability board separates timed entries and active tickets", () => {
  const state = {
    leaderboard: {
      "1": { spot: 25, availability: { cooldownUntil: 4_102_444_800_000 } },
      "2": { spot: 7, availability: {} },
      "3": { spot: 8, availability: {} }
    },
    pendingChallenges: {
      ticket: { status: "open", ticketId: "110", challengerId: "3", opponentId: "2" }
    }
  };
  assert.match(timedAvailabilityLines(state, "cooldownUntil", 0), /<@1>.*Rank #25.*<t:4102444800:R>/);
  assert.match(challengedLines(state), /<@2> \(#7\).*<@3> \(#8\).*Ticket ID: 110/s);
});
