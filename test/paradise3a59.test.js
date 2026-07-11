import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import {
  canAssignRank, canRoleNamesApproveScore, challengeBlockReason, challengedLines, challengeTargetSpots, compareRanks,
  isQuestionAnswerMatch,
  meetsMinimumChallengeRank, normalizeChallengeGroups,
  normalizeParadiseBrandColor, paradiseBrandColorInteger,
  paradiseCommandAllowedForMode, paradiseCommands, paradiseRuntimeCommandAccess, paradiseSetupChannelType, paradiseSetupChannelTypeMismatch, PARADISE_CHANNEL_MAPPINGS, PARADISE_CLAN_ROLES, PARADISE_COMMUNITY_ROLES, PARADISE_SETUP_SCHEMAS, PARADISE_VOICE_CHANNEL_NAMES, rankPower, rankToRoleName, shortVerificationCode,
  maskParadiseTranscriptText, paradiseSupportPanelPayload, paradiseSupportTicketControls,
  sanitizeTemporaryVoiceName, sessionLanguageCopy, trainingAnnouncementMarkdown, tryoutAnnouncementMarkdown,
  timedAvailabilityLines
} from "../src/paradise3a59.js";

test("score approval excludes Trial Referee and Referee by default", () => {
  assert.equal(canRoleNamesApproveScore(["Trial Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Referee"]), false);
  assert.equal(canRoleNamesApproveScore(["Experienced Referee"]), true);
  assert.equal(canRoleNamesApproveScore(["Referee Manager"]), true);
  assert.equal(canRoleNamesApproveScore([], true), true);
});

test("score approval routes configured Discord role IDs through the shared Paradise RBAC vocabulary", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /paradiseRoleKeysForMember/);
  assert.match(source, /PARADISE_PERMISSIONS\.REFEREE_APPROVE/);
  assert.match(source, /mappings: guildConfig\.roleMappings/);
});

test("challenge autowin uses shared referee-work RBAC instead of a separate role-name check", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /async function memberHasParadisePermission/);
  assert.match(source, /async function canWorkReferee/);
  assert.match(source, /if \(!await canWorkReferee\(interaction\.member\)\)/);
  assert.doesNotMatch(source, /const hasRefereeRole/);
});

test("Paradise support panel has state-aware transcript-first ticket controls", async () => {
  const launcher = paradiseSupportPanelPayload(0).components[0].toJSON();
  assert.equal(launcher.components[0].custom_id, "paradise_support_open");
  const open = paradiseSupportTicketControls("ticket-id", "open")[0].toJSON().components;
  assert.deepEqual(open.map(item => item.custom_id), [
    "paradise_support_claim:ticket-id",
    "paradise_support_close:ticket-id"
  ]);
  const claimed = paradiseSupportTicketControls("ticket-id", "claimed")[0].toJSON().components;
  assert.deepEqual(claimed.map(item => item.custom_id), [
    "paradise_support_unclaim:ticket-id",
    "paradise_support_close:ticket-id"
  ]);
  const closed = paradiseSupportTicketControls("ticket-id", "closed")[0].toJSON().components;
  assert.deepEqual(closed.map(item => item.custom_id), [
    "paradise_support_reopen:ticket-id",
    "paradise_support_delete:ticket-id"
  ]);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /paradise_support_delete_confirm:/);
  assert.match(source, /saveParadiseSupportTranscript\(interaction\.guild, interaction\.channel, locked, "delete"\)/);
  assert.match(source, /deletionState: "transcript_failed"/);
  assert.match(source, /await interaction\.channel\.delete\("Paradise transcript-first support ticket deletion"\)/);
  assert.match(source, /const canDelete = canApproveModeration\(interaction\.member\)/);
  assert.match(source, /\["support_logs_channel", "Private support ticket logs"\]/);
  assert.doesNotMatch(source.slice(source.indexOf("export function paradiseSupportTicketControls"), source.indexOf("function supportTicketStatusLabel")), /paradise_support_transcript/);
});

test("support ticket heading and state text follow the configured guild language", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /language === "tr" \? `DESTEK TICKETI — \$\{status\}` : `SUPPORT TICKET — \$\{status\}`/);
  assert.match(source, /if \(language === "en"\) \{/);
  assert.match(source, /return "CLOSED"/);
});

test("Paradise support transcripts mask common secrets before staff storage", () => {
  const masked = maskParadiseTranscriptText("mail person@example.com FIMA-ABCD-EFGH-IJKL mfa.abcdefghijklmnopqrstuv aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccc password @everyone");
  assert.doesNotMatch(masked, /person@example\.com|FIMA-ABCD|mfa\.abcdefghijklmnopqrstuv|@everyone/);
  assert.match(masked, /\[masked-email\].*\[masked-license-key\].*\[masked-token\].*@ blocked/);
});

test("test-guild smoke includes transcript-first close and reopen coverage", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /runParadiseSupportTicketLifecycleSmoke/);
  assert.match(source, /saveParadiseSupportTranscript\(guild, channel, record, "smoke-close"\)/);
  assert.match(source, /closedThenReopened: true/);
  assert.match(source, /supportTicketTranscriptReady/);
});

test("test-guild session lifecycle replies to the original Markdown announcement", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const smokeReply = async \(message, content, code\)/);
  assert.match(source, /await smokeReply\(training, `\$\{trainingCopy\.lockedReply\}/);
  assert.match(source, /await smokeReply\(tryout, `\$\{tryoutCopy\.lockedReply\}/);
  assert.match(source, /function tryoutAnnouncementMarkdown/);
  assert.match(source, /function trainingAnnouncementMarkdown/);
  assert.match(source, /trainingPlainMarkdown/);
  assert.match(source, /tryoutPlainMarkdown/);
});

test("training and tryout announcements follow the selected language and have no branding footer", () => {
  const trainingTr = trainingAnnouncementMarkdown({
    language: "tr", server: "Frankfurt, Germany", format: "First To 3", characters: "Saitama, Garou, Metal Bat",
    rules: ["LH yok", "Wall yok"], link: "https://example.test/private", hoster: "@hoster"
  });
  const tryoutTr = tryoutAnnouncementMarkdown({
    language: "tr", server: "Frankfurt, Germany", link: "https://example.test/private", hoster: "@hoster"
  });
  const trainingEn = trainingAnnouncementMarkdown({
    language: "en", server: "Frankfurt, Germany", format: "First To 3", characters: "Saitama", rules: ["No LH"], link: "https://example.test/private", hoster: "@hoster"
  });
  assert.match(trainingTr, /# ANTRENMAN[\s\S]*◇ Sunucu:[\s\S]*◇ Kurallar:[\s\S]*• LH yok/);
  assert.match(tryoutTr, /# DENEME AÇIK[\s\S]*◇ Sunucu:[\s\S]*◇ Değerlendirme:[\s\S]*◇ Kurallar:/);
  assert.match(trainingEn, /# TRAINING[\s\S]*◇ Server:[\s\S]*◇ Rules:/);
  assert.doesNotMatch(`${trainingTr}\n${tryoutTr}\n${trainingEn}`, /Made By Fieel/);
  assert.equal(sessionLanguageCopy("tr", "tryout").endButton, "DENEMEYİ BİTİR");
  assert.equal(sessionLanguageCopy("en", "tryout").endButton, "END TRYOUT");
});

test("repeat smoke refreshes boards without replaying a full template repair", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /reason: "existing_test_lab"/);
  assert.match(source, /const staffTeam = await updateStaffTeamEmbed\(guild\)/);
  assert.match(source, /leaderboardBoardCount/);
  assert.match(source, /staffTeamReady/);
});

test("availability panel uses a restart-safe guild-scoped component ID while keeping old panels repairable", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /family: "availability", guildId: guild\.id, entityId: "availability", action: "refresh"/);
  assert.match(source, /parseParadiseComponentId\(interaction\.customId, \{ guildId: interaction\.guildId \}\)/);
  assert.match(source, /outdatedParadiseComponentMessage/);
  assert.match(source, /interaction\.customId === "paradise_availability_refresh"/);
});

test("reconciliation is a test-guild-canary, rate-limited, and performs no Discord repair", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /async function runParadiseGuildReconciliation\(guild\)/);
  assert.match(source, /feature: "reconciliation_health"/);
  assert.match(source, /shouldRunParadiseReconciliation\(\{ lastRunAt:/);
  assert.match(source, /summarizeParadiseReconciliation\(result\)/);
  assert.match(source, /await runParadiseGuildReconciliation\(guild\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(source.slice(source.indexOf("async function runParadiseGuildReconciliation"), source.indexOf("async function runParadiseMaintenance")), /\.delete\(|\.create\(/);
});

test("compact lab rebuild remains hard-guarded to the disposable test guild", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const PARADISE_TEST_LAB_LAYOUT_REVISION/);
  assert.match(source, /rebuildParadiseTestTemplate\(guild, "tsbtr", "REBUILD TEST TSBTR"\)/);
  assert.match(source, /assertParadiseTestGuildMutation\(\{ guildId: guild\?\.id, operation: "rebuild" \}\)/);
  assert.match(source, /3a65-test-server-pre-rebuild-backup\.json/);
  assert.match(source, /buildParadiseRestoreDryRun\(\{ backup, currentSnapshot: snapshot \}\)/);
  assert.match(source, /backup_restore_dry_run_failed/);
});

test("application panel follows the selected server language and defaults to Turkish", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /function paradiseApplicationPanelPayload\(color, language = "tr"\)/);
  assert.match(source, /PARADISE BAŞVURULAR/);
  assert.match(source, /paradiseApplicationPanelPayload\(await paradiseBrandColor\(\), language\)/);
});

test("server templates hide irrelevant command families", () => {
  assert.equal(paradiseCommandAllowedForMode("challenge", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("roster", "community"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "community"), true);
  assert.equal(paradiseCommandAllowedForMode("challenge", "clan"), true);
  assert.equal(paradiseCommandAllowedForMode("fima_ticket", "clan"), false);
  assert.equal(paradiseCommandAllowedForMode("fima_update", "tsbtr"), false);
});

test("runtime command access uses the registry even when a command is still registered", () => {
  assert.equal(paradiseRuntimeCommandAccess({
    command: "challenge", subcommand: "create", template: "community", enabledModules: ["challenge"], channelConstraintConfigured: false
  }).code, "command_not_registered_for_template");
  assert.equal(paradiseRuntimeCommandAccess({
    command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Trial Referee"], channelConstraintConfigured: false
  }).code, "command_permission_denied");
  assert.equal(paradiseRuntimeCommandAccess({
    command: "training", subcommand: "start", template: "clan", enabledModules: ["training"], roleKeys: ["Training Hoster"], channelConstraintConfigured: false
  }).allowed, true);
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
  assert.ok(names.includes("qotd"));
  assert.ok(names.includes("answer"));
  assert.ok(names.includes("application"));
  assert.ok(names.includes("mod"));
  assert.ok(names.includes("security"));
  assert.ok(names.includes("rank"));
  assert.ok(names.includes("leaderboard"));
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
  assert.deepEqual(commands.find(command => command.name === "application").options.map(option => option.name), ["panel", "apply", "status"]);
  assert.deepEqual(commands.find(command => command.name === "training").options.map(option => option.name), ["setup", "create", "start", "result"]);
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "kick-request"));
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "ban-request"));
});

test("temporary voice names reject explicit and scam-like names", () => {
  assert.equal(sanitizeTemporaryVoiceName("Fieel's Arena", "Fieel's room"), "Fieel's Arena");
  assert.equal(sanitizeTemporaryVoiceName("PORNO room", "Fieel's room"), "Fieel's room");
  assert.equal(sanitizeTemporaryVoiceName("free token cookie", "Safe room"), "Safe room");
  assert.equal(sanitizeTemporaryVoiceName("   ", "Safe room"), "Safe room");
});

test("daily question answers are normalized without fuzzy false positives", () => {
  assert.equal(isQuestionAnswerMatch("İletişim", ["iletisim", "dinlemek"]), true);
  assert.equal(isQuestionAnswerMatch("  STAGE-0 ", ["stage 0"]), true);
  assert.equal(isQuestionAnswerMatch("stage 1", ["stage 0"]), false);
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
  assert.ok(PARADISE_SETUP_SCHEMAS.community.schema.some(([, channels]) => channels.includes("◇・destek")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("◆・lineuplar")));
  assert.ok(PARADISE_SETUP_SCHEMAS.tsbtr.schema.some(([, channels]) => channels.includes("⟡・top-30")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.schema.some(([, channels]) => channels.includes("⟡・müsaitlik-ve-loa")));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Stage 2 High Strong"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Top 30"));
  assert.ok(PARADISE_SETUP_SCHEMAS.clan.roles.includes("Frankfurt, Germany"));
  assert.ok(PARADISE_CLAN_ROLES.includes("BLACKLISTED"));
  assert.ok(PARADISE_COMMUNITY_ROLES.includes("BLACKLISTED"));
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("⟡・sonuçlar"), false);
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("◇・destek"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("◜・oda-oluştur"), true);
  assert.equal(PARADISE_SETUP_SCHEMAS.tsbtr.schema.flatMap(([, channels]) => channels).includes("〢・incelemeler"), true);
});

test("voice-purpose setup entries are real voice channels and wrong text mappings are detectable", async () => {
  for (const name of ["◜・oda-oluştur", "◜・topluluk-sesi", "◜・savaş-odası", "◞・afk"]) {
    assert.equal(PARADISE_VOICE_CHANNEL_NAMES.includes(name), true);
    assert.equal(paradiseSetupChannelType("━━ SESLER ━━", name), ChannelType.GuildVoice);
    assert.equal(paradiseSetupChannelTypeMismatch({ type: ChannelType.GuildText }, "━━ SESLER ━━", name), true);
    assert.equal(paradiseSetupChannelTypeMismatch({ type: ChannelType.GuildVoice }, "━━ SESLER ━━", name), false);
  }
  assert.equal(paradiseSetupChannelType("BAŞLANGIÇ", "rules"), ChannelType.GuildText);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const wrongTypeChannelIds = new Set\(\)/);
  assert.match(source, /wrongChannelTypes/);
  assert.match(source, /joined\?\.type === ChannelType\.GuildVoice/);
});

test("compact templates keep the critical panels without flooding the channel list", () => {
  const count = mode => PARADISE_SETUP_SCHEMAS[mode].schema.flatMap(([, channels]) => channels).length;
  const publicCount = mode => PARADISE_SETUP_SCHEMAS[mode].schema
    .filter(([, , privateCategory]) => !privateCategory)
    .flatMap(([, channels]) => channels)
    .filter(name => !PARADISE_VOICE_CHANNEL_NAMES.includes(name)).length;
  const privateCount = mode => PARADISE_SETUP_SCHEMAS[mode].schema
    .filter(([, , privateCategory]) => privateCategory)
    .flatMap(([, channels]) => channels).length;
  assert.ok(count("community") <= 20);
  assert.ok(count("clan") <= 28);
  assert.ok(count("tsbtr") <= 25);
  assert.ok(publicCount("community") >= 10 && publicCount("community") <= 12);
  assert.ok(publicCount("clan") >= 15 && publicCount("clan") <= 18);
  assert.ok(publicCount("tsbtr") >= 14 && publicCount("tsbtr") <= 17);
  for (const mode of ["community", "clan", "tsbtr"]) assert.equal(privateCount(mode), 6);
  assert.equal(PARADISE_SETUP_SCHEMAS.community.schema.flatMap(([, channels]) => channels).includes("role-guide"), false);
  assert.equal(PARADISE_SETUP_SCHEMAS.clan.schema.flatMap(([, channels]) => channels).includes("〢・personel-rehberleri"), true);
});

test("canonical handbooks are pinned and operational guides do not receive the global footer", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const GUIDE_FOOTER_KEYS = new Set\(\["rules", "role_guide", "faq_trust"\]\)/);
  assert.match(source, /message\.pin\?\.\("Paradise canonical channel handbook"\)/);
  assert.doesNotMatch(source, /\*\*SERVER LOCKED\*\*, \*\*UNLOCK\*\*, \*\*END\*\*/);
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
  const groups = [
    { label: "Leaders", minRank: 1, maxRank: 5, upwardDistance: 1, downwardDistance: 0 },
    { label: "Contenders", minRank: 6, maxRank: 12, upwardDistance: 4, downwardDistance: 1 }
  ];
  assert.equal(normalizeChallengeGroups({ topSize: 12, groups }).length, 2);
  assert.deepEqual(challengeTargetSpots(8, { topSize: 12, groups }), [4, 5, 6, 7, 9]);
  assert.throws(() => normalizeChallengeGroups({
    topSize: 5,
    groups: [{ minRank: 1, maxRank: 3 }, { minRank: 3, maxRank: 5 }]
  }), /overlapping_challenge_groups/);
});

test("unranked challenge eligibility requires Stage 2 High Weak or better", () => {
  assert.equal(meetsMinimumChallengeRank({ stage: 2, level: "High", strength: "Weak" }), true);
  assert.equal(meetsMinimumChallengeRank({ stage: 1, level: "Low", strength: "Weak" }), true);
  assert.equal(meetsMinimumChallengeRank({ stage: 2, level: "Mid", strength: "Strong" }), false);
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
