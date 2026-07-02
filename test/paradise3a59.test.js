import test from "node:test";
import assert from "node:assert/strict";
import {
  canAssignRank, canRoleNamesApproveScore, challengeBlockReason, challengedLines, challengeTargetSpots, compareRanks,
  normalizeParadiseBrandColor, paradiseBrandColorInteger,
  paradiseCommandAllowedForMode, paradiseCommands, PARADISE_CHANNEL_MAPPINGS, PARADISE_SETUP_SCHEMAS, rankPower, rankToRoleName, shortVerificationCode,
  timedAvailabilityLines
} from "../src/paradise3a59.js";

test("score approval excludes Trial Referee and Referee by default", () => {
  assert.equal(canRoleNamesApproveScore(["Trial Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Experienced Referee"]), true);
  assert.equal(canRoleNamesApproveScore(["Referee Manager"]), true);
  assert.equal(canRoleNamesApproveScore([], true), true);
});

test("server templates hide irrelevant command families", () => {
  assert.equal(paradiseCommandAllowedForMode("challenge", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("roster", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "community"), true);
  assert.equal(paradiseCommandAllowedForMode("challenge", "clan"), true);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "clan"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_update", "tsbtr"), false);
});

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
  assert.ok(names.includes("training"));
  assert.ok(names.includes("set"));
  assert.ok(names.includes("handbook"));
  assert.ok(names.includes("lineup"));
  assert.ok(names.includes("roster"));
  assert.ok(names.includes("blacklist"));
  assert.ok(names.includes("appeal"));
  assert.ok(names.includes("bail"));
  assert.ok(names.includes("setlogchannel"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "post"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "autowin"));
  assert.ok(commands.find(command => command.name === "challenge").options.some(option => option.name === "close"));
  assert.deepEqual(commands.find(command => command.name === "profile").options.map(option => option.name), ["create", "view", "edit", "verify-status"]);
  const mappingCommands = ["set", "setlogchannel"].flatMap(name => commands.find(command => command.name === name).options);
  assert.equal(mappingCommands.length, PARADISE_CHANNEL_MAPPINGS.length);
  assert.ok(commands.find(command => command.name === "set").options.length <= 25);
  assert.ok(commands.find(command => command.name === "setlogchannel").options.length <= 25);
  assert.deepEqual(commands.find(command => command.name === "lineup").options.map(option => option.name), ["add", "remove", "move", "edit", "clear", "panel", "repost"]);
  assert.deepEqual(commands.find(command => command.name === "roster").options.map(option => option.name), ["add", "update", "remove", "panel", "repost"]);
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
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Stage 2 High Strong"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Top 30"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Frankfurt, Germany"));
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("challenge-results"), false);
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("application-ticket"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("Join to Create"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.tsbtr.schema.flatMap(([, channels]) => channels).includes("moderation-requests"), true);
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

test("challenge ranges follow leaderboard distance rules", () => {
  assert.deepEqual(challengeTargetSpots(null), [29, 30]);
  assert.deepEqual(challengeTargetSpots(30), [27, 28, 29]);
  assert.deepEqual(challengeTargetSpots(20), [18, 19]);
  assert.deepEqual(challengeTargetSpots(10), [9]);
  assert.deepEqual(challengeTargetSpots(1), []);
  assert.deepEqual(challengeTargetSpots(null, { topSize: 50 }), [49, 50]);
  assert.deepEqual(challengeTargetSpots(40, { topSize: 50, top30Range: 5 }), [35, 36, 37, 38, 39]);
});

test("challenge creation explains cooldown, immunity and active ticket blocks", () => {
  const now = 1_800_000_000_000;
  const base = {
    leaderboard: {
      challenger: { availability: { cooldownUntil: now + 60_000 } },
      opponent: { availability: { immunityUntil: now + 120_000 } }
    },
    pendingChallenges: {}
  };
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /cooldown.*<t:1800000060:R>/);
  base.leaderboard.challenger.availability.cooldownUntil = 0;
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /currently immune.*<t:1800000120:R>/);
  base.pendingChallenges.ticket = {
    status: "open", ticketId: "123456789012345678", challengerId: "other", opponentId: "opponent"
  };
  assert.match(challengeBlockReason(base, "challenger", "opponent", now), /already in a challenge.*<#123456789012345678>/);
});

test("challenge tickets and leaderboards stay isolated between managed guilds", () => {
  const now = 1_800_000_000_000;
  const state = {
    leaderboard: {},
    leaderboards: {
      guildA: { challenger: { availability: { cooldownUntil: now + 60_000 } }, opponent: { availability: {} } },
      guildB: { challenger: { availability: {} }, opponent: { availability: {} } }
    },
    pendingChallenges: {
      ticketA: { guildId: "guildA", status: "open", ticketId: "111", challengerId: "other", opponentId: "opponent" }
    },
    loa: {}
  };
  assert.match(challengeBlockReason(state, "challenger", "opponent", now, "guildA"), /already in a challenge/);
  assert.equal(challengeBlockReason(state, "challenger", "opponent", now, "guildB"), null);
  assert.match(timedAvailabilityLines(state, "cooldownUntil", now, "guildA"), /<@challenger>/);
  assert.equal(timedAvailabilityLines(state, "cooldownUntil", now, "guildB"), "_None._");
});
