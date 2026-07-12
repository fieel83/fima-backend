import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import {
  applicationQuestionChunks, applyApprovedParadiseChallengeResult, assertUniqueParadiseRobloxIdentity, buildParadiseSafeLogEvent, canAssignRank, canRoleNamesApproveScore, challengeBlockReason, challengedLines, challengeTargetSpots, compareRanks,
  isQuestionAnswerMatch,
  meetsMinimumChallengeRank, normalizeChallengeGroups,
  canViewParadiseLogEvent, localizeParadiseGuide, normalizeParadiseBrandColor, normalizeParadiseChallengeScore, paradiseBrandColorInteger, paradiseGuildContentLanguage, paradiseLogPolicy, PARADISE_GUIDE_TR_COPY, recordParadiseChallengeAudit, recordParadiseLeaderboardAudit,
  paradiseCommandAllowedForMode, paradiseCommands, paradiseRuntimeCommandAccess, paradiseSetupChannelType, paradiseSetupChannelTypeMismatch, PARADISE_CHANNEL_MAPPINGS, PARADISE_CLAN_ROLES, PARADISE_COMMUNITY_ROLES, PARADISE_SETUP_SCHEMAS, PARADISE_VOICE_CHANNEL_NAMES, rankPower, rankToRoleName, shortVerificationCode,
  maskParadiseTranscriptText, normalizeParadiseTicketCategory, paradiseSupportPanelPayload, paradiseSupportTicketControls, paradiseTicketCategoriesForMode, renderParadiseTicketChannelName, transitionParadiseSupportTicket,
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

test("approved challenge results validate first and commit leaderboard, ticket and availability together", () => {
  const input = {
    config: {}, guildConfigs: { guild: { challenge: { cooldownDays: 3, immunityDays: 3, top10CooldownDays: 7 } } },
    leaderboard: {}, leaderboards: { guild: {
      winner: { spot: 12, wins: 3, losses: 1 },
      loser: { spot: 11, wins: 4, losses: 2 }
    } },
    pendingChallenges: {
      ticket: { guildId: "guild", status: "open", challengerId: "winner", opponentId: "loser", challengerSpot: 12, opponentSpot: 11 },
      submission: { guildId: "guild", status: "pending", ticketId: "ticket", winnerId: "winner", loserId: "loser", winnerSpot: 12, loserSpot: 11, score: "10-4", refereeId: "ref" }
    },
    staffActivity: {}
  };
  const result = applyApprovedParadiseChallengeResult(input, {
    submissionId: "submission", approvedBy: "manager", now: Date.UTC(2026, 6, 12, 12, 0, 0)
  });
  assert.equal(input.pendingChallenges.ticket.status, "open", "input remains untouched if a caller needs to abort");
  assert.equal(result.state.pendingChallenges.ticket.status, "closed");
  assert.equal(result.state.pendingChallenges.submission.status, "approved");
  assert.equal(result.state.leaderboards.guild.winner.wins, 4);
  assert.equal(result.state.leaderboards.guild.loser.losses, 3);
  assert.match(String(result.state.leaderboards.guild.winner.availability.immunityUntil), /^178/);
  assert.match(String(result.state.leaderboards.guild.loser.availability.cooldownUntil), /^178/);
  assert.equal(result.state.staffActivity.ref.referee.length, 1);
  assert.equal(result.state.challengeAudits.guild[0].action, "approved");
  assert.equal(result.state.challengeAudits.guild[0].ticketId, "ticket");
});

test("challenge result rejects a closed or mismatched ticket without changing state", () => {
  const input = {
    config: {}, guildConfigs: { guild: {} }, leaderboard: {}, leaderboards: { guild: {} }, staffActivity: {},
    pendingChallenges: {
      ticket: { guildId: "guild", status: "closed", challengerId: "winner", opponentId: "loser" },
      submission: { guildId: "guild", status: "pending", ticketId: "ticket", winnerId: "winner", loserId: "loser", score: "3-1", refereeId: "ref" }
    }
  };
  assert.throws(() => applyApprovedParadiseChallengeResult(input, { submissionId: "submission", approvedBy: "manager" }), {
    code: "challenge_ticket_not_open"
  });
  assert.equal(input.pendingChallenges.submission.status, "pending");
});

test("leaderboard manual audit is guild-scoped and bounded", () => {
  const state = { leaderboardHistory: {} };
  recordParadiseLeaderboardAudit(state, { guildId: "guild-a", action: "move", actorId: "staff-a", metadata: { userId: "user", rank: 8 }, now: "2026-07-12T12:00:00.000Z" });
  recordParadiseLeaderboardAudit(state, { guildId: "guild-b", action: "clear", actorId: "staff-b", metadata: { previousCount: 3 }, now: "2026-07-12T12:01:00.000Z" });
  assert.equal(state.leaderboardHistory["guild-a"].length, 1);
  assert.equal(state.leaderboardHistory["guild-a"][0].metadata.rank, 8);
  assert.equal(state.leaderboardHistory["guild-b"][0].action, "clear");
});

test("challenge approval audit is guild-scoped and redacts sensitive metadata", () => {
  const state = { challengeAudits: {} };
  recordParadiseChallengeAudit(state, {
    guildId: "guild", action: "denied", actorId: "manager", submissionId: "submission", ticketId: "ticket",
    metadata: { note: "FIMA-ABCD-EFGH-IJKL" }, now: "2026-07-12T12:00:00.000Z"
  });
  assert.equal(state.challengeAudits.guild[0].action, "denied");
  assert.doesNotMatch(JSON.stringify(state.challengeAudits.guild[0]), /FIMA-ABCD/);
});

test("Paradise log envelopes classify events and redact private credential material", () => {
  const event = buildParadiseSafeLogEvent({
    guildId: "guild", type: "payment_license", title: "License check", correlationId: "case-1",
    description: "person@example.test FIMA-ABCD-EFGH-IJKL mfa.abcdefghijklmnopqrstuv https://discord.com/api/webhooks/123/secret",
    metadata: { customerEmail: "person@example.test", hwid: "device-123456789", allowed: true }
  });
  assert.equal(event.type, "payment_license");
  assert.equal(event.correlationId, "case-1");
  assert.doesNotMatch(`${event.description} ${JSON.stringify(event.metadata)}`, /person@example\.test|FIMA-ABCD|mfa\.abcdefghijklmnopqrstuv|webhooks\/123|device-123456789/);
  assert.equal(event.metadata.masked, "[masked]");
  assert.equal(event.metadata.allowed, true);
});

test("Paradise log policy enforces bounded retention and private viewer scopes", () => {
  assert.deepEqual(paradiseLogPolicy({ logSettings: { retentionDays: 9000, viewerScope: "invalid" } }, "ticket"), {
    retentionDays: 3650, viewerScope: "staff"
  });
  const event = buildParadiseSafeLogEvent({ guildId: "guild", type: "security", viewerScope: "managers" });
  assert.equal(canViewParadiseLogEvent({ event, roleKeys: ["moderator"] }), false);
  assert.equal(canViewParadiseLogEvent({ event, roleKeys: ["manager"] }), true);
  assert.equal(canViewParadiseLogEvent({ event: { ...event, viewerScope: "owners" }, roleKeys: ["manager"] }), false);
  assert.equal(canViewParadiseLogEvent({ event: { ...event, viewerScope: "owners" }, roleKeys: ["owner"] }), true);
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
  assert.equal(launcher.components[0].custom_id, "paradise_support_category");
  assert.ok(launcher.components[0].options.some(option => option.value === "payment_license"));
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
  assert.match(source, /action: "transcript_failed"/);
  assert.match(source, /await interaction\.channel\.delete\("Paradise transcript-first support ticket deletion"\)/);
  assert.match(source, /const canDelete = canApproveModeration\(interaction\.member\)/);
  assert.match(source, /\["support_logs_channel", "Private support ticket logs"\]/);
  assert.doesNotMatch(source.slice(source.indexOf("export function paradiseSupportTicketControls"), source.indexOf("function supportTicketStatusLabel")), /paradise_support_transcript/);
});

test("ticket categories remain template-scoped and lifecycle names never expose private account data", () => {
  assert.deepEqual(paradiseTicketCategoriesForMode("community").map(([id]) => id), ["support", "payment_license", "app_problem", "application", "security_report", "other"]);
  assert.equal(normalizeParadiseTicketCategory("community", "payment_license"), "payment_license");
  assert.equal(normalizeParadiseTicketCategory("clan", "payment_license"), null);
  assert.equal(normalizeParadiseTicketCategory("tsbtr", "leaderboard_profile"), "leaderboard_profile");
  const name = renderParadiseTicketChannelName({
    format: "{status}-{category}-{username}-{number}", status: "closed", category: "payment_license",
    username: "Fieel@example.test", number: 42
  });
  assert.equal(name, "closed-payment_license-fieel-example-test-42");
  assert.ok(name.length <= 90);
  assert.doesNotMatch(name, /@|\./);
});

test("support ticket transitions prevent stale actions and keep transcript failure retryable", () => {
  const base = { id: "ticket-1", status: "open", auditTrail: [] };
  const claimed = transitionParadiseSupportTicket(base, { action: "claim", actorId: "staff-1", now: "2026-07-12T12:00:00.000Z" });
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.claimedBy, "staff-1");
  const closed = transitionParadiseSupportTicket(claimed, { action: "close", actorId: "staff-1" });
  assert.equal(closed.status, "closed");
  const pending = transitionParadiseSupportTicket(closed, { action: "begin_delete", actorId: "admin-1" });
  const failed = transitionParadiseSupportTicket(pending, { action: "transcript_failed", actorId: "admin-1" });
  assert.equal(failed.status, "transcript_failed");
  assert.deepEqual(paradiseSupportTicketControls("ticket-id", failed.status)[0].toJSON().components.map(item => item.custom_id), [
    "paradise_support_reopen:ticket-id", "paradise_support_delete:ticket-id"
  ]);
  assert.throws(() => transitionParadiseSupportTicket(base, { action: "reopen", actorId: "staff-1" }), { code: "support_ticket_invalid_transition" });
  assert.throws(() => transitionParadiseSupportTicket(pending, { action: "close", actorId: "staff-1" }), { code: "support_ticket_invalid_transition" });
});

test("ticket slash commands exist and dispatch to the same lifecycle transition gate", () => {
  const command = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "ticket");
  assert.ok(command);
  const names = command.options.map(option => option.name);
  for (const required of ["open", "info", "claim", "unclaim", "close", "reopen", "delete", "rename", "add", "remove", "escalate", "transcript", "panel", "config", "repair", "logs"]) {
    assert.ok(names.includes(required), `missing /ticket ${required}`);
  }
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

test("application forms stay within Discord's five-input modal limit and retain the required role-specific scenario", () => {
  const macroChunks = applicationQuestionChunks("macro_staff");
  assert.ok(macroChunks.length >= 2);
  assert.ok(macroChunks.every(chunk => chunk.length > 0 && chunk.length <= 5));
  const trainingPrompts = applicationQuestionChunks("training_hoster").flat().map(question => question[2]).join(" ");
  assert.match(trainingPrompts, /Sunucuda 10 kişi var, takımları nasıl dengeli kurarsın\?/);
  assert.doesNotMatch(trainingPrompts, /5v5 takımları/i);
});

test("application more-info follow-up returns the same record to private review without creating a duplicate", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /setName\("continue"\)/);
  assert.match(source, /paradise_application_more_info:/);
  assert.match(source, /record\.status !== "more_info"/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /applicationReviewComponents\(id\)/);
  const application = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "application");
  assert.ok(application.options.some(option => option.name === "continue"));
  const registrySource = await (await import("node:fs/promises")).readFile(new URL("../src/paradiseCommandRegistry.js", import.meta.url), "utf8");
  assert.match(registrySource, /CMD-APPLICATION-CONTINUE/);
  assert.match(registrySource, /memberSafe: true/);
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
  assert.deepEqual(commands.find(command => command.name === "profile").options.map(option => option.name), ["create", "view", "edit", "privacy", "verify-status"]);
  const mappingCommands = ["set", "setlogchannel"].flatMap(name => commands.find(command => command.name === name).options);
  assert.equal(mappingCommands.length, PARADISE_CHANNEL_MAPPINGS.length);
  assert.ok(commands.find(command => command.name === "set").options.length <= 25);
  assert.ok(commands.find(command => command.name === "setlogchannel").options.length <= 25);
  assert.deepEqual(commands.find(command => command.name === "lineup").options.map(option => option.name), ["add", "remove", "move", "edit", "clear", "panel", "repost"]);
  assert.deepEqual(commands.find(command => command.name === "roster").options.map(option => option.name), ["add", "update", "remove", "panel", "repost"]);
  assert.deepEqual(commands.find(command => command.name === "application").options.map(option => option.name), ["panel", "apply", "status", "continue"]);
  assert.deepEqual(commands.find(command => command.name === "training").options.map(option => option.name), ["setup", "create", "start", "result"]);
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "kick-request"));
  assert.ok(commands.find(command => command.name === "mod").options.some(option => option.name === "ban-request"));
});

test("ranked leaderboard keeps public notes opt-in and exposes audited edit/clear/history operations", async () => {
  const command = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "leaderboard");
  for (const required of ["add", "edit", "move", "swap", "remove", "clear", "repost", "import", "export", "history"]) {
    assert.ok(command.options.some(option => option.name === required), `missing /leaderboard ${required}`);
  }
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /const showPublicNotes = guildConfig\.leaderboard\?\.showPublicNotes === true/);
  assert.match(source, /recordParadiseLeaderboardAudit\(next/);
  assert.match(source, /Type `CLEAR` exactly to confirm/);
});

test("Top 10/20/30 cards retain stored IDs and edit in place", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /rankedLeaderboardMessageIds/);
  assert.match(source, /message\.edit\(\{ content: boardContent, embeds: cards\.slice\(0, 10\) \}\)/);
  assert.match(source, /setTitle\(language === "tr" \? `✦ #\$\{rank\} — Boş`/);
  assert.match(source, /Bağışıklık bitiyor: <t:\$\{stamp\}:R>/);
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

test("profile identity rejects duplicate Roblox verification and keeps completion guild-scoped", async () => {
  assert.equal(assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-a", "roblox-a"), true);
  assert.equal(assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-b", "roblox-b"), true);
  assert.throws(() => assertUniqueParadiseRobloxIdentity({ "discord-a": { robloxId: "roblox-a" } }, "discord-b", "roblox-a"), { code: "roblox_identity_already_verified" });
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /state\.guildProfiles\[interaction\.guildId\]/);
  assert.match(source, /setName\("privacy"\)/);
  assert.match(source, /visibility === "private"/);
  const profile = paradiseCommands().map(item => item.toJSON()).find(item => item.name === "profile");
  assert.ok(profile.options.some(option => option.name === "privacy"));
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

test("staff command guide is a single role-aware panel and language details are ephemeral", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /setCustomId\("paradise_staff_guide_category"\)/);
  assert.match(source, /visibleParadiseStaffCommands\(paradiseRegistryContextForInteraction/);
  assert.match(source, /interaction\.reply\(\{ \.\.\.staffGuidePayload\(language\), ephemeral: true \}\)/);
  assert.match(source, /definition\.key === "staff_command_guide"\s*\? staffGuidePayload/);
});

test("guild panel language stays separate from a visitor dashboard preference and public member help remains private", async () => {
  assert.equal(paradiseGuildContentLanguage({ language: "tr", dashboardLanguage: "en" }), "tr");
  assert.equal(paradiseGuildContentLanguage({ locale: "en", dashboardLanguage: "tr" }), "en");
  assert.equal(paradiseGuildContentLanguage({ dashboardLanguage: "en" }), "tr");
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const languageHandler = source.slice(source.indexOf('if (interaction.customId.startsWith("paradise_member_help_lang:"))'), source.indexOf('if (String(interaction.customId || "").startsWith("pv:"))'));
  assert.match(languageHandler, /interaction\.reply\(\{ \.\.\.payload, ephemeral: true \}\)/);
  assert.doesNotMatch(languageHandler, /interaction\.update\(payload\)/);
});

test("canonical guide text has Turkish copy for every non-dynamic handbook", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const guideSection = source.slice(source.indexOf("const GUIDE_POSTS"), source.indexOf("const GUIDE_MAPPING_KEYS"));
  const guideKeys = [...guideSection.matchAll(/key: "([a-z_]+)"/g)].map(match => match[1]);
  const expected = guideKeys.filter(key => key !== "staff_command_guide");
  for (const key of expected) {
    assert.ok(PARADISE_GUIDE_TR_COPY[key], `missing Turkish copy for ${key}`);
    const localized = localizeParadiseGuide({ key, title: "English", body: "English body" }, "tr");
    assert.notEqual(localized.title, "English");
    assert.notEqual(localized.body, "English body");
  }
  const english = localizeParadiseGuide({ key: "rules", title: "English", body: "English body" }, "en");
  assert.equal(english.title, "English");
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

test("challenge score submissions require a referee, valid score and the open ticket participants", async () => {
  assert.equal(normalizeParadiseChallengeScore("10 - 5"), "10-5");
  assert.equal(normalizeParadiseChallengeScore("auto"), "Auto");
  assert.throws(() => normalizeParadiseChallengeScore("10 to 5"), { code: "invalid_challenge_score" });
  assert.throws(() => normalizeParadiseChallengeScore("10-10"), { code: "invalid_challenge_score" });
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(source, /if \(!await canWorkReferee\(interaction\.member\)\) return interaction\.reply/);
  assert.match(source, /Submit the score inside an open Paradise challenge ticket/);
  assert.match(source, /Winner and loser must be the two fighters recorded in this challenge ticket/);
  assert.match(source, /resolveParadiseChallengeCoReferee/);
  assert.match(source, /recordParadiseChallengeAudit/);
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
