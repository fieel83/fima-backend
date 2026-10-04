import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  executeParadiseTestGuildAction,
  parseParadiseTestGuildArgs,
  persistParadiseTestGuildRehearsalEvidence,
  runParadiseTestGuildCli,
  summarizeParadiseTestGuildResult
} from "../src/paradiseTestGuildRunner.js";
import { verifyParadiseRehearsalEvidence } from "../src/paradiseRehearsalEvidence.js";
import {
  computeFtCommunityReleaseDigest,
  FT_COMMUNITY_RELEASE_ENV_NAMES
} from "../src/ftCommunityReleaseAttestation.js";

const GUILD_ID = "1520519015661961257";
const OWNER_ID = "1520519015661961258";
const BOT_ID = "1520519015661961259";
const TEST_EVIDENCE_SECRET = "test-only-rehearsal-evidence-secret-32-bytes";
const RELEASE_REVISION = "d".repeat(40);
const BACKUP_ARTIFACT_DIGEST = "a".repeat(64);
const BACKUP_STATE_DIGEST = "b".repeat(64);

async function withReleaseEnvironment(values, operation) {
  const previous = new Map(FT_COMMUNITY_RELEASE_ENV_NAMES.map(name => [
    name,
    Object.hasOwn(process.env, name) ? process.env[name] : undefined
  ]));
  try {
    for (const name of FT_COMMUNITY_RELEASE_ENV_NAMES) {
      if (values[name] == null) delete process.env[name];
      else process.env[name] = values[name];
    }
    return await operation();
  } finally {
    for (const [name, value] of previous) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withVerifiedReleaseAttestation(operation) {
  const criticalDigest = computeFtCommunityReleaseDigest();
  return withReleaseEnvironment({
    RENDER_GIT_COMMIT: RELEASE_REVISION,
    FT_COMMUNITY_APPROVED_RENDER_COMMIT: RELEASE_REVISION,
    FT_COMMUNITY_APPROVED_RELEASE_SHA256: criticalDigest
  }, () => operation({ criticalDigest }));
}

function verifiedRehearsalResult(overrides = {}) {
  return {
    action: "rehearsal",
    status: "LIVE DISCORD VERIFIED",
    completedAt: "2026-07-26T12:00:00.000Z",
    mode: "community",
    smokeRunsCompleted: 2,
    fullSmokeRunsVerified: true,
    initialBackupVerified: true,
    persistedBackupVerified: true,
    backupAlgorithm: "sha256",
    backupArtifactDigest: BACKUP_ARTIFACT_DIGEST,
    backupStateDigest: BACKUP_STATE_DIGEST,
    persistedBackupArtifactDigest: BACKUP_ARTIFACT_DIGEST,
    persistedBackupStateDigest: BACKUP_STATE_DIGEST,
    restoredOriginalState: true,
    originalStateCanRestore: true,
    originalStateMutationsPlanned: 0,
    ...overrides
  };
}

function createCliGuild() {
  const owner = { id: OWNER_ID };
  const bot = { id: BOT_ID };
  const cache = new Map([[OWNER_ID, owner], [BOT_ID, bot]]);
  return {
    id: GUILD_ID,
    ownerId: OWNER_ID,
    client: { user: { id: BOT_ID } },
    channels: { fetch: async () => {} },
    roles: { fetch: async () => {} },
    members: {
      cache,
      me: bot,
      async fetch(memberId) {
        if (memberId == null) return cache;
        return cache.get(String(memberId)) || null;
      }
    }
  };
}

test("test-guild runner defaults to a read-only preflight with an immutable target", () => {
  assert.deepEqual(parseParadiseTestGuildArgs([]), {
    action: "preflight",
    guildId: GUILD_ID,
    mode: "community",
    confirmation: null,
    mutating: false
  });
  assert.throws(() => parseParadiseTestGuildArgs(["preflight", "--confirm", "anything"]), {
    code: "confirmation_not_allowed_for_read_only_action"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["preflight", "--guild", "1"]), {
    code: "invalid_test_guild_argument"
  });
});

test("every test-guild mutation requires its own exact typed confirmation", () => {
  assert.equal(parseParadiseTestGuildArgs(["apply", "--confirm", "APPLY TEST COMMUNITY"]).action, "apply");
  assert.equal(parseParadiseTestGuildArgs(["smoke", "--confirm", "SMOKE TEST COMMUNITY"]).action, "smoke");
  assert.equal(parseParadiseTestGuildArgs(["recover-rollback", "--confirm", "RECOVER TEST COMMUNITY ROLLBACK"]).action, "recover-rollback");
  assert.equal(parseParadiseTestGuildArgs(["rebuild", "--confirm", "REBUILD TEST COMMUNITY"]).action, "rebuild");
  assert.throws(() => parseParadiseTestGuildArgs(["apply", "--confirm", "apply test community"]), {
    code: "typed_confirmation_mismatch"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["smoke", "--confirm", "smoke test community"]), {
    code: "typed_confirmation_mismatch"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["recover-rollback", "--confirm", "recover test community rollback"]), {
    code: "typed_confirmation_mismatch"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["rebuild", "--confirm", "rebuild test community"]), {
    code: "typed_confirmation_mismatch"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["rebuild", "--confirm", "REBUILD FIEELS COMMUNITY"]), {
    code: "typed_confirmation_mismatch"
  });
  assert.throws(() => parseParadiseTestGuildArgs(["unknown"]), { code: "invalid_test_guild_action" });
});

test("dispatcher cannot execute against any other guild", async () => {
  await assert.rejects(
    executeParadiseTestGuildAction(
      { action: "preflight", guildId: GUILD_ID },
      { guild: { id: "production-guild" }, operations: {} }
    ),
    { code: "test_guild_only" }
  );
});

test("dispatcher maps actions only to isolated direct operations", async () => {
  const calls = [];
  const guild = { id: GUILD_ID };
  const operations = {
    inspectParadiseTestTemplateRebuildPreflight: async value => (calls.push(["preflight", value.id]), { ready: true }),
    paradiseTestLabStatus: async value => (calls.push(["status", value.id]), { completed: true }),
    applyParadiseTemplateMissingOnly: async (value, mode, options) => (calls.push(["apply", value.id, mode, options]), { status: "ok" }),
    runParadiseTestSmokeSuite: async (value, options) => (calls.push(["smoke", value.id, options]), { status: "ok" }),
    recoverParadiseTestRollback: async (value, confirmation) => (calls.push(["recover-rollback", value.id, confirmation]), { status: "ok" }),
    rebuildParadiseTestTemplate: async (value, mode, confirmation) => (calls.push(["rebuild", value.id, mode, confirmation]), { status: "ok" })
  };

  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs([]), { guild, operations });
  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs(["status"]), { guild, operations });
  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs(["apply", "--confirm", "APPLY TEST COMMUNITY"]), { guild, operations });
  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs(["smoke", "--confirm", "SMOKE TEST COMMUNITY"]), { guild, operations });
  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs(["recover-rollback", "--confirm", "RECOVER TEST COMMUNITY ROLLBACK"]), { guild, operations });
  await executeParadiseTestGuildAction(parseParadiseTestGuildArgs(["rebuild", "--confirm", "REBUILD TEST COMMUNITY"]), { guild, operations });

  assert.deepEqual(calls, [
    ["preflight", GUILD_ID],
    ["status", GUILD_ID],
    ["apply", GUILD_ID, "community", { repairPermissions: true }],
    ["smoke", GUILD_ID, { fast: false }],
    ["recover-rollback", GUILD_ID, "RECOVER TEST COMMUNITY ROLLBACK"],
    ["rebuild", GUILD_ID, "community", "REBUILD TEST COMMUNITY"]
  ]);
});

test("rollback recovery summary contains only the safe reconciliation verdict", () => {
  const summary = summarizeParadiseTestGuildResult("recover-rollback", {
    action: "recover-rollback",
    status: "ok",
    completedAt: "2026-08-09T12:00:00.000Z",
    mode: "community",
    rollbackRecovered: true,
    reconciliationCanRestore: true,
    reconciliationMutationsPlanned: 0,
    markerId: "private-marker",
    reconciliation: { channelIds: [GUILD_ID] }
  });
  assert.deepEqual(summary, {
    action: "recover-rollback",
    status: "ok",
    completedAt: "2026-08-09T12:00:00.000Z",
    mode: "community",
    createdChannels: 0,
    createdRoles: 0,
    mappedChannelCount: 0,
    guidePosts: 0,
    leaderboardBoardCount: 0,
    staffTeamReady: false,
    structureReady: false,
    rollbackRecovered: true,
    reconciliationCanRestore: true,
    reconciliationMutationsPlanned: 0
  });
  assert.equal(JSON.stringify(summary).includes("private-marker"), false);
  assert.equal(JSON.stringify(summary).includes(GUILD_ID), false);
});

test("CLI fails closed before creating a Discord client when the token is absent", async () => {
  let created = false;
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "",
      createClient: () => { created = true; return {}; }
    }),
    { code: "discord_bot_token_missing" }
  );
  assert.equal(created, false);
});

test("CLI always destroys its isolated client after a Discord failure", async () => {
  let destroyed = false;
  const client = {
    isReady: () => true,
    login: async () => {},
    guilds: { fetch: async () => { throw Object.assign(new Error("missing"), { code: "missing_access" }); } },
    destroy: () => { destroyed = true; }
  };
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "redacted-test-token",
      createClient: () => client
    }),
    { code: "missing_access" }
  );
  assert.equal(destroyed, true);
});

test("CLI waits for asynchronous Discord client destruction before settling", async () => {
  let destructionCompleted = false;
  const client = {
    isReady: () => true,
    login: async () => {},
    guilds: { fetch: async () => { throw Object.assign(new Error("missing"), { code: "missing_access" }); } },
    destroy: async () => {
      await new Promise(resolve => setImmediate(resolve));
      destructionCompleted = true;
    }
  };
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "redacted-test-token",
      createClient: () => client
    }),
    { code: "missing_access" }
  );
  assert.equal(destructionCompleted, true);
});

test("CLI waits for ClientReady after login and times out before guild access", async () => {
  const readyClient = new EventEmitter();
  let ready = false;
  let guildFetched = false;
  Object.assign(readyClient, {
    isReady: () => ready,
    login: async () => {
      setImmediate(() => {
        ready = true;
        readyClient.emit("clientReady", readyClient);
      });
    },
    guilds: {
      fetch: async () => {
        guildFetched = true;
        throw Object.assign(new Error("stop_after_ready"), { code: "stop_after_ready" });
      }
    },
    destroy: () => {}
  });
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "redacted-test-token",
      createClient: () => readyClient,
      clientReadyTimeoutMs: 50
    }),
    { code: "stop_after_ready" }
  );
  assert.equal(guildFetched, true);

  const stalledClient = new EventEmitter();
  guildFetched = false;
  Object.assign(stalledClient, {
    isReady: () => false,
    login: async () => {},
    guilds: { fetch: async () => { guildFetched = true; } },
    destroy: () => {}
  });
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "redacted-test-token",
      createClient: () => stalledClient,
      clientReadyTimeoutMs: 5
    }),
    { code: "discord_client_ready_timeout" }
  );
  assert.equal(guildFetched, false);
});

test("CLI verifies owner and bot members by ID before dispatching any action", async () => {
  const guild = createCliGuild();
  const fetchedIds = [];
  let dispatched = false;
  guild.members.cache.clear();
  guild.members.fetch = async memberId => {
    if (memberId == null) return new Map();
    fetchedIds.push(String(memberId));
    const member = { id: String(memberId) };
    guild.members.cache.set(String(memberId), member);
    return member;
  };
  const client = {
    user: { id: BOT_ID },
    isReady: () => true,
    login: async () => {},
    guilds: { fetch: async () => guild },
    destroy: () => {}
  };
  await runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
    token: "redacted-test-token",
    createClient: () => client,
    operations: {
      inspectParadiseTestTemplateRebuildPreflight: async () => {
        dispatched = true;
        return { ready: true };
      }
    }
  });
  assert.deepEqual(fetchedIds, [OWNER_ID, BOT_ID]);
  assert.equal(dispatched, true);

  guild.members.cache.delete(OWNER_ID);
  guild.members.fetch = async memberId => memberId == null ? new Map() : null;
  dispatched = false;
  await assert.rejects(
    runParadiseTestGuildCli(parseParadiseTestGuildArgs([]), {
      token: "redacted-test-token",
      createClient: () => client,
      operations: {
        inspectParadiseTestTemplateRebuildPreflight: async () => {
          dispatched = true;
          return { ready: true };
        }
      }
    }),
    { code: "guild_owner_member_not_available" }
  );
  assert.equal(dispatched, false);
});

test("CLI persists signed rehearsal evidence only after a successful full rehearsal", async () => {
  let destroyed = false;
  let persisted = null;
  const guild = createCliGuild();
  const client = {
    user: { id: BOT_ID },
    isReady: () => true,
    login: async () => {},
    guilds: { fetch: async () => guild },
    destroy: () => { destroyed = true; }
  };
  const { result, criticalDigest } = await withVerifiedReleaseAttestation(async release => ({
    result: await runParadiseTestGuildCli(
      parseParadiseTestGuildArgs(["rehearsal", "--confirm", "REHEARSE TEST COMMUNITY"]),
      {
        token: "redacted-test-token",
        createClient: () => client,
        operations: {
          rehearseParadiseTestTemplate: async () => verifiedRehearsalResult()
        },
        nowMs: Date.parse("2026-07-26T12:00:01.000Z"),
        rehearsalEvidenceSecret: TEST_EVIDENCE_SECRET,
        rehearsalEvidencePath: "ignored-test-path.json",
        persistRehearsalEvidence: async (evidencePath, evidence) => { persisted = { evidencePath, evidence }; }
      }
    ),
    criticalDigest: release.criticalDigest
  }));

  assert.equal(result.status, "LIVE DISCORD VERIFIED");
  assert.equal(persisted.evidencePath, "ignored-test-path.json");
  assert.equal(verifyParadiseRehearsalEvidence(persisted.evidence, { secret: TEST_EVIDENCE_SECRET }).ok, true);
  assert.equal(persisted.evidence.schemaVersion, 4);
  assert.deepEqual(persisted.evidence.release, {
    revision: RELEASE_REVISION,
    criticalDigest
  });
  assert.equal(persisted.evidence.artifact.revision, RELEASE_REVISION);
  assert.equal(persisted.evidence.executionMode, "live_discord_test_guild");
  assert.equal(persisted.evidence.guild.mainProductionGuildTouched, false);
  assert.equal(destroyed, true);
});

test("deployed runtime helper records signed full-rehearsal evidence without returning the artifact", async () => {
  let persisted = null;
  const result = await withVerifiedReleaseAttestation(() => persistParadiseTestGuildRehearsalEvidence({
    guildId: GUILD_ID,
    result: verifiedRehearsalResult(),
    verifiedAt: Date.parse("2026-07-26T12:00:01.000Z")
  }, {
    rehearsalEvidenceSecret: TEST_EVIDENCE_SECRET,
    rehearsalEvidencePath: "runtime-test-path.json",
    persistRehearsalEvidence: async (evidencePath, evidence, options) => {
      persisted = { evidencePath, evidence, options };
    }
  }));

  assert.deepEqual(result, {
    recorded: true,
    verifiedAt: "2026-07-26T12:00:01.000Z",
    status: "LIVE DISCORD VERIFIED"
  });
  assert.equal(persisted.evidencePath, "runtime-test-path.json");
  assert.equal(verifyParadiseRehearsalEvidence(persisted.evidence, { secret: TEST_EVIDENCE_SECRET }).ok, true);
  assert.equal(Object.hasOwn(result, "signature"), false);
  assert.equal(Object.hasOwn(result, "artifact"), false);
});

test("rehearsal evidence persistence fails closed without the exact release attestation", async t => {
  const digest = computeFtCommunityReleaseDigest();
  const cases = [
    [
      "missing release digest",
      {
        RENDER_GIT_COMMIT: RELEASE_REVISION,
        FT_COMMUNITY_APPROVED_RENDER_COMMIT: RELEASE_REVISION,
        FT_COMMUNITY_APPROVED_RELEASE_SHA256: null
      },
      "ft_community_release_attestation_missing"
    ],
    [
      "mismatched approved revision",
      {
        RENDER_GIT_COMMIT: RELEASE_REVISION,
        FT_COMMUNITY_APPROVED_RENDER_COMMIT: "e".repeat(40),
        FT_COMMUNITY_APPROVED_RELEASE_SHA256: digest
      },
      "ft_community_release_attestation_mismatch"
    ]
  ];

  for (const [name, releaseEnvironment, code] of cases) {
    await t.test(name, async () => {
      let persisted = false;
      await withReleaseEnvironment(releaseEnvironment, async () => {
        await assert.rejects(
          persistParadiseTestGuildRehearsalEvidence({
            guildId: GUILD_ID,
            result: verifiedRehearsalResult(),
            verifiedAt: Date.parse("2026-07-26T12:00:01.000Z")
          }, {
            rehearsalEvidenceSecret: TEST_EVIDENCE_SECRET,
            persistRehearsalEvidence: async () => { persisted = true; }
          }),
          { code }
        );
      });
      assert.equal(persisted, false);
    });
  }
});

test("CLI refuses to persist rehearsal evidence for an incomplete rehearsal result", async () => {
  let persisted = false;
  let destroyed = false;
  const guild = createCliGuild();
  const client = {
    user: { id: BOT_ID },
    isReady: () => true,
    login: async () => {},
    guilds: { fetch: async () => guild },
    destroy: () => { destroyed = true; }
  };
  await assert.rejects(
    runParadiseTestGuildCli(
        parseParadiseTestGuildArgs(["rehearsal", "--confirm", "REHEARSE TEST COMMUNITY"]),
      {
        token: "redacted-test-token",
        createClient: () => client,
        operations: { rehearseParadiseTestTemplate: async () => verifiedRehearsalResult({ smokeRunsCompleted: 1 }) },
        rehearsalEvidenceSecret: TEST_EVIDENCE_SECRET,
        persistRehearsalEvidence: async () => { persisted = true; }
      }
    ),
    { code: "test_guild_rehearsal_not_live_verified" }
  );
  assert.equal(persisted, false);
  assert.equal(destroyed, true);
});

test("preflight summary exposes evidence without backup contents", () => {
  const summary = summarizeParadiseTestGuildResult("preflight", {
    ready: false,
    code: "required_guild_permission_missing",
    mutationCount: 0,
    checks: [{ id: "guild_permissions", ok: false, code: "required_guild_permission_missing", details: { missing: ["ManageRoles"] } }],
    blockers: [{ check: "guild_permissions", code: "required_guild_permission_missing", details: { blockedRoles: [{ id: "secret" }] } }],
    snapshot: { canonicalMessages: [{ content: "private" }] }
  });
  assert.equal(summary.ready, false);
  assert.equal(summary.mutationCount, 0);
  assert.equal(JSON.stringify(summary).includes("private"), false);
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("status summary exposes structure and role-icon readiness only as safe counts", () => {
  const summary = summarizeParadiseTestGuildResult("status", {
    completed: true,
    communityReady: false,
    structureVerificationAvailable: true,
    structureReady: false,
    structureMismatchCount: 3,
    roleIconReady: false,
    roleIconMismatchCount: 2,
    roleIconBlockerCount: 1,
    smokeEvidenceMissing: [{ channelId: "private-evidence-id" }],
    structureVerification: {
      extraChannels: [{ id: "private-channel-id", name: "private-channel-name" }],
      roleIconBlockers: [{ roleId: "private-role-id", roleName: "Owner" }]
    }
  });

  assert.deepEqual(summary, {
    action: "status",
    completed: true,
    communityReady: false,
    revision: null,
    completedAt: null,
    lastError: null,
    structureVerificationAvailable: true,
    structureReady: false,
    structureMismatchCount: 3,
    roleIconReady: false,
    roleIconMismatchCount: 2,
    roleIconBlockerCount: 1,
    smokeEvidenceReady: false,
    smokeEvidenceMissingCount: 0,
    liveEvidenceAvailable: false,
    liveEvidenceVerifiedCount: 0,
    liveEvidenceRequiredCount: 0,
    leaderboardBoardCount: 0,
    leaderboardReady: false,
    welcomeLeaveReady: false,
    staffTeamReady: false,
    helpGuideReady: false,
    applicationPanelReady: false,
    supportPanelReady: false,
    supportTicketReady: false,
    supportTicketTranscriptReady: false,
    supportTicketReopenReady: false,
    moderationPanelReady: false,
    securityPanelReady: false,
    textActivityReady: false,
    voiceActivityReady: false,
    activityRewardsPanelReady: false,
    rewardPolicyReady: false,
    activityWorkerReady: false,
    activityDatabaseReady: false,
    blacklistedRoleReady: false,
    blacklistPermissionReady: false
  });
  assert.equal(JSON.stringify(summary).includes("private-channel"), false);
  assert.equal(JSON.stringify(summary).includes("private-role"), false);
  assert.equal(JSON.stringify(summary).includes("private-evidence"), false);
});

test("runner summaries reject persisted text, Discord identifiers, and invalid timestamps", () => {
  const discordId = "1520519015661961257";
  const status = summarizeParadiseTestGuildResult("status", {
    revision: `3a80-${discordId}`,
    completedAt: "not-a-timestamp",
    lastError: discordId,
    mode: `community-${discordId}`,
    status: `LIVE DISCORD VERIFIED ${discordId}`
  });
  assert.equal(status.revision, null);
  assert.equal(status.completedAt, null);
  assert.equal(status.lastError, null);
  assert.equal(Object.hasOwn(status, "mode"), false);
  assert.equal(Object.hasOwn(status, "status"), false);

  const preflight = summarizeParadiseTestGuildResult("preflight", {
    code: discordId,
    checks: [{ id: discordId, code: `private_${discordId}`, ok: false }],
    blockers: [{ check: discordId, code: `private_${discordId}` }]
  });
  assert.equal(preflight.code, "unknown");
  assert.deepEqual(preflight.checks, [{ id: null, ok: false, code: null }]);
  assert.deepEqual(preflight.blockers, [{ check: null, code: null }]);

  const mutation = summarizeParadiseTestGuildResult("untrusted-action", {
    status: `ok-${discordId}`,
    completedAt: "2026-99-99",
    mode: `clan-${discordId}`
  });
  assert.equal(mutation.action, null);
  assert.equal(mutation.status, null);
  assert.equal(mutation.completedAt, null);
  assert.equal(mutation.mode, "community");
  assert.equal(JSON.stringify({ status, preflight, mutation }).includes(discordId), false);
});
