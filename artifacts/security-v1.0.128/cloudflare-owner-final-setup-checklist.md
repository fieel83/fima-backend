# Cloudflare Owner Final Setup Checklist

Status: owner action required. Codex verified Cloudflare proxy previously, but WAF, Turnstile, Access, and edge rate-limit configuration are not verifiable from this environment without Cloudflare credentials.

## Proxy And TLS

- Confirm `fimamacro.com` and `www.fimamacro.com` are orange-cloud proxied.
- Confirm HTTPS works for website and API routes.
- Confirm desktop app API traffic to `https://api.fimamacro.com` still works.
- Confirm Stripe webhook, Discord OAuth, and Roblox OAuth callback paths are not blocked.

## Managed WAF

- Enable Cloudflare Managed Rules.
- Enable Cloudflare OWASP Core Ruleset in a balanced or default mode first.
- Watch logs for false positives before increasing sensitivity.

## Custom WAF Rules

Create managed challenge or block rules for suspicious traffic on:

- `/admin/*`
- `/api/admin/*`
- `/api/gift/*`
- `/api/license/validate`
- `/api/license/refresh-entitlement`
- `/api/downloads/*`
- `/auth/*`
- `/api/payments/*`
- `/api/trial/*`
- `/api/referral/*`

Do not block:

- Stripe webhook requests that pass backend signature verification.
- Discord/Roblox OAuth callbacks with valid state.
- Normal desktop app validation and entitlement refresh traffic.

## Edge Rate Limits

Configure conservative rate limits for:

- login
- register
- password reset
- admin login
- license validation
- entitlement refresh
- gift redeem
- download token generation
- referral/trial claim
- checkout creation
- OAuth callback abuse

## Turnstile

Add Turnstile frontend widget and backend token verification for:

- login
- register
- password reset
- gift redeem
- admin login
- trial claim
- referral claim

Frontend-only Turnstile is not enough; backend must verify with `TURNSTILE_SECRET_KEY`.

## Cloudflare Access

- Put `/admin/*` behind Cloudflare Access if possible.
- Allow only owner/admin emails.
- Keep backend admin login and RBAC enabled; do not rely on Cloudflare Access alone.

## Origin Bypass Protection

- Prefer blocking direct Render origin access for admin routes.
- If adding a Cloudflare origin secret header, apply it only to sensitive web/admin routes so desktop app API traffic is not broken.
- Never expose Render deploy hooks or API keys in frontend code.
