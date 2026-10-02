import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Execute the actual bot helper without connecting a bot or touching customer data.
const source = readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");
const start = source.indexOf("async function createDiscordResetToken(");
const end = source.indexOf("export async function discordBotHealth(", start);
assert.ok(start >= 0 && end > start);
const executable = `${source.slice(start, end)}\ncreateDiscordResetToken;`;
const subject = "1511058472748454019";
const otherSubject = "1511058472748454020";
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

const handlerStart = source.indexOf('  if (interaction.commandName === "fima_recovery") {');
const handlerEnd = source.indexOf('  if (["fima_embed", "fima_announce", "fima_update"].includes', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
const handlerExecutable = `(async function (interaction) {${source.slice(handlerStart, handlerEnd)}});`;

function handlerFixture({ linked = true, issueError = null, deliveryError = null } = {}) {
  const calls = [];
  const recovery = { token: crypto.randomBytes(32).toString("base64url"), resetUrl: "https://fimamacro.com/reset-password?token=private" };
  const interaction = {
    commandName: "fima_recovery", user: { id: subject },
    async deferReply(value) { calls.push({ op: "defer", value }); },
    async editReply(value) { calls.push({ op: "reply", value }); }
  };
  const handler = runInNewContext(handlerExecutable, {
    crypto, Date,
    prisma: {
      user: { async findFirst({ where }) { calls.push({ op: "lookup", where }); return linked ? { id: "account-a" } : null; } },
      passwordResetToken: { async updateMany(value) { calls.push({ op: "invalidate", value }); } }
    },
    async createDiscordResetToken(...args) { calls.push({ op: "issue", args }); if (issueError) throw issueError; return recovery; },
    async sendPasswordResetDm(...args) { calls.push({ op: "deliver", args }); if (deliveryError) throw deliveryError; },
    async auditDiscordBotAction(...args) { calls.push({ op: "audit", args }); }
  });
  return { run: () => handler(interaction), calls, recovery };
}

test("bot recovery uses trusted Discord actor and keeps challenge material out of audit and channel reply", async () => {
  const f = handlerFixture();
  await f.run();
  assert.equal(f.calls[0].op, "defer");
  assert.equal(f.calls[0].value.ephemeral, true);
  assert.deepEqual(Array.from(f.calls.find(c => c.op === "issue").args), ["account-a", subject]);
  assert.deepEqual(Array.from(f.calls.find(c => c.op === "deliver").args), [subject, f.recovery.token, f.recovery.resetUrl]);
  const visible = JSON.stringify(f.calls.filter(c => ["reply", "audit"].includes(c.op)));
  assert.ok(!visible.includes(f.recovery.token));
  assert.ok(!visible.includes(f.recovery.resetUrl));
});

test("failed Discord DM invalidates only exact issued account challenge", async () => {
  const f = handlerFixture({ deliveryError: Object.assign(new Error("private provider detail"), { code: "discord_dm_disabled" }) });
  await f.run();
  const invalidation = f.calls.find(c => c.op === "invalidate").value;
  assert.equal(invalidation.where.userId, "account-a");
  assert.equal(invalidation.where.tokenHash, hash(f.recovery.token));
  assert.equal(invalidation.where.usedAt, null);
  assert.ok(invalidation.data.usedAt instanceof Date);
  assert.ok(f.calls.findIndex(c => c.op === "invalidate") < f.calls.findIndex(c => c.op === "audit"));
  assert.ok(!JSON.stringify(f.calls.filter(c => ["reply", "audit"].includes(c.op))).includes("private provider detail"));
});

test("rate-limited and unlinked Discord actors cannot issue or deliver another recovery challenge", async () => {
  const limited = handlerFixture({ issueError: Object.assign(new Error("rate limited"), { code: "discord_recovery_rate_limited" }) });
  await limited.run();
  assert.ok(!limited.calls.some(c => ["deliver", "invalidate"].includes(c.op)));
  assert.match(limited.calls.find(c => c.op === "reply").value.content, /wait/i);
  const unlinked = handlerFixture({ linked: false });
  await unlinked.run();
  assert.ok(!unlinked.calls.some(c => ["issue", "deliver", "invalidate"].includes(c.op)));
});

function fixture({ user = { id: "account-a", discordUserId: subject }, link = null, accountLink = link, settings = null, tokens = [], failCreate = false, frontend = "https://fimamacro.com", initialNow = 2_000_000_000_000 } = {}) {
  let state = structuredClone({ user, link, accountLink, settings, tokens });
  let now = initialNow;
  const calls = [];
  const FixedDate = class extends Date { constructor(value = now) { super(value); } static now() { return now; } };
  const prisma = {
    async $transaction(callback, options) {
      calls.push({ op: "transaction", options });
      const draft = structuredClone(state);
      const tx = {
        async $queryRaw(strings, value) { calls.push({ op: "lock", sql: strings.join("?"), value }); return [{ id: value }]; },
        user: { async findUnique({ where }) { return draft.user?.id === where.id ? draft.user : null; } },
        oAuthLink: {
          async findUnique() { return draft.link; },
          async findFirst() { return draft.accountLink; }
        },
        setting: {
          async findUnique() { return draft.settings; },
          async upsert({ where, create }) { calls.push({ op: "budget", key: where.key }); draft.settings = structuredClone(create); }
        },
        passwordResetToken: {
          async updateMany({ where, data }) {
            calls.push({ op: "invalidate", where });
            for (const token of draft.tokens) {
              if (token.userId === where.userId && !token.usedAt && token.expiresAt > where.expiresAt.gt) token.usedAt = data.usedAt;
            }
          },
          async create({ data }) {
            if (failCreate) throw new Error("fixture_create_failed");
            calls.push({ op: "create" }); draft.tokens.push(structuredClone(data));
          }
        }
      };
      const result = await callback(tx);
      state = draft;
      return result;
    }
  };
  const load = () => runInNewContext(executable, { prisma, crypto, env: () => frontend, URL, Date: FixedDate }, { filename: "actual-discord-bot-recovery.js" });
  return { issue: (...args) => load()(...args), reload: () => load(), advance: (ms) => { now += ms; }, state: () => structuredClone(state), calls, now: () => now };
}

test("authenticated numeric identity issues only account-bound hashed 256-bit token with HTTPS link", async () => {
  const f = fixture();
  const result = await f.issue("account-a", subject);
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(result.token, "base64url").length, 32);
  assert.equal(new URL(result.resetUrl).searchParams.get("token"), result.token);
  assert.equal(new URL(result.resetUrl).protocol, "https:");
  const row = f.state().tokens[0];
  assert.equal(row.userId, "account-a");
  assert.equal(row.tokenHash, hash(result.token));
  assert.equal(row.expiresAt.getTime(), f.now() + 900_000);
  assert.ok(!JSON.stringify(f.state()).includes(result.token));
  assert.equal(f.calls[1].op, "lock");
  assert.match(f.calls[1].sql, /WHERE id = \? FOR UPDATE/);
  assert.equal(f.calls[0].options.isolationLevel, "Serializable");
});

test("missing or spoofed numeric identity fails before any transaction", async () => {
  const f = fixture();
  for (const id of [undefined, "display-name", "1", "1511058472748454019x"]) {
    await assert.rejects(f.issue("account-a", id), /discord_recovery_identity_invalid/);
  }
  assert.equal(f.calls.length, 0);
});

test("unlink/relink between initial lookup and locked issuance rejects the old Discord actor", async () => {
  for (const discordUserId of [null, otherSubject]) {
    const f = fixture({ user: { id: "account-a", discordUserId } });
    await assert.rejects(f.issue("account-a", subject), /discord_recovery_identity_changed/);
    assert.equal(f.state().tokens.length, 0);
    assert.equal(f.state().settings, null);
  }
});

test("provider identity cannot recover a different immutable account", async () => {
  const f = fixture({ link: { userId: "account-b", providerSubject: subject } });
  await assert.rejects(f.issue("account-a", subject), /discord_recovery_identity_changed/);
  assert.equal(f.state().tokens.length, 0);
});

test("conflicting account provider identity fails closed even if the legacy ID matches", async () => {
  const f = fixture({ accountLink: { userId: "account-a", providerSubject: otherSubject } });
  await assert.rejects(f.issue("account-a", subject), /discord_recovery_identity_changed/);
});

test("durable per-account cooldown survives a new runtime instance", async () => {
  const f = fixture();
  await f.issue("account-a", subject);
  await assert.rejects(f.reload()("account-a", subject), /discord_recovery_rate_limited/);
  assert.equal(f.state().tokens.length, 1);
  assert.equal(f.state().settings.value.attempts.length, 1);
});

test("three issuance attempts per hour are bounded and recover after the window", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) { await f.issue("account-a", subject); f.advance(60_001); }
  await assert.rejects(f.issue("account-a", subject), /discord_recovery_rate_limited/);
  f.advance(3_600_001);
  await f.issue("account-a", subject);
  assert.equal(f.state().settings.value.attempts.length, 1);
});

test("replacement invalidates only this account's unconsumed active challenge", async () => {
  const expiresAt = new Date(2_000_000_500_000);
  const f = fixture({ tokens: [{ userId: "account-a", tokenHash: "old", expiresAt, usedAt: null }, { userId: "account-b", tokenHash: "foreign", expiresAt, usedAt: null }] });
  await f.issue("account-a", subject);
  assert.ok(f.state().tokens[0].usedAt);
  assert.equal(f.state().tokens[1].usedAt, null);
});

test("failed issuance rolls back budget and old-token invalidation together", async () => {
  const f = fixture({ failCreate: true, tokens: [{ userId: "account-a", tokenHash: "old", expiresAt: new Date(2_000_000_500_000), usedAt: null }] });
  const before = f.state();
  await assert.rejects(f.issue("account-a", subject), /fixture_create_failed/);
  assert.deepEqual(f.state(), before);
});

test("missing, malformed or future durable budget is not treated as an empty safe budget", async () => {
  for (const value of [{}, { attempts: "invalid" }, { attempts: [2_000_000_000_001] }, { attempts: [-1] }, { attempts: [1, 2, 3, 4] }]) {
    const f = fixture({ settings: { key: "discordRecovery:account-a", value } });
    await assert.rejects(f.issue("account-a", subject), /discord_recovery_budget_invalid/);
    assert.equal(f.state().tokens.length, 0);
  }
});

test("insecure or credential-bearing reset URL config fails before token issuance", async () => {
  for (const frontend of ["http://fimamacro.com", "https://user:pass@fimamacro.com"]) {
    const f = fixture({ frontend });
    await assert.rejects(f.issue("account-a", subject), /discord_recovery_url_invalid/);
    assert.equal(f.calls.length, 0);
  }
});
