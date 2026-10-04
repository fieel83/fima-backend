import crypto from "node:crypto";
// Shared, atomic fixed-window budgets. Account keys cover username/email aliases
// and survive restarts. They supplement the network limiter, never replace it.
export async function takeAccountAttempt({ client, scope, identity, limit, windowSeconds, now = new Date() }) {
  const key = crypto.createHash("sha256").update(`${scope}\0${identity}`).digest("hex");
  const until = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await client.$queryRaw`
    INSERT INTO "auth_rate_buckets" ("key", "attempts", "expires_at") VALUES (${key}, 1, ${until})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "auth_rate_buckets"."expires_at" <= ${now} THEN 1 ELSE "auth_rate_buckets"."attempts" + 1 END,
      "expires_at" = CASE WHEN "auth_rate_buckets"."expires_at" <= ${now} THEN ${until} ELSE "auth_rate_buckets"."expires_at" END
    RETURNING "attempts", "expires_at"`;
  return { attempts: rows[0].attempts, allowed: rows[0].attempts <= limit,
    retryAfter: Math.max(1, Math.ceil((rows[0].expires_at.getTime() - now.getTime()) / 1000)) };
}
