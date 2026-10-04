import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyFtCommunityProfileSync,
  FT_COMMUNITY_PRODUCTION_GUILD_ID,
  FT_COMMUNITY_PROFILE_ALLOWED_GUILD_IDS,
  FT_COMMUNITY_TEST_GUILD_ID,
  ftCommunityProfileConfigFromEnv,
  ftCommunityProfileConfirmation,
  inspectFtCommunityProfileSync
} from "../src/ftCommunityProfileSync.js";

const OWNER_ID = "234567890123456789";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngBytes(label = "icon") {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from(label)
  ]);
}

function webpBytes(label = "banner") {
  return Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WEBP", "ascii"),
    Buffer.from(label)
  ]);
}

function clientFixture(guildId = FT_COMMUNITY_PRODUCTION_GUILD_ID) {
  const calls = [];
  const readbackCalls = [];
  const guild = {
    id: guildId,
    ownerId: OWNER_ID,
    icon: "existing-icon",
    banner: "existing-banner",
    splash: "existing-splash",
    async setIcon(value, reason) {
      calls.push(["icon", path.basename(value), reason]);
      this.icon = "updated-icon";
      return this;
    },
    async setBanner(value, reason) {
      calls.push(["banner", path.basename(value), reason]);
      this.banner = "updated-banner";
      return this;
    },
    async setSplash(value, reason) {
      calls.push(["splash", path.basename(value), reason]);
      this.splash = "updated-splash";
      return this;
    }
  };
  return {
    client: {
      guilds: {
        cache: new Map([[guildId, guild]]),
        async fetch(options) {
          readbackCalls.push(options);
          return guild;
        }
      }
    },
    guild,
    calls,
    readbackCalls
  };
}

function withoutSplash(config) {
  return {
    ...config,
    splashAsset: "",
    splashSha256: ""
  };
}

async function assetFixture(guildId = FT_COMMUNITY_PRODUCTION_GUILD_ID) {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ft-community-profile-"));
  const assetRoot = path.join(fixtureRoot, "assets");
  await fs.mkdir(assetRoot);
  const icon = pngBytes();
  const banner = webpBytes();
  const splash = pngBytes("splash");
  await fs.writeFile(path.join(assetRoot, "icon.png"), icon);
  await fs.writeFile(path.join(assetRoot, "banner.webp"), banner);
  await fs.writeFile(path.join(assetRoot, "splash.png"), splash);
  return {
    fixtureRoot,
    assetRoot,
    icon,
    banner,
    splash,
    config: {
      applyEnabled: true,
      targetGuildId: guildId,
      expectedOwnerUserId: OWNER_ID,
      assetRoot,
      iconAsset: "icon.png",
      iconSha256: sha256(icon),
      bannerAsset: "banner.webp",
      bannerSha256: sha256(banner),
      splashAsset: "splash.png",
      splashSha256: sha256(splash)
    }
  };
}

test("FT profile target IDs and confirmations are fixed rather than environment-overridable", () => {
  assert.deepEqual(FT_COMMUNITY_PROFILE_ALLOWED_GUILD_IDS, [
    "1419335632324657306",
    "1520519015661961257"
  ]);
  assert.equal(FT_COMMUNITY_PRODUCTION_GUILD_ID, "1419335632324657306");
  assert.equal(FT_COMMUNITY_TEST_GUILD_ID, "1520519015661961257");
  assert.equal(
    ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID),
    `APPLY FT COMMUNITY PROFILE ${FT_COMMUNITY_PRODUCTION_GUILD_ID}`
  );
  assert.equal(ftCommunityProfileConfirmation("999"), null);

  const config = ftCommunityProfileConfigFromEnv({
    FT_COMMUNITY_PROFILE_SYNC_ENABLED: "true",
    FT_COMMUNITY_PROFILE_GUILD_ID: FT_COMMUNITY_PRODUCTION_GUILD_ID,
    FT_COMMUNITY_PRODUCTION_GUILD_ID: "999"
  });
  assert.equal(config.applyEnabled, true);
  assert.equal(config.targetGuildId, FT_COMMUNITY_PRODUCTION_GUILD_ID);
  assert.equal(Object.hasOwn(config, "productionGuildId"), false);
});

test("FT profile dry-run is redacted, exact-guild scoped and mutation free", async () => {
  const { client, calls } = clientFixture();
  const fixture = await assetFixture();
  try {
    const result = await applyFtCommunityProfileSync(client, {
      config: fixture.config,
      dryRun: true
    });
    assert.equal(result.applied, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.status.targetKind, "production");
    assert.equal(result.status.exactGuildScope, true);
    assert.equal(result.status.assetsReady, true);
    assert.equal(result.status.scopeReady, true);
    assert.equal(result.status.icon.format, "png");
    assert.equal(result.status.banner.format, "webp");
    assert.equal(result.status.splash.format, "png");
    assert.equal(result.status.requiredConfirmation, ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID));
    assert.equal(Object.hasOwn(result.status, "_private"), false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(fixture.assetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile rejects unallowlisted guilds even when a client cache entry exists", async () => {
  const unknownGuildId = "999999999999999999";
  const { client, calls } = clientFixture(unknownGuildId);
  const fixture = await assetFixture(unknownGuildId);
  try {
    const status = await inspectFtCommunityProfileSync(client, { config: fixture.config });
    assert.equal(status.targetKind, "untrusted");
    assert.equal(status.exactGuildScope, false);
    assert.equal(status.scopeReady, false);
    assert.equal(status.requiredConfirmation, null);
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: fixture.config,
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: "APPLY FT COMMUNITY PROFILE 999999999999999999"
        }
      }),
      { code: "guild_profile_confirmation_required" }
    );
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT test guild uses its separate exact target-bound confirmation", async () => {
  const { client, calls } = clientFixture(FT_COMMUNITY_TEST_GUILD_ID);
  const fixture = await assetFixture(FT_COMMUNITY_TEST_GUILD_ID);
  try {
    const result = await applyFtCommunityProfileSync(client, {
      config: fixture.config,
      dryRun: true
    });
    assert.equal(result.status.targetKind, "test");
    assert.equal(result.status.exactGuildScope, true);
    assert.equal(
      result.status.requiredConfirmation,
      `APPLY FT TEST PROFILE ${FT_COMMUNITY_TEST_GUILD_ID}`
    );
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile mutation requires verified owner, exact typed target confirmation and opt-in", async () => {
  const { client, calls } = clientFixture();
  const fixture = await assetFixture();
  try {
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: fixture.config,
        dryRun: false,
        authorization: { ownerVerified: false }
      }),
      { code: "owner_verification_required" }
    );
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: fixture.config,
        dryRun: false,
        authorization: { ownerVerified: true, actorUserId: OWNER_ID, confirmation: "YES" }
      }),
      { code: "guild_profile_confirmation_required" }
    );
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: { ...fixture.config, applyEnabled: false },
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID)
        }
      }),
      { code: "guild_profile_sync_disabled" }
    );
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile assets fail closed on traversal, spoofed format and digest mismatch", async t => {
  const { client } = clientFixture();
  const fixture = await assetFixture();
  try {
    await t.test("path traversal", async () => {
      const status = await inspectFtCommunityProfileSync(client, {
        config: { ...fixture.config, iconAsset: "../outside.png" }
      });
      assert.equal(status.icon.ready, false);
      assert.equal(status.icon.reason, "guild_profile_asset_outside_root");
      assert.equal(status.scopeReady, false);
    });

    await t.test("extension spoofing", async () => {
      await fs.writeFile(path.join(fixture.assetRoot, "spoof.png"), webpBytes("spoof"));
      const status = await inspectFtCommunityProfileSync(client, {
        config: {
          ...fixture.config,
          iconAsset: "spoof.png",
          iconSha256: sha256(webpBytes("spoof"))
        }
      });
      assert.equal(status.icon.ready, false);
      assert.equal(status.icon.reason, "guild_profile_asset_format_invalid");
    });

    await t.test("digest mismatch", async () => {
      const status = await inspectFtCommunityProfileSync(client, {
        config: { ...fixture.config, bannerSha256: "a".repeat(64) }
      });
      assert.equal(status.banner.ready, false);
      assert.equal(status.banner.reason, "guild_profile_asset_digest_mismatch");
    });

    await t.test("missing digest", async () => {
      const status = await inspectFtCommunityProfileSync(client, {
        config: { ...fixture.config, iconSha256: "" }
      });
      assert.equal(status.icon.ready, false);
      assert.equal(status.icon.reason, "guild_profile_asset_digest_required");
    });
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile icon/banner/invite splash apply once and are digest-idempotent", async () => {
  const { client, calls, readbackCalls } = clientFixture();
  const fixture = await assetFixture();
  const authorization = {
    ownerVerified: true,
    actorUserId: OWNER_ID,
    confirmation: ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID)
  };
  try {
    const first = await applyFtCommunityProfileSync(client, {
      config: fixture.config,
      dryRun: false,
      authorization
    });
    assert.equal(first.applied, true);
    assert.deepEqual(first.changes, ["guild_icon", "guild_banner", "guild_invite_splash"]);
    assert.deepEqual(calls.map(([kind]) => kind), ["icon", "banner", "splash"]);
    assert.equal(first.assetDigests.icon, fixture.config.iconSha256);
    assert.equal(first.assetDigests.banner, fixture.config.bannerSha256);
    assert.equal(first.assetDigests.splash, fixture.config.splashSha256);
    assert.equal(first.readback.fresh, true);
    assert.equal(first.readback.ready, true);
    assert.deepEqual(first.readback.checks, {
      exactGuild: true,
      exactOwner: true,
      iconPresent: true,
      bannerPresent: true,
      splashPresent: true,
      iconMatchesMutation: true,
      bannerMatchesMutation: true,
      splashMatchesMutation: true
    });
    assert.deepEqual(readbackCalls[0], {
      guild: FT_COMMUNITY_PRODUCTION_GUILD_ID,
      force: true,
      cache: false
    });

    calls.length = 0;
    const second = await applyFtCommunityProfileSync(client, {
      config: fixture.config,
      dryRun: false,
      authorization,
      previousAssetDigests: first.assetDigests
    });
    assert.equal(second.applied, false);
    assert.deepEqual(second.changes, []);
    assert.equal(second.readback.ready, true);
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile keeps invite splash optional without weakening configured splash checks", async () => {
  const fixture = await assetFixture();
  const authorization = {
    ownerVerified: true,
    actorUserId: OWNER_ID,
    confirmation: ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID)
  };
  try {
    const noSplashCalls = [];
    const guildWithoutSplashMethod = {
      id: FT_COMMUNITY_PRODUCTION_GUILD_ID,
      ownerId: OWNER_ID,
      icon: "existing-icon",
      banner: "existing-banner",
      async setIcon() {
        noSplashCalls.push("icon");
        this.icon = "updated-icon";
        return this;
      },
      async setBanner() {
        noSplashCalls.push("banner");
        this.banner = "updated-banner";
        return this;
      }
    };
    const client = {
      guilds: {
        cache: new Map([[FT_COMMUNITY_PRODUCTION_GUILD_ID, guildWithoutSplashMethod]]),
        async fetch() { return guildWithoutSplashMethod; }
      }
    };
    const config = withoutSplash(fixture.config);
    const status = await inspectFtCommunityProfileSync(client, { config });
    assert.equal(status.splash.configured, false);
    assert.equal(status.splash.ready, true);
    assert.equal(status.scopeReady, true);

    const result = await applyFtCommunityProfileSync(client, {
      config,
      dryRun: false,
      authorization
    });
    assert.deepEqual(result.changes, ["guild_icon", "guild_banner"]);
    assert.deepEqual(noSplashCalls, ["icon", "banner"]);

    const configuredSplashStatus = await inspectFtCommunityProfileSync(client, {
      config: fixture.config
    });
    assert.equal(configuredSplashStatus.splash.configured, true);
    assert.equal(configuredSplashStatus.splash.ready, true);
    assert.equal(configuredSplashStatus.mutationMethodsReady, false);
    assert.equal(configuredSplashStatus.scopeReady, false);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile apply fails closed when fresh Discord readback does not match the mutation", async () => {
  const { client, calls } = clientFixture();
  const fixture = await assetFixture();
  client.guilds.fetch = async () => ({
    id: FT_COMMUNITY_PRODUCTION_GUILD_ID,
    icon: "stale-icon",
    banner: "stale-banner",
    splash: "stale-splash"
  });
  try {
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: fixture.config,
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID)
        }
      }),
      { code: "guild_profile_readback_mismatch" }
    );
    assert.deepEqual(calls.map(([kind]) => kind), ["icon", "banner", "splash"]);
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("FT profile apply fails closed when fresh Discord owner binding drifts", async () => {
  const { client } = clientFixture();
  const fixture = await assetFixture();
  client.guilds.fetch = async () => ({
    id: FT_COMMUNITY_PRODUCTION_GUILD_ID,
    ownerId: "999999999999999999",
    icon: "updated-icon",
    banner: "updated-banner",
    splash: "updated-splash"
  });
  try {
    await assert.rejects(
      applyFtCommunityProfileSync(client, {
        config: fixture.config,
        dryRun: false,
        authorization: {
          ownerVerified: true,
          actorUserId: OWNER_ID,
          confirmation: ftCommunityProfileConfirmation(FT_COMMUNITY_PRODUCTION_GUILD_ID)
        }
      }),
      { code: "guild_profile_readback_mismatch" }
    );
  } finally {
    await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});
