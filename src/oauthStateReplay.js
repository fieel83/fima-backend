import { createHash } from "node:crypto";

const PREFIX = "oauth_state_consumed:v1:";
const MAX_REMAINING_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PROVIDERS = new Set(["google", "discord", "roblox"]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/** Call only after signature, cookie binding and provider validation succeed.
 * The unique Setting key is the cross-process atomic claim; no provider token,
 * raw state, identity or session is retained. A failed exchange stays consumed.
 */
export async function consumeOAuthState(prisma, { provider, state, expiresAt }, now = Date.now()) {
  if (!PROVIDERS.has(provider) || typeof state !== "string" || !state || state.length > 16384) {
    throw failure("invalid_oauth_state");
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_REMAINING_MS) {
    throw failure("expired_oauth_state");
  }
  const digest = createHash("sha256").update(state).digest("hex");
  try {
    await prisma.setting.create({
      data: { key: `${PREFIX}${provider}:${digest}`, value: { expiresAt, consumedAt: now } }
    });
  } catch (error) {
    if (error?.code === "P2002") throw failure("duplicate_oauth_callback");
    // Do not fall back to a process-local cache when the shared store fails.
    throw failure("oauth_state_store_unavailable");
  }
}

/** Optional maintenance; keep tombstones far longer than the accepted state TTL.
 * Database updatedAt is used so untrusted JSON cannot cause premature deletion.
 */
export async function pruneConsumedOAuthStates(prisma, now = Date.now()) {
  return prisma.setting.deleteMany({
    where: { key: { startsWith: PREFIX }, updatedAt: { lt: new Date(now - RETENTION_MS) } }
  });
}
