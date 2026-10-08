import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyFimaBotProfileSync,
  FIMA_BOT_PROFILE_CONFIRMATION,
  FIMA_BOT_PROFILE_USERNAME,
  fimaBotProfileConfigFromEnv,
  inspectFimaBotProfileSync
} from "../src/fimaBotProfileSync.js";

const APPLICATION_ID = "123456789012345678";
const OWNER_ID = "234567890123456789";
const GUILD_ID = "1419335632324657306";

function clientFixture() {
  const calls = [];
  const readbackCalls = [];
  const member = {
    id: APPLICATION_ID,
    user: { id: APPLICATION_ID },
    guild: { id: GUILD_ID },
    nickname: "Paradise",
    async setNickname(value) {
      calls.push(["nickname", value]);
      this.nickname = value;
      return this;
    }
  };
  const guild = {
    id: GUILD_ID,
    members: {
      me: member,
      async fetch(options) {
        readbackCalls.push(["member", options]);
        return member;
      }
    }
  };
  const client = {
    application: {
      id: APPLICATION_ID,
      name: "Paradise"
    },
    user: {
      id: APPLICATION_ID,
      username: "Paradise",
      avatar: "existing-avatar",
      banner: "existing-banner",
      async setUsername(value) {
        calls.push(["username", value]);
        this.username = value;
        return this;
      },
      async setAvatar(value) {
        calls.push(["avatar", path.basename(value)]);
        this.avatar = "updated-avatar";
        return this;
      },
      async setBanner(value) {
        calls.push(["banner", path.basename(value)]);
        this.banner = "updated-banner";
        return this;
      }
    },
    guilds: {
      cache: new Map([[GUILD_ID, guild]]),
      async fetch(options) {
        readbackCalls.push(["guild", options]);
        return guild;
      }
    },
    users: {
      async fetch(userId, options) {
        readbackCalls.push(["user", userId, options]);
        return client.user;
      }
    }
  };
  return { client, calls, readbackCalls };
}

async function profileFixture() {
  const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-profile-sync-"));
  const avatarBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from("synthetic-avatar")
  ]);
  const bannerBytes = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([16, 0, 0, 0]),
    Buffer.from("WEBPsynthetic-banner")
  ]);
  await fs.writeFile(path.join(assetRoot, "avatar.png"), avatarBytes);
  await fs.writeFile(path.join(assetRoot, "banner.webp"), bannerBytes);
  return {
    assetRoot,
    config: {
      applyEnabled: true,
      expectedApplicationId: APPLICATION_ID,
      expectedOwnerUserId: OWNER_ID,
      guildIds: [GUILD_ID],
      assetRoot,
      avatarAsset: "avatar.png",
      avatarSha256: crypto.createHash("sha256").update(avatarBytes).digest("hex"),
      bannerAsset: "banner.webp",
      bannerSha256: crypto.createHash("sha256").update(bannerBytes).digest("hex")
    }
  };
}

test("FIMA Bot profile status is redacted and fails closed for an unexpected application or guild", async () => {
  const { client } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  try {
    const status = await inspectFimaBotProfileSync(client, {
      config: { ...config, expectedApplicationId: "999", guildIds: ["888"] }
    });
    assert.equal(status.exactApplication, false);
    assert.equal(status.exactGuildScope, false);
    assert.equal(status.scopeReady, false);
    assert.equal(status.avatar.ready, true);
    assert.equal(status.banner.ready, true);
    assert.doesNotMatch(JSON.stringify(status), new RegExp(assetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(Object.hasOwn(status, "_private"), false);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot profile dry-run reports work without mutating Discord", async () => {
  const { client, calls } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  try {
    const result = await applyFimaBotProfileSync(client, { config, dryRun: true });
    assert.equal(result.applied, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.status.scopeReady, true);
    assert.equal(result.status.usernameMatches, false);
    assert.equal(result.status.applicationNameRequiresDashboardUpdate, true);
    assert.deepEqual(result.status.applicationNameRemediation, {
      required: true,
      supportedByBotTokenApi: false,
      channel: "discord_developer_portal",
      action: "Set the verified Discord application name to FIMA.",
      developerPortalUrl: `https://discord.com/developers/applications/${APPLICATION_ID}/information`
    });
    assert.deepEqual(calls, []);
    assert.equal(Object.hasOwn(result.status, "_private"), false);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot application-name remediation never links an unverified application", async () => {
  const { client } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  try {
    const status = await inspectFimaBotProfileSync(client, {
      config: { ...config, expectedApplicationId: "999999999999999999" }
    });
    assert.equal(status.exactApplication, false);
    assert.equal(status.applicationNameRemediation.required, true);
    assert.equal(status.applicationNameRemediation.supportedByBotTokenApi, false);
    assert.equal(status.applicationNameRemediation.developerPortalUrl, null);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot v5 repository assets pass the real profile dry-run without Discord mutation", async () => {
  const { client, calls } = clientFixture();
  const assetRoot = fileURLToPath(new URL("../public/assets/images/discord/v5/", import.meta.url));
  const config = fimaBotProfileConfigFromEnv({
    FIMA_BOT_PROFILE_SYNC_ENABLED: "false",
    FIMA_BOT_EXPECTED_APPLICATION_ID: APPLICATION_ID,
    FIMA_BOT_PROFILE_OWNER_USER_ID: OWNER_ID,
    FIMA_BOT_PROFILE_GUILD_IDS: GUILD_ID,
    FIMA_BOT_PROFILE_ASSET_ROOT: assetRoot,
    FIMA_BOT_PROFILE_AVATAR_ASSET: "fima-bot-avatar-v5.png",
    FIMA_BOT_PROFILE_AVATAR_SHA256: "c07adab81e29416fd02a74ecf3ffc99a976d95997dc5279510906129aec50baf",
    FIMA_BOT_PROFILE_BANNER_ASSET: "fima-bot-profile-banner-v5.png",
    FIMA_BOT_PROFILE_BANNER_SHA256: "9967e6d07ed044653d46fad15a5d80b5f22d9efd7da0df8509d916d9ff97e568"
  });

  const result = await applyFimaBotProfileSync(client, { config, dryRun: true });

  assert.equal(result.applied, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.status.applyEnabled, false);
  assert.equal(result.status.scopeReady, true);
  assert.equal(result.status.avatar.ready, true);
  assert.equal(result.status.banner.ready, true);
  assert.match(result.status.avatar.digest, /^[a-f0-9]{64}$/);
  assert.match(result.status.banner.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls, []);
});

test("FIMA Bot profile assets fail closed on missing digest, spoofed format and digest mismatch", async t => {
  const { client } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  try {
    await t.test("missing digest", async () => {
      const status = await inspectFimaBotProfileSync(client, {
        config: { ...config, avatarSha256: "" }
      });
      assert.equal(status.avatar.ready, false);
      assert.equal(status.avatar.reason, "profile_asset_digest_required");
      assert.equal(status.scopeReady, false);
    });

    await t.test("spoofed format", async () => {
      const spoofed = Buffer.from("not-a-png");
      await fs.writeFile(path.join(assetRoot, "spoofed.png"), spoofed);
      const status = await inspectFimaBotProfileSync(client, {
        config: {
          ...config,
          avatarAsset: "spoofed.png",
          avatarSha256: crypto.createHash("sha256").update(spoofed).digest("hex")
        }
      });
      assert.equal(status.avatar.ready, false);
      assert.equal(status.avatar.reason, "profile_asset_format_invalid");
      assert.equal(status.scopeReady, false);
    });

    await t.test("digest mismatch", async () => {
      const status = await inspectFimaBotProfileSync(client, {
        config: { ...config, bannerSha256: "0".repeat(64) }
      });
      assert.equal(status.banner.ready, false);
      assert.equal(status.banner.reason, "profile_asset_digest_mismatch");
      assert.equal(status.scopeReady, false);
    });
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot profile apply requires a freshly verified owner and exact confirmation", async () => {
  const { client } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  try {
    await assert.rejects(
      applyFimaBotProfileSync(client, { config, dryRun: false, authorization: { ownerVerified: false } }),
      /owner_verification_required/
    );
    await assert.rejects(
      applyFimaBotProfileSync(client, {
        config,
        dryRun: false,
        authorization: { ownerVerified: true, actorUserId: OWNER_ID, confirmation: "YES" }
      }),
      /profile_sync_confirmation_required/
    );
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot profile apply is scoped and asset-digest idempotent", async () => {
  const { client, calls, readbackCalls } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  const authorization = {
    ownerVerified: true,
    actorUserId: OWNER_ID,
    confirmation: FIMA_BOT_PROFILE_CONFIRMATION
  };
  try {
    const first = await applyFimaBotProfileSync(client, { config, dryRun: false, authorization });
    assert.equal(first.applied, true);
    assert.deepEqual(first.changes, ["bot_username", "guild_nickname", "bot_avatar", "bot_banner"]);
    assert.equal(calls.find(([kind]) => kind === "username")?.[1], FIMA_BOT_PROFILE_USERNAME);
    assert.deepEqual(calls.map(([kind]) => kind), ["username", "nickname", "avatar", "banner"]);
    assert.equal(first.readback.fresh, true);
    assert.equal(first.readback.ready, true);
    assert.deepEqual(first.readback.checks, {
      exactUser: true,
      username: true,
      avatarPresent: true,
      bannerPresent: true,
      avatarMatchesMutation: true,
      bannerMatchesMutation: true,
      guildNicknames: true
    });
    assert.deepEqual(readbackCalls, [
      ["user", APPLICATION_ID, { force: true, cache: false }],
      ["guild", { guild: GUILD_ID, force: true, cache: false }],
      ["member", { user: APPLICATION_ID, force: true, cache: false }]
    ]);

    calls.length = 0;
    readbackCalls.length = 0;
    const second = await applyFimaBotProfileSync(client, {
      config,
      dryRun: false,
      authorization,
      previousAssetDigests: first.assetDigests
    });
    assert.equal(second.applied, false);
    assert.deepEqual(second.changes, []);
    assert.equal(second.readback.ready, true);
    assert.deepEqual(calls, []);
    assert.equal(readbackCalls.length, 3);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot profile apply fails closed when fresh Discord user readback is stale", async () => {
  const { client, calls } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  client.users.fetch = async () => ({
    id: APPLICATION_ID,
    username: "stale-name",
    avatar: "stale-avatar",
    banner: "stale-banner"
  });
  try {
    await assert.rejects(
      applyFimaBotProfileSync(client, {
        config,
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: FIMA_BOT_PROFILE_CONFIRMATION
        }
      }),
      error => {
        assert.equal(error.code, "profile_sync_partial_mutation");
        assert.equal(error.partialMutationPossible, true);
        assert.equal(error.remediationRequired, true);
        assert.equal(error.message, "profile_sync_partial_mutation");
        return true;
      }
    );
    assert.deepEqual(calls.map(([kind]) => kind), ["username", "nickname", "avatar", "banner"]);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});

test("FIMA Bot profile apply marks a mid-sequence failure as requiring remediation", async () => {
  const { client, calls } = clientFixture();
  const { assetRoot, config } = await profileFixture();
  client.user.setBanner = async value => {
    calls.push(["banner", path.basename(value)]);
    throw new Error("raw-provider-detail-must-not-leak");
  };
  try {
    await assert.rejects(
      applyFimaBotProfileSync(client, {
        config,
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: FIMA_BOT_PROFILE_CONFIRMATION
        }
      }),
      error => {
        assert.equal(error.code, "profile_sync_partial_mutation");
        assert.equal(error.partialMutationPossible, true);
        assert.equal(error.remediationRequired, true);
        assert.doesNotMatch(JSON.stringify(error), /raw-provider-detail-must-not-leak/u);
        return true;
      }
    );
    assert.deepEqual(calls.map(([kind]) => kind), ["username", "nickname", "avatar", "banner"]);
  } finally {
    await fs.rm(assetRoot, { recursive: true, force: true });
  }
});
