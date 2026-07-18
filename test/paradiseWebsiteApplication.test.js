import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { ChannelType } from "discord.js";
import {
  handleParadiseInteraction,
  paradiseApplicationAutoGrantRoleKey,
  paradiseWebsiteApplicationContext,
  paradiseWebsiteApplicationTypesForMode,
  setParadiseApplicationEvidenceScanner,
  validateParadiseApplicationEvidenceSubmission,
  submitParadiseWebsiteApplication
} from "../src/paradise3a59.js";
import {
  paradiseApplicationHttpError,
  requireParadisePrivateReviewQueued
} from "../src/paradiseApplicationHttp.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../public/assets/js/paradise-apply.js", import.meta.url), "utf8");

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

test("public website applications expose only Helper and reject the retired business workflow", () => {
  for (const mode of ["community", "clan", "tsbtr", "unknown"]) {
    assert.deepEqual(paradiseWebsiteApplicationTypesForMode(mode, "staff").map(item => item.type), ["helper"]);
    assert.deepEqual(paradiseWebsiteApplicationTypesForMode(mode, "business"), []);
  }
  assert.doesNotMatch(clientSource, /URLSearchParams|workflow\s*===\s*["']business["']|partnership|reseller/i);
  assert.doesNotMatch(serverSource, /paradise-apply\?workflow=business|paradise-apply\?[^"']*type=reseller/i);
  assert.match(serverSource, /\["\/paradise\/reseller", "\/bot\/reseller"\][\s\S]*?redirect\(302, "\/paradise-apply"\)/);
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
  const type = context.types[0];
  const answers = applicationAnswers(type);

  const result = await submitParadiseWebsiteApplication(guild, {
    userId,
    type: type.type,
    workflow: "staff",
    answers,
    evidence: []
  });

  assert.equal(result.reviewQueued, true);
  assert.equal(result.type, "helper");
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

test("community auto-grant can resolve only the Helper role", () => {
  const community = { activeSetupMode: "community" };
  assert.equal(paradiseApplicationAutoGrantRoleKey({ type: "helper", workflow: "staff" }, community), "helper_role");
  for (const type of ["staff", "moderator", "support", "administrator", "partnership", "reseller"]) {
    assert.equal(paradiseApplicationAutoGrantRoleKey({ type, workflow: "staff" }, community), null);
  }
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
  const routeStart = serverSource.indexOf('app.post("/api/paradise/applications/submit"');
  const routeEnd = serverSource.indexOf('app.get("/api/paradise/session-status"', routeStart);
  const route = serverSource.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.ok(route.indexOf("requireParadisePrivateReviewQueued") < route.indexOf("createAuditLog"));
  assert.match(route, /paradiseApplicationHttpError\(error\)/);

  const validation = clientSource.indexOf("result?.application?.reviewQueued !== true");
  const draftClear = clientSource.indexOf("clearDraft();", validation);
  const successNotice = clientSource.indexOf('"success"', validation);
  assert.ok(validation >= 0 && draftClear > validation && successNotice > draftClear);
  assert.match(clientSource.slice(validation, draftClear), /application_private_review_unavailable/);
});
