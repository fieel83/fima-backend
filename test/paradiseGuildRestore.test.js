import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChannelType, WebhookType } from "discord.js";
import {
  buildParadiseRestoreDryRun,
  createParadiseBackupEnvelope,
  paradiseBackupStateDigest
} from "../src/paradiseBackupIntegrity.js";
import {
  captureParadiseGuildBackupSnapshot,
  paradiseProductionRestoreConfirmation,
  paradiseRestoreConfirmation,
  restoreParadiseGuildBackup
} from "../src/paradiseGuildRestore.js";
import {
  armParadiseRollbackMarker,
  assertNoUnresolvedParadiseRollback,
  resolveParadiseRollbackMarker,
  updateParadiseRollbackMarker
} from "../src/paradiseRollbackMarker.js";

const GUILD_ID = "1520519015661961257";
const PRODUCTION_GUILD_ID = "1419335632324657306";
const OWNER_ID = "100000000000000001";
const BOT_ID = "100000000000000002";

function canonicalizeProofValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeProofValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalizeProofValue(value[key])]));
}

function productionExecutionProof(backup, {
  secret = "test-only-production-proof-secret-1234567890",
  planId = "00000000-0000-4000-8000-000000000001",
  guildId = PRODUCTION_GUILD_ID,
  mode = "community",
  issuedAt = "2026-08-12T00:00:00.000Z",
  expiresAt = "2026-08-12T00:01:00.000Z"
} = {}) {
  const body = {
    kind: "fima_production_rebuild_execution_proof",
    schemaVersion: 1,
    planId,
    guildId,
    mode,
    backupDigest: paradiseBackupStateDigest(backup),
    issuedAt,
    expiresAt
  };
  return {
    ...body,
    signature: crypto.createHmac("sha256", secret)
      .update(JSON.stringify(canonicalizeProofValue(body)))
      .digest("hex")
  };
}

function idFactory(start = 200000000000000000n) {
  let next = start;
  return () => String(next++);
}

function mapValues(items = []) {
  return new Map(items.map(item => [String(item.id), item]));
}

function createFakeGuild({ guildId = GUILD_ID, unsafeUrls = false } = {}) {
  const nextId = idFactory();
  const guild = {
    id: guildId,
    name: "FT Community Backup",
    description: "Verified restore fixture",
    ownerId: OWNER_ID,
    preferredLocale: "en-US",
    verificationLevel: 2,
    explicitContentFilter: 2,
    defaultMessageNotifications: 1,
    afkChannelId: null,
    afkTimeout: 300,
    systemChannelId: null,
    rulesChannelId: null,
    publicUpdatesChannelId: null,
    premiumProgressBarEnabled: true,
    client: { user: { id: BOT_ID } },
    iconURL: () => unsafeUrls ? "https://evil.invalid/icon.png" : null,
    bannerURL: () => null,
    splashURL: () => null,
    async edit(payload) {
      const channelId = value => value && typeof value === "object" ? value.id : value;
      Object.assign(this, payload, {
        afkChannelId: channelId(payload.afkChannel) ?? this.afkChannelId,
        systemChannelId: channelId(payload.systemChannel) ?? this.systemChannelId,
        rulesChannelId: channelId(payload.rulesChannel) ?? this.rulesChannelId,
        publicUpdatesChannelId: channelId(payload.publicUpdatesChannel) ?? this.publicUpdatesChannelId
      });
      return this;
    }
  };

  const makeRole = input => {
    const role = {
      id: String(input.id || nextId()),
      name: input.name || "role",
      position: Number(input.position || 0),
      rawPosition: Number(input.position || 0),
      color: Number(input.color || 0),
      permissions: BigInt(input.permissions || 0),
      managed: Boolean(input.managed),
      hoist: Boolean(input.hoist),
      mentionable: Boolean(input.mentionable),
      unicodeEmoji: input.unicodeEmoji || null,
      editable: input.editable !== false,
      members: new Map(),
      iconURL: () => input.iconUrl || null,
      async edit(payload) {
        Object.assign(this, payload);
        this.permissions = BigInt(payload.permissions ?? this.permissions);
        return this;
      },
      async setPosition(position) {
        this.position = Number(position);
        this.rawPosition = Number(position);
        return this;
      },
      async setPermissions(permissions) {
        this.permissions = BigInt(permissions);
        return this;
      },
      async delete() {
        guild.roles.cache.delete(this.id);
        for (const member of guild.members.cache.values()) member.roles.cache.delete(this.id);
      }
    };
    return role;
  };

  const everyone = makeRole({ id: guildId, name: "@everyone", position: 0, permissions: 1n, editable: false });
  const ownerRole = makeRole({ id: nextId(), name: "Owner", position: 80, permissions: 8n });
  const botRole = makeRole({ id: nextId(), name: "FIMA", position: 100, permissions: 8n, managed: true, editable: false });
  const memberRole = makeRole({ id: nextId(), name: "Member", position: 10, permissions: 1024n });
  guild.roles = {
    cache: mapValues([everyone, ownerRole, botRole, memberRole]),
    everyone,
    async fetch() { return this.cache; },
    async create(payload) {
      const role = makeRole({ ...payload, id: nextId() });
      this.cache.set(role.id, role);
      return role;
    }
  };

  const makeMember = (id, roleIds) => {
    const member = {
      id,
      user: { id },
      roles: {
        cache: new Map(),
        highest: null,
        async set(ids) {
          const selected = new Set([guild.id, ...ids.map(String)]);
          for (const role of guild.roles.cache.values()) {
            role.members.delete(id);
            if (selected.has(String(role.id))) {
              this.cache.set(String(role.id), role);
              role.members.set(id, member);
            } else {
              this.cache.delete(String(role.id));
            }
          }
          this.highest = [...this.cache.values()].sort((a, b) => b.position - a.position)[0] || null;
          return member;
        }
      }
    };
    for (const roleId of [guild.id, ...roleIds]) {
      const role = guild.roles.cache.get(String(roleId));
      if (role) {
        member.roles.cache.set(role.id, role);
        role.members.set(id, member);
      }
    }
    member.roles.highest = [...member.roles.cache.values()].sort((a, b) => b.position - a.position)[0] || null;
    return member;
  };
  const owner = makeMember(OWNER_ID, [ownerRole.id]);
  const bot = makeMember(BOT_ID, [botRole.id]);
  const ordinary = makeMember("100000000000000003", [memberRole.id]);
  guild.members = {
    cache: mapValues([owner, bot, ordinary]),
    me: bot,
    async fetch(memberId) {
      if (memberId == null) return this.cache;
      const member = this.cache.get(String(memberId));
      if (!member) throw Object.assign(new Error("unknown_member"), { code: 10007 });
      return member;
    },
    async fetchMe() { return bot; }
  };

  const makeMessage = (channel, input = {}) => {
    const authorId = input.authorId || BOT_ID;
    const messageId = String(input.id || nextId());
    const message = {
      id: messageId,
      channelId: channel.id,
      channel,
      author: {
        id: authorId,
        username: input.username || (authorId === BOT_ID ? "FIMA" : authorId === OWNER_ID ? "Owner" : "Member"),
        globalName: input.globalName || null,
        bot: input.bot ?? authorId === BOT_ID
      },
      webhookId: input.webhookId || null,
      applicationId: input.applicationId || null,
      url: input.url || `https://discord.com/channels/${guild.id}/${channel.id}/${messageId}`,
      content: input.content || "",
      embeds: input.embeds || [],
      components: input.components || [],
      attachments: mapValues((input.attachments || []).map(item => ({ id: item.id || nextId(), ...item }))),
      reactions: {
        cache: mapValues((input.reactions || []).map(item => ({
          emoji: item.emoji,
          count: item.count,
          me: item.me
        })))
      },
      pinned: Boolean(input.pinned),
      createdTimestamp: Number(input.createdTimestamp || Date.now()),
      async delete() { channel._messages.delete(this.id); },
      async pin() { this.pinned = true; }
    };
    return message;
  };

  const makeChannel = input => {
    const channel = {
      id: String(input.id || nextId()),
      name: input.name || "channel",
      type: Number(input.type ?? ChannelType.GuildText),
      parentId: input.parentId || null,
      position: Number(input.position || 0),
      rawPosition: Number(input.position || 0),
      topic: input.topic ?? null,
      nsfw: Boolean(input.nsfw),
      rateLimitPerUser: Number(input.rateLimitPerUser || 0),
      bitrate: input.bitrate ?? null,
      userLimit: input.userLimit ?? null,
      rtcRegion: input.rtcRegion ?? null,
      videoQualityMode: input.videoQualityMode ?? null,
      defaultAutoArchiveDuration: input.defaultAutoArchiveDuration ?? null,
      defaultThreadRateLimitPerUser: input.defaultThreadRateLimitPerUser ?? null,
      defaultSortOrder: input.defaultSortOrder ?? null,
      defaultForumLayout: input.defaultForumLayout ?? null,
      defaultReactionEmoji: input.defaultReactionEmoji ?? null,
      availableTags: input.availableTags || [],
      permissionOverwrites: { cache: mapValues(input.permissionOverwrites || []) },
      _messages: new Map(),
      _sendCount: 0,
      isThread: () => false,
      isTextBased() { return this.type === ChannelType.GuildText || this.type === ChannelType.GuildAnnouncement; },
      async edit(payload) {
        Object.assign(this, payload);
        this.parentId = payload.parent && typeof payload.parent === "object" ? payload.parent.id : payload.parent ?? this.parentId;
        this.rawPosition = Number(payload.position ?? this.rawPosition);
        if (Array.isArray(payload.permissionOverwrites)) {
          this.permissionOverwrites.cache = mapValues(payload.permissionOverwrites.map(item => ({ ...item, id: String(item.id) })));
        }
        return this;
      },
      async delete() { guild.channels.cache.delete(this.id); },
      async send(payload) {
        this._sendCount += 1;
        const message = makeMessage(this, {
          content: payload.content,
          embeds: payload.embeds,
          components: payload.components,
          attachments: (payload.files || []).map(file => ({
            name: file.name,
            url: typeof file.attachment === "string" ? file.attachment : "https://cdn.discordapp.com/restored.bin",
            description: file.description
          }))
        });
        this._messages.set(message.id, message);
        return message;
      },
      async createWebhook(payload) {
        const webhook = makeWebhook({ id: nextId(), name: payload.name, type: WebhookType.Incoming, channelId: this.id });
        guild._webhooks.set(webhook.id, webhook);
        return webhook;
      }
    };
    channel.messages = {
      fetchPins: async () => ({
        items: [...channel._messages.values()]
          .filter(message => message.pinned)
          .map(message => ({ pinnedTimestamp: message.createdTimestamp, message })),
        hasMore: false
      }),
      fetchPinned: async () => { throw new Error("deprecated fetchPinned must not be called"); },
      fetch: async query => {
        if (typeof query === "string") {
          const message = channel._messages.get(query);
          if (!message) throw Object.assign(new Error("unknown_message"), { code: 10008 });
          return message;
        }
        return channel._messages;
      }
    };
    return channel;
  };

  const category = makeChannel({ id: nextId(), name: "Information", type: ChannelType.GuildCategory, position: 0 });
  const rules = makeChannel({ id: nextId(), name: "rules", parentId: category.id, topic: "Read first", position: 1 });
  const general = makeChannel({ id: nextId(), name: "general", parentId: category.id, position: 2 });
  guild.channels = {
    cache: mapValues([category, rules, general]),
    _positionBatches: [],
    async fetch() { return this.cache; },
    async create(payload) {
      const channel = makeChannel({ ...payload, parentId: payload.parent || null, id: nextId() });
      this.cache.set(channel.id, channel);
      return channel;
    },
    async setPositions(positions) {
      this._positionBatches.push(structuredClone(positions));
      for (const item of positions) {
        const id = typeof item.channel === "object" ? item.channel.id : item.channel;
        const channel = this.cache.get(String(id));
        if (!channel) throw Object.assign(new Error("unknown_channel"), { code: 10003 });
        channel.position = Number(item.position);
        channel.rawPosition = Number(item.position);
      }
      return this.cache;
    }
  };
  guild.rulesChannelId = rules.id;
  guild.systemChannelId = general.id;

  const canonical = makeMessage(rules, {
    id: nextId(),
    content: "Canonical rules",
    pinned: true,
    attachments: unsafeUrls ? [{ url: "https://evil.invalid/private.png", name: "private.png" }] : []
  });
  rules._messages.set(canonical.id, canonical);

  const ownerEmbed = makeMessage(general, {
    id: nextId(),
    authorId: OWNER_ID,
    content: "Owner announcement https://evil.invalid/track",
    embeds: [{
      title: "Owner announcement",
      url: "https://evil.invalid/embed",
      image: { url: "https://cdn.discordapp.com/attachments/100000000000000001/100000000000000002/banner.png" },
      internal: { authorization: "must-never-be-backed-up", password: "must-never-be-backed-up" }
    }]
  });
  const webhookEmbed = makeMessage(general, {
    id: nextId(),
    authorId: "100000000000000010",
    username: "Announcement Hook",
    bot: true,
    webhookId: "100000000000000011",
    applicationId: "100000000000000012",
    embeds: [{ title: "Webhook announcement", footer: { secret: "must-never-be-backed-up" } }],
    components: [{ type: 1, components: [{ type: 2, label: "Unsafe", url: "https://discord.com/api/webhooks/1/secret-token" }] }]
  });
  const richRules = makeMessage(rules, {
    id: nextId(),
    authorId: "100000000000000020",
    username: "Legacy Rules App",
    bot: true,
    webhookId: "100000000000000021",
    applicationId: "100000000000000022",
    content: "Legacy rules",
    attachments: [{
      url: "https://cdn.discordapp.com/attachments/100000000000000001/100000000000000023/rules.png",
      name: "rules.png",
      contentType: "image/png"
    }],
    components: [{ type: 1, components: [{ type: 2, label: "Kuralları kabul et", customId: "accept_rules" }] }],
    reactions: [{ emoji: { id: null, name: "✅", animated: false }, count: 42, me: true }]
  });
  const ordinaryChat = makeMessage(general, {
    id: nextId(),
    authorId: ordinary.id,
    content: "ordinary member chat"
  });
  general._messages.set(ownerEmbed.id, ownerEmbed);
  general._messages.set(webhookEmbed.id, webhookEmbed);
  general._messages.set(ordinaryChat.id, ordinaryChat);
  rules._messages.set(richRules.id, richRules);

  const makeAutoModRule = input => {
    const rule = {
      id: String(input.id || nextId()),
      name: input.name || "Block spam",
      creatorId: OWNER_ID,
      eventType: Number(input.eventType ?? 1),
      triggerType: Number(input.triggerType ?? 5),
      triggerMetadata: input.triggerMetadata || {},
      actions: input.actions || [{ type: 1, metadata: {} }],
      enabled: input.enabled !== false,
      exemptRoles: input.exemptRoles || [],
      exemptChannels: input.exemptChannels || [],
      async edit(payload) {
        Object.assign(this, payload, {
          exemptRoles: payload.exemptRoles || [],
          exemptChannels: payload.exemptChannels || []
        });
        return this;
      },
      async delete() { guild._autoModRules.delete(this.id); }
    };
    return rule;
  };
  const autoMod = makeAutoModRule({ id: nextId() });
  guild._autoModRules = mapValues([autoMod]);
  guild.autoModerationRules = {
    fetch: async () => guild._autoModRules,
    create: async payload => {
      const rule = makeAutoModRule({ ...payload, id: nextId() });
      guild._autoModRules.set(rule.id, rule);
      return rule;
    }
  };

  const makeWebhook = input => {
    const webhook = {
      id: String(input.id || nextId()),
      name: input.name || "FIMA",
      type: Number(input.type ?? WebhookType.Incoming),
      channelId: input.channelId || general.id,
      applicationId: input.applicationId || null,
      owner: { id: OWNER_ID },
      token: input.token || "must-never-be-backed-up",
      avatarURL: () => input.avatarUrl || null,
      async edit(payload) {
        Object.assign(this, payload);
        this.channelId = payload.channel || this.channelId;
        return this;
      },
      async delete() { guild._webhooks.delete(this.id); }
    };
    return webhook;
  };
  const incoming = makeWebhook({ id: nextId(), name: "Announcements", channelId: general.id, avatarUrl: unsafeUrls ? "https://evil.invalid/avatar.png" : null });
  const application = makeWebhook({ id: nextId(), name: "Application Hook", type: WebhookType.Application, applicationId: "100000000000000099" });
  const follower = makeWebhook({ id: nextId(), name: "Follower Hook", type: WebhookType.ChannelFollower });
  guild._webhooks = mapValues([incoming, application, follower]);
  guild.fetchWebhooks = async () => guild._webhooks;

  return {
    guild,
    refs: { everyone, ownerRole, botRole, memberRole, owner, bot, ordinary, category, rules, general, canonical, richRules, ownerEmbed, webhookEmbed, ordinaryChat, incoming, application, follower },
    makeRole,
    makeChannel,
    makeMessage,
    makeWebhook
  };
}

function completeState(guild, refs) {
  return {
    guildConfigs: { [guild.id]: { rulesChannelId: refs.rules.id, rulesMessageId: refs.canonical.id } },
    supportTickets: { [guild.id]: [{ id: "ticket-1", guildId: guild.id, channelId: refs.general.id, status: "open" }] },
    transcripts: { [`ticket:${guild.id}:1`]: { guildId: guild.id, channelId: refs.general.id, messages: [] } }
  };
}

async function makeBackup(fixture) {
  return createParadiseBackupEnvelope(await captureParadiseGuildBackupSnapshot(fixture.guild, {
    state: completeState(fixture.guild, fixture.refs)
  }));
}

test("snapshot excludes webhook secrets and drops non-Discord image or attachment URLs", async () => {
  const fixture = createFakeGuild({ unsafeUrls: true });
  const snapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, { state: completeState(fixture.guild, fixture.refs) });
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /must-never-be-backed-up/);
  assert.doesNotMatch(serialized, /evil\.invalid/);
  assert.equal(snapshot.guild.iconUrl, null);
  assert.equal(snapshot.canonicalMessages[0].attachments.length, 0);
  assert.ok(snapshot.webhooks.every(webhook => !("token" in webhook)));
});

test("snapshot supports Discord collections whose AutoMod exemptions are stored as key-only IDs", async () => {
  const fixture = createFakeGuild();
  const roleId = "100000000000000071";
  const channelId = "100000000000000072";
  const rule = fixture.guild._autoModRules.values().next().value;
  rule.exemptRoles = new Map([[roleId, undefined]]);
  rule.exemptChannels = new Map([[channelId, undefined]]);

  const snapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, {
    state: completeState(fixture.guild, fixture.refs)
  });

  assert.deepEqual(snapshot.autoModRules[0].exemptRoleIds, [roleId]);
  assert.deepEqual(snapshot.autoModRules[0].exemptChannelIds, [channelId]);
  assert.equal(snapshot.restoreCapabilities.autoModRules, true);
});

test("restore drops stale key-only AutoMod exemptions before Discord create or edit and reconciles to zero drift", async t => {
  const staleRoleId = "100000000000009901";
  const staleChannelId = "100000000000009902";
  const source = createFakeGuild();
  const sourceRule = source.guild._autoModRules.values().next().value;
  sourceRule.exemptRoles = new Map([[staleRoleId, undefined]]);
  sourceRule.exemptChannels = new Map([[staleChannelId, undefined]]);
  const backup = await makeBackup(source);

  const assertDiscordAcceptsPayload = target => payload => {
    for (const roleId of payload.exemptRoles || []) {
      if (!target.guild.roles.cache.has(String(roleId))) {
        throw Object.assign(new Error(`Invalid Form Body exempt_roles ${roleId}`), { code: 50035 });
      }
    }
    for (const channelId of payload.exemptChannels || []) {
      if (!target.guild.channels.cache.has(String(channelId))) {
        throw Object.assign(new Error(`Invalid Form Body exempt_channels ${channelId}`), { code: 50035 });
      }
    }
  };

  for (const operation of ["edit", "create"]) {
    await t.test(operation, async () => {
      const target = createFakeGuild();
      if (operation === "edit") {
        const targetRule = target.guild._autoModRules.values().next().value;
        const originalEdit = targetRule.edit.bind(targetRule);
        targetRule.edit = async payload => {
          assertDiscordAcceptsPayload(target)(payload);
          return originalEdit(payload);
        };
      } else {
        target.guild._autoModRules.clear();
        const originalCreate = target.guild.autoModerationRules.create.bind(target.guild.autoModerationRules);
        target.guild.autoModerationRules.create = async payload => {
          assertDiscordAcceptsPayload(target)(payload);
          return originalCreate(payload);
        };
      }

      let restoredState = null;
      const report = await restoreParadiseGuildBackup({
        guild: target.guild,
        backup,
        confirmation: paradiseRestoreConfirmation(backup),
        allowedGuildId: GUILD_ID,
        persistRestoredState: async value => { restoredState = value; }
      });
      assert.equal(report.status, "restored");
      assert.equal(report.autoModRules.droppedExemptRoles, 1);
      assert.equal(report.autoModRules.droppedExemptChannels, 1);
      const restoredRule = target.guild._autoModRules.values().next().value;
      assert.deepEqual(restoredRule.exemptRoles, []);
      assert.deepEqual(restoredRule.exemptChannels, []);

      const currentSnapshot = await captureParadiseGuildBackupSnapshot(target.guild, {
        state: {
          guildConfigs: { [GUILD_ID]: restoredState.guildConfig },
          supportTickets: { [GUILD_ID]: restoredState.tickets },
          transcripts: restoredState.legacyTranscripts
        }
      });
      const dryRun = buildParadiseRestoreDryRun({
        backup,
        currentSnapshot,
        expectedGuildId: GUILD_ID,
        allowedGuildId: GUILD_ID
      });
      assert.equal(dryRun.canRestore, true);
      assert.equal(dryRun.mutationsPlanned, 0);
    });
  }
});

test("restore remaps valid AutoMod role and channel exemptions to recreated resources", async () => {
  const source = createFakeGuild();
  const sourceRule = source.guild._autoModRules.values().next().value;
  sourceRule.exemptRoles = new Map([[source.refs.memberRole.id, source.refs.memberRole]]);
  sourceRule.exemptChannels = new Map([[source.refs.general.id, source.refs.general]]);
  const backup = await makeBackup(source);

  const target = createFakeGuild();
  await target.refs.memberRole.delete();
  await target.refs.general.delete();
  const targetRule = target.guild._autoModRules.values().next().value;
  const originalEdit = targetRule.edit.bind(targetRule);
  targetRule.edit = async payload => {
    assert.ok(payload.exemptRoles.every(id => target.guild.roles.cache.has(String(id))));
    assert.ok(payload.exemptChannels.every(id => target.guild.channels.cache.has(String(id))));
    return originalEdit(payload);
  };

  let restoredState = null;
  const report = await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID,
    persistRestoredState: async value => { restoredState = value; }
  });
  assert.equal(report.status, "restored");
  assert.equal(report.autoModRules.droppedExemptRoles, 0);
  assert.equal(report.autoModRules.droppedExemptChannels, 0);
  assert.notEqual(targetRule.exemptRoles[0], source.refs.memberRole.id);
  assert.notEqual(targetRule.exemptChannels[0], source.refs.general.id);
  assert.ok(target.guild.roles.cache.has(targetRule.exemptRoles[0]));
  assert.ok(target.guild.channels.cache.has(targetRule.exemptChannels[0]));

  const currentSnapshot = await captureParadiseGuildBackupSnapshot(target.guild, {
    state: {
      guildConfigs: { [GUILD_ID]: restoredState.guildConfig },
      supportTickets: { [GUILD_ID]: restoredState.tickets },
      transcripts: restoredState.legacyTranscripts
    }
  });
  const dryRun = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot,
    expectedGuildId: GUILD_ID,
    allowedGuildId: GUILD_ID
  });
  assert.equal(dryRun.canRestore, true);
  assert.equal(dryRun.mutationsPlanned, 0);
});

test("restore rejects a missing AutoMod action channel with a stable redacted error", async () => {
  const missingChannelId = "100000000000009903";
  const source = createFakeGuild();
  const sourceRule = source.guild._autoModRules.values().next().value;
  sourceRule.actions = [{ type: 2, metadata: { channelId: missingChannelId } }];
  const backup = await makeBackup(source);
  const target = createFakeGuild();

  await assert.rejects(
    restoreParadiseGuildBackup({
      guild: target.guild,
      backup,
      confirmation: paradiseRestoreConfirmation(backup),
      allowedGuildId: GUILD_ID
    }),
    error => {
      assert.equal(error.code, "restore_automod_action_channel_missing");
      assert.equal(error.message, "restore_automod_action_channel_missing");
      assert.deepEqual(error.context, {
        operation: "payload",
        resourceKind: "auto_mod_rule",
        index: 0
      });
      assert.doesNotMatch(JSON.stringify(error.context), new RegExp(missingChannelId));
      return true;
    }
  );
});

test("snapshot explicitly captures owner and bot members when the bulk collection omits them", async () => {
  const fixture = createFakeGuild();
  const completeCache = fixture.guild.members.cache;
  const ordinary = fixture.refs.ordinary;
  const targeted = [];
  fixture.guild.members.cache = new Map([[ordinary.id, ordinary]]);
  fixture.guild.members.fetch = async memberId => {
    if (memberId == null) return new Map([[ordinary.id, ordinary]]);
    targeted.push(String(memberId));
    const member = completeCache.get(String(memberId)) || null;
    if (member) fixture.guild.members.cache.set(String(memberId), member);
    return member;
  };

  const snapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, {
    state: completeState(fixture.guild, fixture.refs)
  });

  assert.deepEqual(targeted, [OWNER_ID, BOT_ID]);
  assert.equal(snapshot.restoreCapabilities.memberRoles, true);
  assert.deepEqual(
    snapshot.memberRoles.map(member => member.memberId).sort(),
    [OWNER_ID, BOT_ID, ordinary.id].sort()
  );
});

test("snapshot reuses a provably complete member cache when a repeated bulk fetch fails", async () => {
  const fixture = createFakeGuild();
  fixture.guild.memberCount = fixture.guild.members.cache.size;
  fixture.guild.members.fetch = async memberId => {
    if (memberId == null) throw Object.assign(new Error("members_timeout"), { code: "Members didn't arrive in time." });
    return fixture.guild.members.cache.get(String(memberId)) || null;
  };

  const snapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, {
    state: completeState(fixture.guild, fixture.refs)
  });

  assert.equal(snapshot.restoreCapabilities.memberRoles, true);
  assert.equal(snapshot.memberRoles.length, fixture.guild.memberCount);
  assert.ok(snapshot.captureErrors.some(error => (
    error.code === "member_fetch_reused_complete_cache" && error.informational === true
  )));
});

test("content archive captures important rich sources without becoming restore input", async () => {
  const fixture = createFakeGuild({ unsafeUrls: true });
  const snapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, { state: completeState(fixture.guild, fixture.refs) });
  const archivedIds = new Set(snapshot.contentArchive.map(message => message.id));
  assert.equal(snapshot.restoreCapabilities.version, 2);
  assert.equal(snapshot.restoreCapabilities.contentArchive, true);
  assert.ok(archivedIds.has(fixture.refs.canonical.id));
  assert.ok(archivedIds.has(fixture.refs.ownerEmbed.id));
  assert.ok(archivedIds.has(fixture.refs.webhookEmbed.id));
  assert.ok(archivedIds.has(fixture.refs.richRules.id));
  assert.equal(archivedIds.has(fixture.refs.ordinaryChat.id), false);
  assert.equal(snapshot.contentArchive.find(message => message.id === fixture.refs.ownerEmbed.id).sourceKind, "owner");
  assert.equal(snapshot.contentArchive.find(message => message.id === fixture.refs.webhookEmbed.id).sourceKind, "webhook");
  const richRules = snapshot.contentArchive.find(message => message.id === fixture.refs.richRules.id);
  assert.equal(richRules.webhook.applicationId, "100000000000000022");
  assert.equal(richRules.attachments[0].name, "rules.png");
  assert.equal(richRules.components[0].components[0].label, "Kuralları kabul et");
  assert.deepEqual(richRules.reactions, [{
    emoji: { id: null, name: "✅", animated: false },
    count: 42,
    me: true
  }]);
  assert.ok(snapshot.contentArchive.every(message => message.automaticRestore === false));
  assert.ok(snapshot.contentArchive.every(message => message.restorePolicy === "content_studio_import_only"));

  const serialized = JSON.stringify(snapshot.contentArchive);
  assert.doesNotMatch(serialized, /must-never-be-backed-up|evil\.invalid|api\/webhooks/i);

  const backup = createParadiseBackupEnvelope(snapshot);
  const dryRun = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot: snapshot,
    expectedGuildId: fixture.guild.id,
    allowedGuildId: fixture.guild.id
  });
  assert.equal(dryRun.canRestore, true);
  assert.equal(Object.hasOwn(dryRun.plan, "contentArchive"), false);
});

test("restore rejects a wrong guild and a non-allowlisted target before mutation", async () => {
  const valid = createFakeGuild();
  const backup = await makeBackup(valid);
  const wrong = createFakeGuild({ guildId: "1520519015661961258" });
  await assert.rejects(restoreParadiseGuildBackup({
    guild: wrong.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: wrong.guild.id
  }), { code: "test_guild_only" });
  await assert.rejects(restoreParadiseGuildBackup({
    guild: valid.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: "different"
  }), { code: "restore_target_not_allowlisted" });
});

test("restore requires the digest-bound exact confirmation", async () => {
  const fixture = createFakeGuild();
  const backup = await makeBackup(fixture);
  await assert.rejects(restoreParadiseGuildBackup({
    guild: fixture.guild,
    backup,
    confirmation: "RESTORE TEST",
    allowedGuildId: GUILD_ID
  }), { code: "restore_confirmation_mismatch" });
});

test("production restore requires an exact scoped proof and redacts verifier failures", async () => {
  const fixture = createFakeGuild({ guildId: PRODUCTION_GUILD_ID });
  const backup = await makeBackup(fixture);
  const secret = "test-only-production-proof-secret-1234567890";
  const planId = "00000000-0000-4000-8000-000000000001";
  const authorization = {
    executionProofSecret: secret,
    planId,
    mode: "community",
    nowMs: Date.parse("2026-08-12T00:00:30.000Z")
  };

  for (const missingOrInvalid of [
    null,
    productionExecutionProof(backup, { secret, planId, guildId: GUILD_ID }),
    productionExecutionProof(backup, { secret, planId, mode: "wrong" }),
    productionExecutionProof(backup, { secret, planId: "00000000-0000-4000-8000-000000000002" }),
    productionExecutionProof(backup, {
      secret,
      planId,
      expiresAt: "2026-08-12T00:00:01.000Z"
    })
  ]) {
    await assert.rejects(restoreParadiseGuildBackup({
      guild: fixture.guild,
      backup,
      confirmation: paradiseProductionRestoreConfirmation(backup),
      allowedGuildId: PRODUCTION_GUILD_ID,
      productionAuthorization: { ...authorization, executionProof: missingOrInvalid }
    }), error => {
      assert.match(String(error?.code || ""), /^production_rebuild_execution_proof_/);
      assert.doesNotMatch(JSON.stringify(error), /test-only|00000000|[a-f0-9]{64}/iu);
      return true;
    });
  }

  await assert.rejects(restoreParadiseGuildBackup({
    guild: fixture.guild,
    backup,
    confirmation: paradiseProductionRestoreConfirmation(backup),
    allowedGuildId: PRODUCTION_GUILD_ID,
    productionAuthorization: {
      ...authorization,
      executionProof: productionExecutionProof(backup, { secret, planId }),
      executionProofSecret: ""
    }
  }), error => {
    assert.equal(error?.code, "production_rebuild_execution_proof_invalid");
    assert.deepEqual(Object.keys(error).sort(), ["code"]);
    return true;
  });
});

test("production confirmation mismatch never exposes the expected digest-bound value", async () => {
  const fixture = createFakeGuild({ guildId: PRODUCTION_GUILD_ID });
  const backup = await makeBackup(fixture);
  await assert.rejects(restoreParadiseGuildBackup({
    guild: fixture.guild,
    backup,
    confirmation: "wrong",
    allowedGuildId: PRODUCTION_GUILD_ID
  }), error => {
    assert.equal(error?.code, "restore_confirmation_mismatch");
    assert.deepEqual(Object.keys(error).sort(), ["code"]);
    assert.doesNotMatch(JSON.stringify(error), /RESTORE FT COMMUNITY|[a-f0-9]{64}/iu);
    return true;
  });
});

test("restore defers every channel position to one deterministic bulk request", async () => {
  const source = createFakeGuild();
  source.refs.category.position = 12;
  source.refs.category.rawPosition = 12;
  source.refs.rules.position = 4;
  source.refs.rules.rawPosition = 4;
  source.refs.general.position = 9;
  source.refs.general.rawPosition = 9;
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  const editPayloads = [];
  for (const channel of target.guild.channels.cache.values()) {
    const originalEdit = channel.edit.bind(channel);
    channel.edit = async payload => {
      editPayloads.push(payload);
      return originalEdit(payload);
    };
  }

  await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  });

  assert.ok(editPayloads.length > 0);
  assert.ok(editPayloads.every(payload => !Object.hasOwn(payload, "position")));
  assert.equal(target.guild.channels._positionBatches.length, 1);
  assert.deepEqual(
    target.guild.channels._positionBatches[0].map(item => item.position),
    [4, 9, 12]
  );
  assert.equal(target.refs.category.rawPosition, 12);
  assert.equal(target.refs.rules.rawPosition, 4);
  assert.equal(target.refs.general.rawPosition, 9);
});

test("a partial restore failure propagates and cannot be reported as restored", async () => {
  const source = createFakeGuild();
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  target.guild.roles.cache.delete(target.refs.memberRole.id);
  target.guild.roles.create = async () => { throw Object.assign(new Error("simulated_role_create_failure"), { code: "simulated_role_create_failure" }); };
  await assert.rejects(restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  }), { code: "simulated_role_create_failure" });
});

test("restore treats already-deleted Discord roles and channels as idempotent but keeps other failures closed", async () => {
  const source = createFakeGuild();
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  const absentRole = target.makeRole({ name: "Already absent role", position: 1 });
  const absentChannel = target.makeChannel({ name: "already-absent-channel", type: ChannelType.GuildText });
  absentRole.delete = async () => { throw Object.assign(new Error("Unknown Role"), { code: 10011 }); };
  absentChannel.delete = async () => { throw Object.assign(new Error("Unknown Channel"), { code: 10003 }); };
  target.guild.roles.cache.set(absentRole.id, absentRole);
  target.guild.channels.cache.set(absentChannel.id, absentChannel);

  const report = await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  });
  assert.equal(report.status, "restored");
  assert.equal(report.roles.alreadyAbsent, 1);
  assert.equal(report.channels.alreadyAbsent, 1);
  assert.equal(target.guild.roles.cache.has(absentRole.id), false);
  assert.equal(target.guild.channels.cache.has(absentChannel.id), false);

  const failingTarget = createFakeGuild();
  const forbiddenChannel = failingTarget.makeChannel({ name: "forbidden-channel", type: ChannelType.GuildText });
  forbiddenChannel.delete = async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); };
  failingTarget.guild.channels.cache.set(forbiddenChannel.id, forbiddenChannel);
  await assert.rejects(restoreParadiseGuildBackup({
    guild: failingTarget.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  }), { code: 50013 });
});

test("owner and bot access roles survive restore even when absent from the backup", async () => {
  const source = createFakeGuild();
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  const emergencyOwnerRole = target.makeRole({ name: "Emergency Owner Access", position: 70, permissions: 8n });
  const emergencyBotRole = target.makeRole({ name: "Emergency Bot Access", position: 90, permissions: 8n });
  target.guild.roles.cache.set(emergencyOwnerRole.id, emergencyOwnerRole);
  target.guild.roles.cache.set(emergencyBotRole.id, emergencyBotRole);
  await target.refs.owner.roles.set([...target.refs.owner.roles.cache.keys(), emergencyOwnerRole.id]);
  await target.refs.bot.roles.set([...target.refs.bot.roles.cache.keys(), emergencyBotRole.id]);

  const report = await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  });
  assert.equal(report.status, "restored");
  assert.ok(target.guild.roles.cache.has(emergencyOwnerRole.id));
  assert.ok(target.guild.roles.cache.has(emergencyBotRole.id));
  assert.ok(target.refs.owner.roles.cache.has(emergencyOwnerRole.id));
  assert.ok(target.refs.bot.roles.cache.has(emergencyBotRole.id));
});

test("application and non-incoming webhooks are always preserved", async () => {
  const fixture = createFakeGuild();
  const backup = await makeBackup(fixture);
  const applicationId = fixture.refs.application.id;
  const followerId = fixture.refs.follower.id;
  const report = await restoreParadiseGuildBackup({
    guild: fixture.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  });
  assert.ok(fixture.guild._webhooks.has(applicationId));
  assert.ok(fixture.guild._webhooks.has(followerId));
  assert.ok(report.webhooks.protected.some(item => item.reason === "application_webhook"));
  assert.ok(report.webhooks.protected.some(item => item.reason === "non_incoming_webhook"));
});

test("matching canonical messages are not reposted and extra managed messages are removed", async () => {
  const source = createFakeGuild();
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  const extra = target.makeMessage(target.refs.rules, { content: "Obsolete managed panel", pinned: true });
  target.refs.rules._messages.set(extra.id, extra);
  const beforeSends = target.refs.rules._sendCount;
  const report = await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID
  });
  assert.equal(report.canonicalMessages.matched, 1);
  assert.equal(report.canonicalMessages.restored, 0);
  assert.equal(report.canonicalMessages.removed, 1);
  assert.equal(target.refs.rules._sendCount, beforeSends);
  assert.equal(target.refs.rules._messages.has(extra.id), false);
});

test("a restored and ID-remapped snapshot reconciles to zero planned mutations", async () => {
  const source = createFakeGuild();
  const backup = await makeBackup(source);
  const target = createFakeGuild();
  target.refs.memberRole.name = "Changed Member";
  target.refs.rules.name = "changed-rules";
  target.refs.canonical.content = "Changed canonical message";

  let restoredState = null;
  const report = await restoreParadiseGuildBackup({
    guild: target.guild,
    backup,
    confirmation: paradiseRestoreConfirmation(backup),
    allowedGuildId: GUILD_ID,
    persistRestoredState: async value => { restoredState = value; }
  });
  assert.equal(report.status, "restored");
  assert.ok(restoredState);

  const state = {
    guildConfigs: { [GUILD_ID]: restoredState.guildConfig },
    supportTickets: { [GUILD_ID]: restoredState.tickets },
    transcripts: restoredState.legacyTranscripts
  };
  const reconciledSnapshot = await captureParadiseGuildBackupSnapshot(target.guild, { state });
  const reconciliation = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot: reconciledSnapshot,
    expectedGuildId: GUILD_ID,
    allowedGuildId: GUILD_ID
  });
  assert.equal(reconciliation.canRestore, true);
  assert.equal(reconciliation.mutationsPlanned, 0);
});

test("a destructive failure restores the persisted backup and resolves its rollback marker only after zero-diff reconciliation", async t => {
  const markerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-rebuild-rollback-integration-"));
  t.after(() => fs.rm(markerRoot, { recursive: true, force: true }));

  const fixture = createFakeGuild();
  const originalState = completeState(fixture.guild, fixture.refs);
  const backup = await makeBackup(fixture);
  const backupPath = path.join(markerRoot, "verified-backup.json");
  await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  const persistedBackup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  const marker = await armParadiseRollbackMarker({
    guildId: GUILD_ID,
    backupArtifact: backupPath,
    backupDigest: persistedBackup.integrity.digest,
    mode: "test_guild_rebuild:community",
    confirmation: paradiseRestoreConfirmation(persistedBackup),
    correlationId: "rollback-integration"
  }, { root: markerRoot });

  await updateParadiseRollbackMarker(GUILD_ID, marker.markerId, {
    status: "rebuild_in_progress"
  }, { root: markerRoot });
  await fixture.refs.rules.delete();
  await fixture.refs.memberRole.delete();
  fixture.refs.canonical.content = "partial destructive mutation";

  await updateParadiseRollbackMarker(GUILD_ID, marker.markerId, {
    status: "rollback_in_progress",
    failure: { code: "simulated_destructive_failure" }
  }, { root: markerRoot });

  let restoredState = null;
  const rollback = await restoreParadiseGuildBackup({
    guild: fixture.guild,
    backup: persistedBackup,
    confirmation: paradiseRestoreConfirmation(persistedBackup),
    allowedGuildId: GUILD_ID,
    currentState: originalState,
    persistRestoredState: async value => { restoredState = value; }
  });
  assert.equal(rollback.status, "restored");
  assert.ok(restoredState);

  const reconciledState = {
    guildConfigs: { [GUILD_ID]: restoredState.guildConfig },
    supportTickets: { [GUILD_ID]: restoredState.tickets },
    transcripts: restoredState.legacyTranscripts
  };
  const restoredSnapshot = await captureParadiseGuildBackupSnapshot(fixture.guild, { state: reconciledState });
  const reconciliation = buildParadiseRestoreDryRun({
    backup: persistedBackup,
    currentSnapshot: restoredSnapshot,
    expectedGuildId: GUILD_ID,
    allowedGuildId: GUILD_ID
  });
  assert.equal(reconciliation.canRestore, true);
  assert.equal(reconciliation.mutationsPlanned, 0);

  const resolved = await resolveParadiseRollbackMarker(
    GUILD_ID,
    marker.markerId,
    reconciliation,
    { root: markerRoot }
  );
  assert.equal(resolved.status, "resolved");
  assert.equal((await assertNoUnresolvedParadiseRollback(GUILD_ID, { root: markerRoot })).status, "resolved");
});
