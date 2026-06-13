# Fima Macro Payments API

Node.js + Express + PostgreSQL + Prisma backend for:

- Stripe Checkout one-time payments
- Automatic license generation
- License validation with first-HWID lock
- Licensed downloads from the success page
- Stripe webhook fulfillment
- Premium admin panel for sales, licenses, downloads, settings, analytics and audit logs

No Stripe secret, webhook secret, database URL, or admin password belongs in `/public`.

## Local Setup

```powershell
copy .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Set `DATABASE_URL` to PostgreSQL before running migrations.

Security envs for v1.0.128 entitlement enforcement:

- `ENTITLEMENT_SIGNING_SECRET` (32+ random chars, backend only)
- `DOWNLOAD_SIGNING_SECRET` (32+ random chars, backend only)
- `UPDATE_MANIFEST_SIGNING_SECRET` (32+ random chars, backend only)
- `ADMIN_SESSION_VERSION` or `ADMIN_SESSION_REVOKED_BEFORE` (bump to invalidate old entitlement/admin sessions)
- `MIN_SUPPORTED_APP_VERSION=1.0.128` only after the hardened app release is live

Never place these values in public website files, app binaries, `latest.json`, logs, screenshots, or artifacts.

## Stripe Price Setup

Put the Stripe secret/restricted key in `.env` as `STRIPE_SECRET_KEY`, then run:

```powershell
npm run stripe:setup
```

The script creates/reuses the current paid public Prices and prints the env names to copy:

```text
STRIPE_PRICE_3DAYS=price_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_LIFETIME=price_...
```

Copy those values into `.env`.

The Free 1-Day Trial is license-only and is not a Stripe Checkout product. Legacy packages such as 15 Days, old one-time 1 Month, and 3 Months remain readable for existing licenses but are not public checkout products and are not required public Stripe envs.
When the setup script is run with a test Stripe key, or with `STRIPE_SETUP_ENV_SCOPE=test`, it prints the separate `STRIPE_TEST_PRICE_3DAYS`, `STRIPE_TEST_PRICE_MONTHLY`, and `STRIPE_TEST_PRICE_LIFETIME` names instead.

Live Stripe mode is controlled by the deployed environment variables. Never paste Stripe keys into frontend files or public hosting.

## Required Environment

```text
DATABASE_URL=
STRIPE_MODE=auto
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_3DAYS=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_LIFETIME=
STRIPE_TEST_PRICE_3DAYS=
STRIPE_TEST_PRICE_MONTHLY=
STRIPE_TEST_PRICE_LIFETIME=
ADMIN_PASSWORD=
FRONTEND_URL=https://fimamacro.com
API_BASE_URL=https://api.fimamacro.com
DISCORD_INVITE_URL=
SUPPORT_EMAIL=support@fimamacro.com
DOWNLOAD_MANIFEST_URL=https://fimamacro.com/latest.json
DOWNLOAD_FALLBACK_URL=https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.127/FIMA.MACRO.Setup.exe
CORS_ORIGINS=https://fimamacro.com,https://www.fimamacro.com
```

## API

### `POST /api/checkout/create-session`

Creates a Stripe Checkout Session.

```json
{
  "plan": "monthly",
  "customerEmail": "user@example.com",
  "currency": "EUR",
  "language": "en"
}
```

Returns:

```json
{ "url": "https://checkout.stripe.com/...", "mode": "live", "checkoutSessionPrefix": "cs_live" }
```

The response and server logs expose only Stripe mode/prefix diagnostics, never secret values. Public checkout accepts only `3days`, `monthly`, and `lifetime`. In production or live Stripe mode, checkout must use configured Stripe Price IDs and will not fall back to inline EUR `price_data`; the inline fallback is local/dev-only safety.

### `POST /api/webhooks/stripe`

Stripe webhook endpoint. Listen for:

- `checkout.session.completed`

Webhook signature verification is required.

### `GET /api/checkout/result?session_id=...`

Returns the generated license, or `processing` while the webhook is still catching up.

### `POST /api/license/validate`

```json
{
  "licenseKey": "FIMA-XXXX-XXXX-XXXX-XXXX",
  "hwid": "USER_HWID",
  "appVersion": "1.0.0"
}
```

The first successful validation locks the license to the provided HWID.

### `GET /api/download?licenseKey=FIMA-...`

Checks the license status, expiry and ban state, logs the download attempt, and returns the latest installer URL.

```json
{
  "success": true,
  "downloadUrl": "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.127/FIMA.MACRO.Setup.exe",
  "version": "1.0.0"
}
```

The endpoint reads `DOWNLOAD_MANIFEST_URL` first, then falls back to `DOWNLOAD_FALLBACK_URL`.

### `GET /api/public/site-settings`

Returns public, non-secret site settings such as Discord invite URL, support email, maintenance state and checkout/download switches.

## Admin Panel

Open:

```text
https://api.fimamacro.com/admin
```

Features:

- dashboard revenue and system health cards
- orders with Stripe IDs, plan, amount, mode and linked license
- licenses with HWID, validation/download counts and admin actions
- customers with spend/order history
- downloads / versions view from `latest.json`
- site settings for Discord, support email and checkout/download switches
- coupons / discounts preparation
- analytics, webhook logs and audit logs
- manual license creation, extend, ban/unban and HWID reset

There is no delete action by design.

## Deployment Recommendation

Use Render first because it gives managed PostgreSQL, HTTPS, logs, and environment variable management quickly. A step-by-step checklist is in `DEPLOY_RENDER.md`.

Add a DNS CNAME:

```text
api.fimamacro.com -> your backend host
```

After deploy:

1. Run Prisma migrations.
2. Run `npm run stripe:setup` in test mode or set Price IDs manually.
3. Create Stripe webhook URL:
   `https://api.fimamacro.com/api/webhooks/stripe`
4. Copy webhook signing secret into backend `.env`.
5. Test with Stripe test card `4242 4242 4242 4242`.

Do not switch to live mode until explicitly approved.
