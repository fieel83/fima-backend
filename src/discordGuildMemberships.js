import { createHash } from "node:crypto";

// Share concurrent dashboard checks without caching authorization results.
export function createDiscordGuildMembershipFetcher({ fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const pending = new Map();
  return async function fetchGuildMemberships(accessToken) {
    const key = createHash("sha256").update(accessToken).digest("hex");
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
          headers: { authorization: `Bearer ${accessToken}` }
        }, 8000);
        if (response.ok) {
          const guilds = await response.json();
          return Array.isArray(guilds) ? guilds.filter(guild => guild?.id) : [];
        }
        if (response.status === 429 && attempt === 0) {
          const body = await response.json().catch(() => ({}));
          const retrySeconds = Number(response.headers?.get("retry-after") || body.retry_after);
          if (Number.isFinite(retrySeconds) && retrySeconds >= 0 && retrySeconds <= 10) {
            await sleep(Math.ceil(retrySeconds * 1000) + 50);
            continue;
          }
        }
        const error = new Error(`discord_guilds_failed_${response.status}`);
        error.code = response.status === 401 || response.status === 403 ? "discord_reauthorization_required" : "discord_guilds_unavailable";
        throw error;
      }
    })();
    pending.set(key, request);
    try { return await request; }
    finally { if (pending.get(key) === request) pending.delete(key); }
  };
}
