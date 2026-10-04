import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits } from "discord.js";
import { loadFtCommunityReviewedAssetBindings } from "../src/ftCommunityDeploymentReadiness.js";
import { runFtCommunityProductionOrchestrator } from "../src/ftCommunityProductionOrchestrator.js";
import {
  FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
  finalizeFimaCommunityProductionRollbackFromReceipt
} from "../src/paradise3a59.js";

const FIMA_COMMUNITY_TEST_GUILD_ID = "1520519015661961257";
export const FT_COMMUNITY_PRODUCTION_CLI_CONFIRMATION = "APPLY FT COMMUNITY PRODUCTION";
export const FT_COMMUNITY_PRODUCTION_FINALIZE_CLI_CONFIRMATION = "FINALIZE FT COMMUNITY PRODUCTION";

const REVIEWED_PROFILE_ASSETS = Object.freeze([
  Object.freeze({
    id: "fima-bot-avatar",
    rootName: "FIMA_BOT_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord/v5",
    assetName: "FIMA_BOT_PROFILE_AVATAR_ASSET",
    asset: "fima-bot-avatar-v5.png",
    digestName: "FIMA_BOT_PROFILE_AVATAR_SHA256"
  }),
  Object.freeze({
    id: "fima-bot-profile-banner",
    rootName: "FIMA_BOT_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord/v5",
    assetName: "FIMA_BOT_PROFILE_BANNER_ASSET",
    asset: "fima-bot-profile-banner-v5.png",
    digestName: "FIMA_BOT_PROFILE_BANNER_SHA256"
  }),
  Object.freeze({
    id: "ft-community-server-icon",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_ICON_ASSET",
    asset: "v5/ft-community-server-icon-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_ICON_SHA256"
  }),
  Object.freeze({
    id: "ft-community-server-banner",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_BANNER_ASSET",
    asset: "v5/ft-community-server-banner-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_BANNER_SHA256"
  }),
  Object.freeze({
    id: "ft-community-invite-splash",
    rootName: "FT_COMMUNITY_PROFILE_ASSET_ROOT",
    root: "public/assets/images/discord",
    assetName: "FT_COMMUNITY_PROFILE_SPLASH_ASSET",
    asset: "v5/ft-community-invite-splash-v5.png",
    digestName: "FT_COMMUNITY_PROFILE_SPLASH_SHA256"
  })
]);

const REQUIRED_INTENTS = Object.freeze([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
]);

function safeCliFailure(code, phase = "client") {
  return Object.freeze({
    schemaVersion: 1,
    ok: false,
    code,
    phase,
    targetVerified: false,
    planOutcome: "not_consumed"
  });
}

function safeCliCloseFailure(priorResult) {
  const planOutcome = ["not_consumed", "executing_blocked", "failed", "completed"]
    .includes(priorResult?.planOutcome)
    ? priorResult.planOutcome
    : "not_consumed";
  return Object.freeze({
    schemaVersion: 1,
    ok: false,
    code: "ft_community_discord_client_close_failed",
    phase: "client_close",
    // Preserve only the orchestrator's bounded execution-state fields. This
    // keeps an already completed or possibly executed production mutation
    // visible to operators without forwarding arbitrary dependency output.
    targetVerified: priorResult?.targetVerified === true,
    planOutcome
  });
}

export function inspectFtCommunityProductionCliArming(argv = []) {
  const args = Array.isArray(argv) ? argv.map(value => String(value)) : [];
  const applyReady = args.length === 4
    && args[0] === "--target-guild"
    && args[1] === FIMA_COMMUNITY_PRODUCTION_GUILD_ID
    && args[2] === "--confirm"
    && args[3] === FT_COMMUNITY_PRODUCTION_CLI_CONFIRMATION;
  const finalizeReady = args.length === 5
    && args[0] === "--finalize-only"
    && args[1] === "--target-guild"
    && args[2] === FIMA_COMMUNITY_PRODUCTION_GUILD_ID
    && args[3] === "--confirm"
    && args[4] === FT_COMMUNITY_PRODUCTION_FINALIZE_CLI_CONFIRMATION;
  const ready = applyReady || finalizeReady;
  return Object.freeze({
    ready,
    mode: finalizeReady ? "finalize" : applyReady ? "apply" : null,
    code: ready
      ? "ft_community_production_cli_armed"
      : "ft_community_production_cli_target_confirmation_required"
  });
}

async function awaitDiscordClientReady(client, timeoutMs = 45_000) {
  if (client?.isReady?.() === true) return;
  if (typeof client?.once !== "function") {
    throw Object.assign(new Error("discord_client_ready_unavailable"), { code: "ft_community_discord_ready_unavailable" });
  }
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.off?.("clientReady", onReady);
      client.off?.("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(Object.assign(new Error("discord_client_ready_failed"), {
      code: "ft_community_discord_ready_failed"
    }));
    const timeout = setTimeout(() => finish(Object.assign(new Error("discord_client_ready_timeout"), {
      code: "ft_community_discord_ready_timeout"
    })), Math.max(1, Number(timeoutMs) || 45_000));
    timeout.unref?.();
    client.once("clientReady", onReady);
    client.once("error", onError);
    if (client.isReady?.() === true) onReady();
  });
  if (client.isReady?.() !== true) {
    throw Object.assign(new Error("discord_client_not_ready"), { code: "ft_community_discord_client_not_ready" });
  }
}

function exactId(value) {
  return String(value?.id || value || "").trim();
}

function randomRuntimeSecret() {
  return randomBytes(32).toString("hex");
}

async function deriveProductionRuntimeEnvironment(client, source) {
  const rehearsalSecret = String(source?.PARADISE_REHEARSAL_EVIDENCE_SECRET || "").trim();
  const planSecret = String(source?.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET || "");
  if (Buffer.byteLength(rehearsalSecret, "utf8") < 32) {
    throw Object.assign(new Error("rehearsal_evidence_secret_missing"), {
      code: "ft_community_rehearsal_evidence_secret_missing"
    });
  }
  if (Buffer.byteLength(planSecret, "utf8") < 32) {
    throw Object.assign(new Error("production_rebuild_plan_secret_missing"), {
      code: "ft_community_production_rebuild_plan_secret_missing"
    });
  }

  const guild = await client?.guilds?.fetch?.(FIMA_COMMUNITY_PRODUCTION_GUILD_ID);
  const guildId = exactId(guild);
  const ownerId = exactId(guild?.ownerId);
  const applicationId = exactId(client?.application?.id);
  const userId = exactId(client?.user?.id);
  if (guildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID || !ownerId
      || !applicationId || !userId || applicationId !== userId) {
    throw Object.assign(new Error("discord_runtime_binding_mismatch"), {
      code: "ft_community_discord_runtime_binding_mismatch"
    });
  }

  const reviewed = loadFtCommunityReviewedAssetBindings();
  const profileAssetEnvironment = {};
  for (const asset of REVIEWED_PROFILE_ASSETS) {
    const binding = reviewed?.[asset.id];
    if (binding?.ready !== true || !/^[a-f0-9]{64}$/u.test(String(binding.digest || ""))) {
      throw Object.assign(new Error("reviewed_asset_binding_missing"), {
        code: "ft_community_reviewed_asset_binding_missing"
      });
    }
    profileAssetEnvironment[asset.rootName] = asset.root;
    profileAssetEnvironment[asset.assetName] = asset.asset;
    profileAssetEnvironment[asset.digestName] = binding.digest;
  }

  return {
    ...source,
    DISCORD_BOT_TOKEN: "authenticated_in_memory",
    DISCORD_CLIENT_ID: applicationId,
    FIMA_OWNER_DISCORD_ID: ownerId,
    FIMA_OWNER_PROOF_SECRET: randomRuntimeSecret(),
    PARADISE_REHEARSAL_EVIDENCE_SECRET: rehearsalSecret,
    PARADISE_PRODUCTION_REBUILD_PLAN_SECRET: planSecret,
    FIEELS_COMMUNITY_GUILD_ID: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    DISCORD_GUILD_ID: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    FIMA_BOT_PROFILE_SYNC_ENABLED: "true",
    FIMA_BOT_EXPECTED_APPLICATION_ID: applicationId,
    FIMA_BOT_PROFILE_OWNER_USER_ID: ownerId,
    FIMA_BOT_PROFILE_GUILD_IDS: `${FIMA_COMMUNITY_PRODUCTION_GUILD_ID},${FIMA_COMMUNITY_TEST_GUILD_ID}`,
    FT_COMMUNITY_PROFILE_SYNC_ENABLED: "true",
    FT_COMMUNITY_PROFILE_GUILD_ID: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    FT_COMMUNITY_PROFILE_OWNER_USER_ID: ownerId,
    ...profileAssetEnvironment
  };
}

export async function runFtCommunityProductionFinalizationOnly({
  env = process.env,
  planRoot,
  finalize = finalizeFimaCommunityProductionRollbackFromReceipt
} = {}) {
  const secret = String(env?.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET || "");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    return safeCliFailure("ft_community_production_rebuild_plan_secret_missing", "finalization");
  }
  try {
    const result = await finalize({ secret, planRoot });
    if (result?.status !== "ok" || result?.rollbackFinalized !== true) {
      return safeCliFailure("ft_community_finalization_failed", "finalization");
    }
    return Object.freeze({
      schemaVersion: 1,
      ok: true,
      code: result.alreadyFinalized === true
        ? "ft_community_rollback_already_finalized"
        : "ft_community_rollback_finalized",
      phase: "rollback_finalize",
      targetVerified: true,
      planOutcome: "completed",
      rollbackFinalized: true,
      alreadyFinalized: result.alreadyFinalized === true
    });
  } catch {
    return safeCliFailure("ft_community_finalization_failed", "finalization");
  }
}

/**
 * Minimal one-shot client: no command registration, worker, timer or normal
 * bot startup path is reachable. The token remains in memory and is never
 * included in output or forwarded to the orchestrator.
 */
export async function runFtCommunityProductionCli({
  env = process.env,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  createClient = options => new Client(options),
  orchestrate = runFtCommunityProductionOrchestrator,
  finalizeOnly = runFtCommunityProductionFinalizationOnly,
  planRoot,
  clientReadyTimeoutMs = 45_000
} = {}) {
  let client = null;
  let result;
  try {
    const arming = inspectFtCommunityProductionCliArming(argv);
    const token = String(env?.DISCORD_BOT_TOKEN || "");
    if (!arming.ready) {
      result = safeCliFailure(arming.code, "target_confirmation");
    } else if (arming.mode === "finalize") {
      result = await finalizeOnly({ env, planRoot });
    } else if (Buffer.byteLength(String(env?.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET || ""), "utf8") < 32) {
      result = safeCliFailure("ft_community_production_rebuild_plan_secret_missing");
    } else if (!token) {
      result = safeCliFailure("ft_community_discord_token_missing");
    } else {
      client = createClient({ intents: [...REQUIRED_INTENTS] });
      await client.login(token);
      await awaitDiscordClientReady(client, clientReadyTimeoutMs);
      // Login already proves that a token was present and accepted. Do not
      // forward the raw credential to any orchestration dependency.
      const runtimeEnvironment = await deriveProductionRuntimeEnvironment(client, env);
      result = await orchestrate({
        client,
        env: runtimeEnvironment
      });
    }
  } catch (error) {
    const safeReadyCodes = new Set([
      "ft_community_discord_ready_unavailable",
      "ft_community_discord_ready_failed",
      "ft_community_discord_ready_timeout",
      "ft_community_discord_client_not_ready",
      "ft_community_rehearsal_evidence_secret_missing",
      "ft_community_production_rebuild_plan_secret_missing",
      "ft_community_discord_runtime_binding_mismatch",
      "ft_community_reviewed_asset_binding_missing"
    ]);
    result = safeCliFailure(
      safeReadyCodes.has(error?.code) ? error.code : "ft_community_production_cli_failed"
    );
  } finally {
    if (client) {
      try {
        await client.destroy();
      } catch {
        result = safeCliCloseFailure(result);
      }
    }
  }
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await runFtCommunityProductionCli();
  if (!result.ok) process.exitCode = 1;
}
