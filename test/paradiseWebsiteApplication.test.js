import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { ChannelType } from "discord.js";
import {
  handleParadiseInteraction,
  paradiseApplicationAutoGrantRoleKey,
  paradiseApplicationAutoGrantRoleName,
  applicationQuestionChunks,
  paradiseWebsiteApplicationContext,
  paradiseWebsiteApplicationTypesForMode,
  setParadiseApplicationEvidenceScanner,
  transitionParadiseApplicationClarification,
  transitionParadiseApplicationReview,
  validateParadiseApplicationEvidenceSubmission,
  submitParadiseWebsiteApplication
} from "../src/paradise3a59.js";
import {
  paradiseApplicationHttpError,
  requireParadisePrivateReviewQueued
} from "../src/paradiseApplicationHttp.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../public/assets/js/paradise-apply.js", import.meta.url), "utf8");
const applicationHtml = fs.readFileSync(new URL("../public/paradise-apply.html", import.meta.url), "utf8");
const englishQuestionSource = fs.readFileSync(
  new URL("../public/assets/js/paradise-application-questions-en.js", import.meta.url),
  "utf8"
);
const paradiseSource = fs.readFileSync(new URL("../src/paradise3a59.js", import.meta.url), "utf8");

function channelCache(channels) {
  return {
    get(id) {
      return channels.find(channel => channel.id === id);
    },
    find(predicate) {
      return channels.find(predicate);
    }
  };
}

function validPngEvidence(questionKey, name = "proof.png") {
  return {
    questionKey,
    name,
    mimeType: "image/png",
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")
  };
}

function applicationAnswers(type) {
  return Object.fromEntries(type.questions.map(question => [question.key, "x".repeat(question.min)]));
}

test("configured application questions append safely and reject case-insensitive reserved keys", () => {
  const baseChunks = applicationQuestionChunks("creator");
  const chunks = applicationQuestionChunks("creator", {
    extraQuestions: {
      creator: {
        WHY: "Temel soruyu taklit etmemeli",
        Audience: "Başka bir temel soruyu taklit etmemeli",
        ChannelFocus: "Kanalının ana odağı nedir?",
        CHANNELFOCUS: "Tekrarlanan özel soru"
      }
    }
  });
  const baseKeys = baseChunks.flat().map(([key]) => key);
  const questions = chunks.flat();
  const keys = questions.map(([key]) => key);
  assert.ok(baseKeys.every(key => keys.includes(key)));
  assert.equal(keys.filter(key => key === "why").length, 1);
  assert.equal(keys.filter(key => key === "audience").length, 1);
  assert.equal(keys.filter(key => key === "channelfocus").length, 1);
  assert.equal(questions.find(([key]) => key === "channelfocus")?.[1], "Kanalının ana odağı nedir?");
});

function websiteApplicationGuild({ guildId, userId, onThreadSend }) {
  const thread = {
    id: `thread-${crypto.randomUUID()}`,
    send: onThreadSend,
    delete: async () => null
  };
  const reviewChannel = {
    id: `review-${crypto.randomUUID()}`,
    name: "application-reviews",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    threads: {
      create: async options => {
        assert.equal(options.type, ChannelType.PrivateThread);
        assert.equal(options.invitable, false);
        return thread;
      }
    }
  };
  const applicationLogChannel = {
    id: `logs-${crypto.randomUUID()}`,
    name: "application-logs",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    send: async () => ({ id: `log-${crypto.randomUUID()}` })
  };
  const channels = [reviewChannel, applicationLogChannel, thread];
  return {
    id: guildId,
    name: "Website application integration guild",
    members: { fetch: async id => id === userId ? { id } : null },
    channels: {
      cache: channelCache(channels),
      fetch: async id => channels.find(channel => channel.id === id) || null
    }
  };
}

function applicationReviewHarness() {
  const guildId = `application-review-${crypto.randomUUID()}`;
  const userId = `applicant-${crypto.randomUUID()}`;
  const helperRole = { id: `helper-${crypto.randomUUID()}`, name: "Helper", managed: false };
  const events = {
    dms: [],
    logs: [],
    messageEdits: [],
    modals: [],
    replies: [],
    roleAdds: [],
    updates: []
  };
  const reviewMessage = {
    id: `message-${crypto.randomUUID()}`,
    embeds: [],
    components: [],
    async edit(payload) {
      events.messageEdits.push(payload);
      if (payload.embeds) this.embeds = payload.embeds;
      if (payload.components) this.components = payload.components;
      return this;
    }
  };
  const thread = {
    id: `thread-${crypto.randomUUID()}`,
    async send(payload) {
      reviewMessage.embeds = payload.embeds;
      reviewMessage.components = payload.components;
      return reviewMessage;
    },
    messages: {
      fetch: async id => id === reviewMessage.id ? reviewMessage : null
    },
    delete: async () => null,
    isTextBased: () => true
  };
  const reviewChannel = {
    id: `review-${crypto.randomUUID()}`,
    name: "application-reviews",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    threads: {
      create: async options => {
        assert.equal(options.type, ChannelType.PrivateThread);
        assert.equal(options.invitable, false);
        return thread;
      }
    }
  };
  const applicationLogChannel = {
    id: `logs-${crypto.randomUUID()}`,
    name: "application-logs",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    send: async payload => {
      events.logs.push(payload);
      return { id: `log-${crypto.randomUUID()}` };
    }
  };
  const channels = [reviewChannel, applicationLogChannel, thread];
  const applicantMember = {
    id: userId,
    roles: {
      add: async role => {
        events.roleAdds.push(role.id);
        return applicantMember;
      }
    }
  };
  const highestRole = { comparePositionTo: () => 1 };
  const guild = {
    id: guildId,
    name: "Application review integration guild",
    roles: { cache: channelCache([helperRole]) },
    members: {
      me: { roles: { highest: highestRole } },
      fetch: async id => id === userId ? applicantMember : null
    },
    channels: {
      cache: channelCache(channels),
      fetch: async id => channels.find(channel => channel.id === id) || null
    }
  };
  const reviewerMember = {
    permissions: { has: () => true },
    roles: { cache: { some: () => false }, highest: highestRole }
  };
  const interaction = (customId, { actor = "reviewer", fields = {}, modal = false } = {}) => ({
    customId,
    guild,
    guildId,
    member: actor === "reviewer" ? reviewerMember : applicantMember,
    user: actor === "reviewer"
      ? { id: "reviewer", username: "Reviewer", toString: () => "<@reviewer>" }
      : { id: userId, username: "Applicant", toString: () => `<@${userId}>` },
    client: {
      users: {
        fetch: async id => id === userId ? { send: async payload => events.dms.push(payload) } : null
      }
    },
    message: reviewMessage,
    fields: { getTextInputValue: key => fields[key] || "" },
    isButton: () => !modal,
    isModalSubmit: () => modal,
    isChatInputCommand: () => false,
    isStringSelectMenu: () => false,
    reply: async payload => {
      events.replies.push(payload);
      return payload;
    },
    showModal: async value => {
      events.modals.push(value);
      return value;
    },
    update: async payload => {
      events.updates.push(payload);
      if (payload.embeds) reviewMessage.embeds = payload.embeds;
      if (payload.components) reviewMessage.components = payload.components;
      return payload;
    }
  });
  return { events, guild, helperRole, interaction, reviewMessage, userId };
}

function applicationReviewButtonId(message, action) {
  return message.components
    .flatMap(row => row.toJSON().components)
    .find(component => component.custom_id.startsWith(`paradise_application_${action}:`))
    ?.custom_id;
}

async function submitHarnessApplication(harness) {
  const context = await paradiseWebsiteApplicationContext(harness.guild, harness.userId);
  const type = context.types[0];
  const result = await submitParadiseWebsiteApplication(harness.guild, {
    userId: harness.userId,
    type: type.type,
    workflow: "staff",
    answers: applicationAnswers(type),
    evidence: []
  });
  return { context, result, type };
}

test("public website applications expose the safe Community, server-scoped, and business matrices", () => {
  assert.deepEqual(paradiseWebsiteApplicationTypesForMode("community", "staff").map(item => item.type), [
    "helper", "staff", "moderator", "support", "training_hoster", "event_staff", "giveaway_staff", "content_creator",
    "video_team", "creative_team", "developer", "fima_support", "macro_staff", "fflag_staff"
  ]);
  assert.deepEqual(paradiseWebsiteApplicationTypesForMode("clan", "staff").map(item => item.type), [
    "staff", "moderator", "support", "training_hoster", "tryout_hoster", "referee",
    "event_staff", "giveaway_staff", "content_creator", "video_team", "creative_team", "developer", "clan_mainer", "war_hoster"
  ]);
  assert.deepEqual(paradiseWebsiteApplicationTypesForMode("tsbtr", "staff").map(item => item.type), [
    "staff", "moderator", "support", "training_hoster", "tryout_hoster", "referee",
    "event_staff", "giveaway_staff", "content_creator", "video_team", "creative_team", "developer"
  ]);
  assert.deepEqual(paradiseWebsiteApplicationTypesForMode("unknown", "staff"), []);
  for (const mode of ["community", "clan", "tsbtr", "unknown"]) {
    assert.deepEqual(
      paradiseWebsiteApplicationTypesForMode(mode, "business").map(item => item.type),
      ["partnership", "creator", "reseller"]
    );
  }
  for (const serverScoped of ["tryout_hoster", "referee", "clan_mainer", "war_hoster"]) {
    assert.equal(paradiseWebsiteApplicationTypesForMode("community", "staff").some(item => item.type === serverScoped), false);
  }
  assert.match(clientSource, /\["staff", "business"\]\.includes\(requestedWorkflow\)/);
  assert.match(clientSource, /workflow\s*===\s*"business"\s*\?\s*"partnership"\s*:\s*""/);
  assert.match(clientSource, /if \(preferredType\) applicationQuery\.set\("type", preferredType\)/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/helper" data-application-route="helper" data-application-workflow="staff"/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/moderator" data-application-route="moderator" data-application-workflow="staff"/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/video-team" data-application-route="video_team" data-application-workflow="staff"/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/creative-team" data-application-route="creative_team" data-application-workflow="staff"/);
  assert.match(applicationHtml, /id="staffWorkflow"[^>]+href="\?workflow=staff"/);
  assert.match(applicationHtml, /id="businessWorkflow"[^>]+workflow=business&amp;type=partnership/);
  assert.match(applicationHtml, /Partnership \/ Creator \/ Reseller/);
  assert.match(applicationHtml, /id="typeCards"[^>]+role="list"/);
  assert.match(applicationHtml, /Community; Helper, Staff, Moderator, Support, Training Hoster, Event, Giveaway, Content Creator, Video Team, Creative Team, Developer ve ürün destek rolleri/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/video-team"[^>]*>Video Team<\/a>/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/creative-team"[^>]*>Creative Team<\/a>/);
  assert.match(applicationHtml, /href="\/fima-bot\/apply\/developer"[^>]*>Developer<\/a>/);
  assert.match(applicationHtml, /Competitive \/ TSBTR/);
  assert.match(applicationHtml, /Creator \/ Media/);
  assert.match(applicationHtml, /Reseller \/ Affiliate/);
  assert.match(applicationHtml, /Content, Video, Creative ve Development collaboration/);
  assert.match(applicationHtml, /Helper dahil hiçbir rol otomatik verilmez/);
  assert.match(applicationHtml, /context\.types/);
  assert.match(applicationHtml, /özel Discord inceleme kuyruğuna/);
  assert.match(clientSource, /function renderTypeCards\(items = \[\]\)/);
  assert.match(clientSource, /renderTypeCards\(context\.types\)/);
  assert.match(clientSource, /title\.textContent = item\.label/);
  assert.match(clientSource, /typeSelect\.value = item\.type;[\s\S]*?typeSelect\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(clientSource, /button\.setAttribute\("aria-pressed", String\(button\.dataset\.applicationType === typeSelect\.value\)\)/);
  assert.match(serverSource, /\["\/paradise\/reseller", "\/bot\/reseller"\][\s\S]*?redirect\(302, "\/fima-bot\/apply\?workflow=business&type=reseller"\)/);
});

test("Video Team, Creative Team and Developer use distinct ten-question banks with complete English UI copy", () => {
  const expectedKeys = {
    video_team: [
      "portfolio", "editing_stack", "weekly_capacity", "source_rights", "privacy",
      "delivery_workflow", "feedback", "brand_safety", "availability", "why"
    ],
    creative_team: [
      "portfolio", "disciplines", "brief_process", "brand_consistency", "collaboration",
      "delivery", "feedback", "rights", "availability", "why"
    ],
    developer: [
      "languages", "projects", "debugging", "review_workflow", "testing",
      "least_privilege", "secrets", "rollback", "availability", "why"
    ]
  };
  const defaultKeys = applicationQuestionChunks("default").flat().map(([key]) => key);
  for (const [type, expected] of Object.entries(expectedKeys)) {
    const actual = applicationQuestionChunks(type).flat().map(([key]) => key);
    assert.deepEqual(actual, expected);
    assert.notDeepEqual(actual, defaultKeys);
  }
  assert.notDeepEqual(expectedKeys.video_team, expectedKeys.creative_team);
  assert.notDeepEqual(expectedKeys.creative_team, expectedKeys.developer);

  const videoEnglishStart = englishQuestionSource.indexOf("video_team: Object.freeze({");
  const creativeEnglishStart = englishQuestionSource.indexOf("creative_team: Object.freeze({");
  const developerEnglishStart = englishQuestionSource.indexOf("developer: Object.freeze({");
  const creatorEnglishStart = englishQuestionSource.indexOf("creator: Object.freeze({", developerEnglishStart);
  assert.ok(videoEnglishStart >= 0 && creativeEnglishStart > videoEnglishStart && developerEnglishStart > creativeEnglishStart && creatorEnglishStart > developerEnglishStart);
  const englishSections = {
    video_team: englishQuestionSource.slice(videoEnglishStart, creativeEnglishStart),
    creative_team: englishQuestionSource.slice(creativeEnglishStart, developerEnglishStart),
    developer: englishQuestionSource.slice(developerEnglishStart, creatorEnglishStart)
  };
  for (const [type, expected] of Object.entries(expectedKeys)) {
    for (const key of expected) assert.match(englishSections[type], new RegExp(`\\b${key}: question\\(`));
  }
});

test("application language changes preserve the draft while rerendering localized questions", () => {
  const englishScript = applicationHtml.indexOf("/assets/js/paradise-application-questions-en.js");
  const rendererScript = applicationHtml.indexOf("/assets/js/paradise-apply.js");
  assert.ok(englishScript >= 0 && rendererScript > englishScript);
  assert.match(clientSource, /window\.FimaApplicationQuestionEnglish\?\.\[type\.type\]/);
  const listenerStart = clientSource.indexOf('document.addEventListener("fima:language-change"');
  const listenerEnd = clientSource.indexOf("\n  });", listenerStart);
  const listener = clientSource.slice(listenerStart, listenerEnd);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart);
  assert.match(listener, /saveLocalDraft\(\{ announce: false \}\)/);
  assert.ok(listener.indexOf("saveLocalDraft") < listener.indexOf("renderTypeCards"));
  assert.ok(listener.indexOf("renderTypeCards") < listener.indexOf("renderQuestions"));
});

test("website application submit leaves no pending record or submitted log when private thread creation fails", async () => {
  const guildId = `application-test-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  let privateThreadAttempts = 0;
  let applicationLogSends = 0;
  const reviewChannel = {
    id: "review-channel",
    name: "application-reviews",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    threads: {
      create: async () => {
        privateThreadAttempts += 1;
        return null;
      }
    }
  };
  const applicationLogChannel = {
    id: "application-log-channel",
    name: "application-logs",
    type: ChannelType.GuildText,
    isTextBased: () => true,
    send: async () => {
      applicationLogSends += 1;
      return { id: "unexpected-log" };
    }
  };
  const channels = [reviewChannel, applicationLogChannel];
  const guild = {
    id: guildId,
    name: "Website application regression guild",
    members: { fetch: async id => id === userId ? { id } : null },
    channels: {
      cache: channelCache(channels),
      fetch: async id => channels.find(channel => channel.id === id) || null
    }
  };

  const before = await paradiseWebsiteApplicationContext(guild, userId);
  const availableType = before.types[0];
  assert.ok(availableType, "the configured staff workflow must expose an application type");
  const answers = Object.fromEntries(availableType.questions.map(question => [question.key, "x".repeat(question.min)]));

  let successfulResult = null;
  await assert.rejects(async () => {
    successfulResult = await submitParadiseWebsiteApplication(guild, {
      userId,
      type: availableType.type,
      workflow: "staff",
      answers,
      evidence: []
    });
  }, { code: "application_private_review_unavailable", statusCode: 503 });

  const after = await paradiseWebsiteApplicationContext(guild, userId);
  assert.equal(successfulResult, null, "failed submission must not return a success result");
  assert.equal(after.activeApplication, null, "failed submission must not leave a pending application");
  assert.equal(privateThreadAttempts, 1);
  assert.equal(applicationLogSends, 0, "submitted log must not be written before private delivery succeeds");
});

test("successful website submission creates a private thread and puts every answer in its first embed", async () => {
  const guildId = `application-success-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  let firstPayload = null;
  const guild = websiteApplicationGuild({
    guildId,
    userId,
    onThreadSend: async payload => {
      firstPayload = payload;
      return { id: `message-${crypto.randomUUID()}` };
    }
  });
  const context = await paradiseWebsiteApplicationContext(guild, userId);
  const type = context.types.find(item => item.type === "staff");
  assert.ok(type, "a non-Helper Community staff application must be public");
  const answers = applicationAnswers(type);

  const result = await submitParadiseWebsiteApplication(guild, {
    userId,
    type: type.type,
    workflow: "staff",
    answers,
    evidence: []
  });

  assert.equal(result.reviewQueued, true);
  assert.equal(result.type, "staff");
  assert.ok(firstPayload);
  assert.equal(firstPayload.components[0].components.length, 3);
  const embed = firstPayload.embeds[0].toJSON();
  for (const question of type.questions) {
    assert.ok(embed.fields.some(field => field.name === question.label && field.value === answers[question.key]));
  }
});

test("clean evidence is attached to the first private message while unavailable scanners quarantine it", async t => {
  await t.test("clean scanner", async () => {
    const guildId = `application-clean-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    let firstPayload = null;
    setParadiseApplicationEvidenceScanner(async () => ({ clean: true }));
    try {
      const guild = websiteApplicationGuild({
        guildId,
        userId,
        onThreadSend: async payload => {
          firstPayload = payload;
          return { id: `message-${crypto.randomUUID()}` };
        }
      });
      const type = (await paradiseWebsiteApplicationContext(guild, userId)).types[0];
      const result = await submitParadiseWebsiteApplication(guild, {
        userId,
        type: type.type,
        answers: applicationAnswers(type),
        evidence: [validPngEvidence(type.questions[0].key)]
      });
      assert.deepEqual(result.evidence, { total: 1, accepted: 1, quarantined: 0 });
      assert.equal(firstPayload.files.length, 1);
      assert.equal(firstPayload.files[0].name, "proof.png");
      assert.equal(fs.existsSync(firstPayload.files[0].attachment), true);
    } finally {
      setParadiseApplicationEvidenceScanner(null);
    }
  });

  await t.test("scanner unavailable", async () => {
    const guildId = `application-quarantine-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    let firstPayload = null;
    const guild = websiteApplicationGuild({
      guildId,
      userId,
      onThreadSend: async payload => {
        firstPayload = payload;
        return { id: `message-${crypto.randomUUID()}` };
      }
    });
    const type = (await paradiseWebsiteApplicationContext(guild, userId)).types[0];
    const result = await submitParadiseWebsiteApplication(guild, {
      userId,
      type: type.type,
      answers: applicationAnswers(type),
      evidence: [validPngEvidence(type.questions[0].key)]
    });
    assert.deepEqual(result.evidence, { total: 1, accepted: 0, quarantined: 1 });
    assert.deepEqual(firstPayload.files, []);
    assert.match(firstPayload.embeds[0].toJSON().fields.at(-1).value, /Quarantined or awaiting scanner: \*\*1\*\*/);
  });
});

test("required evidence is rejected before any private Discord delivery", () => {
  assert.throws(() => validateParadiseApplicationEvidenceSubmission({
    guildId: "guild",
    applicationId: "application",
    questions: [{ key: "experience", label: "Experience" }],
    evidence: [],
    requiredQuestionKeys: ["experience"]
  }), { code: "required_evidence_missing", statusCode: 400, question: "experience" });
});

test("community applications never resolve an automatic role grant", () => {
  const community = { activeSetupMode: "community" };
  for (const type of [
    "helper", "staff", "moderator", "support", "training_hoster", "event_staff",
    "giveaway_staff", "content_creator", "video_team", "creative_team", "developer", "fima_support", "macro_staff", "fflag_staff",
    "administrator", "partnership", "creator", "reseller"
  ]) {
    assert.equal(paradiseApplicationAutoGrantRoleKey({ type, workflow: "staff" }, community), null);
  }
  for (const mode of ["community", "clan", "tsbtr"]) {
    for (const type of ["partnership", "creator", "reseller"]) {
      assert.equal(paradiseApplicationAutoGrantRoleKey({ type, workflow: "business" }, { activeSetupMode: mode }), null);
    }
  }
  assert.match(paradiseSource, /applicationSettings\?\.autoGrantRole !== false/u);
  assert.doesNotMatch(paradiseSource, /applicationSettings\?\.autoGrantRole === true/u);
});

test("community role mappings cannot turn any approved application into a role grant", () => {
  const poisonedCommunityConfig = {
    activeSetupMode: "community",
    applicationSettings: { roleMappings: { helper: "Administrator" } },
    roleMappings: { helper_role: "Owner" }
  };
  for (const type of [
    "helper", "staff", "moderator", "support", "training_hoster", "event_staff",
    "giveaway_staff", "content_creator", "video_team", "creative_team", "developer", "fima_support", "macro_staff", "fflag_staff",
    "administrator", "partnership", "creator", "reseller"
  ]) {
    assert.equal(paradiseApplicationAutoGrantRoleName(
      { type, workflow: ["partnership", "creator", "reseller"].includes(type) ? "business" : "staff" },
      poisonedCommunityConfig
    ), null);
  }
});

test("application review transitions enforce valid decisions, reasons and same-record clarification", () => {
  const base = {
    id: "application-id",
    guildId: "guild-id",
    userId: "applicant-id",
    type: "helper",
    workflow: "staff",
    status: "pending",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z"
  };
  const approved = transitionParadiseApplicationReview(base, {
    action: "approve",
    reviewerId: "reviewer-id",
    now: "2026-07-21T01:00:00.000Z"
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewedBy, "reviewer-id");
  assert.equal(approved.reviewReason, null);
  assert.equal(base.status, "pending", "the transition must not mutate the stored input object");

  const moreInfo = transitionParadiseApplicationReview(base, {
    action: "more",
    reviewerId: "reviewer-id",
    reason: "Contact owner@example.com and ping @everyone with the missing example.",
    now: "2026-07-21T02:00:00.000Z"
  });
  assert.equal(moreInfo.status, "more_info");
  assert.match(moreInfo.reviewReason, /\[email\]/);
  assert.doesNotMatch(moreInfo.reviewReason, /owner@example\.com|@everyone/);

  const clarified = transitionParadiseApplicationClarification(moreInfo, {
    userId: "applicant-id",
    response: "Here is the requested incident example.",
    now: "2026-07-21T03:00:00.000Z"
  });
  assert.equal(clarified.id, base.id);
  assert.equal(clarified.status, "pending");
  assert.equal(clarified.moreInfoResponse, "Here is the requested incident example.");
  assert.throws(() => transitionParadiseApplicationReview(base, { action: "forged", reviewerId: "reviewer-id" }), {
    code: "invalid_application_review_action",
    statusCode: 400
  });
  assert.throws(() => transitionParadiseApplicationReview(base, { action: "deny", reviewerId: "reviewer-id", reason: "no" }), {
    code: "application_review_reason_required",
    statusCode: 400
  });
  assert.throws(() => transitionParadiseApplicationClarification(moreInfo, {
    userId: "different-applicant",
    response: "A valid looking response from the wrong account."
  }), { code: "application_not_waiting_for_clarification", statusCode: 409 });
});

test("approving a Community application records the decision without granting a role and rejects replay", async () => {
  const harness = applicationReviewHarness();
  const { result } = await submitHarnessApplication(harness);
  const approveId = applicationReviewButtonId(harness.reviewMessage, "approve");
  assert.ok(approveId);

  assert.equal(await handleParadiseInteraction(harness.interaction(approveId)), true);
  assert.deepEqual(harness.events.roleAdds, []);
  assert.match(harness.events.updates[0].embeds[0].toJSON().title, /APPROVED$/);
  assert.deepEqual(harness.events.updates[0].components, []);
  assert.match(harness.events.dms[0], /approved/);
  assert.equal((await paradiseWebsiteApplicationContext(harness.guild, harness.userId)).activeApplication, null);

  assert.equal(await handleParadiseInteraction(harness.interaction(approveId)), true);
  assert.deepEqual(harness.events.roleAdds, [], "neither approval nor replay may grant a Community role");
  assert.match(harness.events.replies.at(-1).content, /no longer pending/);
  assert.equal(result.status, "pending");
});

test("deny and more-info controls execute their modal-backed behavior", async t => {
  await t.test("deny records the masked reason without granting a role", async () => {
    const harness = applicationReviewHarness();
    await submitHarnessApplication(harness);
    const denyId = applicationReviewButtonId(harness.reviewMessage, "deny");
    await handleParadiseInteraction(harness.interaction(denyId));
    const modal = harness.events.modals.at(-1).toJSON();
    assert.match(modal.custom_id, /^paradise_application_review_reason:deny:/);

    await handleParadiseInteraction(harness.interaction(modal.custom_id, {
      modal: true,
      fields: { review_reason: "Email owner@example.com; the scenario needs more detail." }
    }));
    assert.deepEqual(harness.events.roleAdds, []);
    assert.match(harness.events.updates.at(-1).embeds[0].toJSON().title, /DENIED$/);
    assert.match(harness.events.dms.at(-1), /\[email\]/);
    assert.doesNotMatch(harness.events.dms.at(-1), /owner@example\.com/);
    assert.equal((await paradiseWebsiteApplicationContext(harness.guild, harness.userId)).activeApplication, null);
  });

  await t.test("more-info response returns the same record to pending private review", async () => {
    const harness = applicationReviewHarness();
    const { result, type } = await submitHarnessApplication(harness);
    const moreId = applicationReviewButtonId(harness.reviewMessage, "more");
    const fullApplicationId = moreId.split(":")[1];
    await handleParadiseInteraction(harness.interaction(moreId));
    const staffModal = harness.events.modals.at(-1).toJSON();
    assert.match(staffModal.custom_id, /^paradise_application_review_reason:more:/);

    await handleParadiseInteraction(harness.interaction(staffModal.custom_id, {
      modal: true,
      fields: { review_reason: "Please add one concrete conflict-resolution example." }
    }));
    assert.match(harness.events.updates.at(-1).embeds[0].toJSON().title, /MORE INFO$/);
    assert.deepEqual(harness.events.roleAdds, []);

    await handleParadiseInteraction(harness.interaction(`paradise_application_more_info:${fullApplicationId}`, {
      actor: "applicant",
      modal: true,
      fields: { more_info_response: "I paused both users, gathered context privately, and documented the outcome." }
    }));
    const active = (await paradiseWebsiteApplicationContext(harness.guild, harness.userId)).activeApplication;
    assert.deepEqual(active && { id: active.id, status: active.status }, { id: result.id, status: "pending" });
    assert.match(harness.events.messageEdits.at(-1).embeds[0].toJSON().title, /FOLLOW-UP RECEIVED$/);
    assert.equal(harness.events.messageEdits.at(-1).components[0].toJSON().components.length, 3);
    assert.match(harness.events.replies.at(-1).content, /private review queue/);
    await assert.rejects(submitParadiseWebsiteApplication(harness.guild, {
      userId: harness.userId,
      type: type.type,
      workflow: "staff",
      answers: applicationAnswers(type),
      evidence: []
    }), { code: "active_application_exists", statusCode: 409 });
  });
});

test("application HTTP contract returns 503 and rejects unqueued success payloads", () => {
  assert.throws(
    () => requireParadisePrivateReviewQueued({ id: "deadbeef", status: "pending", reviewQueued: false }),
    { code: "application_private_review_unavailable", statusCode: 503 }
  );
  const response = paradiseApplicationHttpError(Object.assign(new Error("unavailable"), {
    code: "application_private_review_unavailable",
    statusCode: 503
  }));
  assert.deepEqual(response, {
    status: 503,
    body: {
      error: "application_private_review_unavailable",
      cooldownUntil: null,
      question: null
    }
  });
});

test("server audits only after the queued-review contract and browser shows success only after validating it", () => {
  const routeStart = serverSource.indexOf('app.post("/api/fima-bot/applications/submit"');
  const routeEnd = serverSource.indexOf('app.get("/api/fima-bot/session-status"', routeStart);
  const route = serverSource.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.ok(route.indexOf("requireParadisePrivateReviewQueued") < route.indexOf("createAuditLog"));
  assert.match(route, /paradiseApplicationHttpError\(error\)/);

  const validation = clientSource.indexOf("result?.application?.reviewQueued !== true");
  const draftClear = clientSource.indexOf("await clearDraft(token);", validation);
  const successNotice = clientSource.indexOf('"success"', validation);
  assert.ok(validation >= 0 && draftClear > validation && successNotice > draftClear);
  assert.match(clientSource.slice(validation, draftClear), /application_private_review_unavailable/);
});

test("authenticated application drafts sync only answers and clean both copies after queued review", () => {
  for (const method of ["get", "put", "delete"]) {
    assert.match(
      serverSource,
      new RegExp(`app\\.${method}\\(\"/api/fima-bot/applications/draft\", paradiseApplicationDraftLimiter, requireUser`)
    );
  }
  assert.match(serverSource, /pg_advisory_xact_lock\(hashtext\(\$\{key\}\)\)/);
  assert.match(
    serverSource,
    /async function paradiseApplicationDraftAccess\(user, input\)[\s\S]*?normalizeWebsiteApplicationScope\(input\)[\s\S]*?normalizeParadiseApplicationDraftScope\(\{[\s\S]*?\.\.\.applicationScope[\s\S]*?paradiseWebsiteApplicationOAuthAccess\(user, scope\.guildId\)/
  );
  assert.doesNotMatch(
    serverSource,
    /async function paradiseApplicationDraftAccess\(user, input\)[\s\S]*?discordUserId:\s*user\?\.discordUserId/
  );
  assert.match(serverSource, /context\.types\?\.find\(item => item\.type === scope\.type\)/);
  assert.match(serverSource, /requireParadisePrivateReviewQueued[\s\S]*?paradiseApplicationDraftSettingKey\(\{ userId: req\.user\.id, guildId, workflow, type \}\)[\s\S]*?deleteMany/);

  const draftWriteStart = clientSource.indexOf('jsonFetch("/api/fima-bot/applications/draft", {', clientSource.indexOf("async function saveServerDraft"));
  const draftWriteEnd = clientSource.indexOf("});", draftWriteStart);
  const draftWrite = clientSource.slice(draftWriteStart, draftWriteEnd);
  assert.match(draftWrite, /method: "PUT"/);
  assert.match(draftWrite, /"x-fima-csrf": token/);
  assert.match(draftWrite, /answers: localDraft\.answers/);
  assert.match(draftWrite, /expectedRevision: serverDraftRevision/);
  assert.doesNotMatch(draftWrite, /evidence|file/i);
  assert.match(clientSource, /void syncServerDraft\(draft\)/);
  assert.match(clientSource, /FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yerel kopya korunuyor/);
  assert.match(clientSource, /await clearDraft\(token\)/);
  assert.match(applicationHtml, /FIMA hesabında güvenli taslak/);
  assert.match(applicationHtml, /kanıt dosyaları taslağa eklenmez/);
});
