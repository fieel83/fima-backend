# Fima Macro Payments API

Node.js + Express + PostgreSQL + Prisma backend for:

- Stripe Checkout one-time payments
- Automatic license generation
- License validation with first-HWID lock
- Stripe webhook fulfillment
- Admin license panel

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

## Stripe Test Mode

Use test mode only. Put the Stripe test secret key in `.env` as `STRIPE_SECRET_KEY`, then run:

```powershell
npm run stripe:setup
```

The script creates/reuses four one-time USD Prices and prints:

```text
STRIPE_PRICE_2WEEKS=price_...
STRIPE_PRICE_1MONTH=price_...
STRIPE_PRICE_3MONTHS=price_...
STRIPE_PRICE_LIFETIME=price_...
```

Copy those values into `.env`.

Live Stripe keys are refused by the backend until live mode is explicitly approved later. Never paste Stripe keys into frontend files or public hosting.

## Required Environment

```text
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_2WEEKS=price_1TbIcpHluwdGuEsNKes35HgO
STRIPE_PRICE_1MONTH=price_1TbIcqHluwdGuEsNYqyfBuRo
STRIPE_PRICE_3MONTHS=price_1TbIcrHluwdGuEsNqGZwCIkt
STRIPE_PRICE_LIFETIME=price_1TbIcsHluwdGuEsNpFGJYSXV
ADMIN_PASSWORD=
FRONTEND_URL=https://fimamacro.com
API_BASE_URL=https://api.fimamacro.com
```

## API

### `POST /api/checkout/create-session`

Creates a Stripe Checkout Session.

```json
{
  "plan": "1month",
  "customerEmail": "user@example.com",
  "currency": "USD",
  "language": "en"
}
```

Returns:

```json
{ "url": "https://checkout.stripe.com/..." }
```

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

## Admin Panel

Open:

```text
https://api.fimamacro.com/admin
```

Features:

- list and search licenses
- filter by plan/status
- manual license creation
- extend license
- ban/unban via status
- reset HWID
- view recent orders

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
