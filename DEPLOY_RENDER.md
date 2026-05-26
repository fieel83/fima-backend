# Fima Macro API Render Deploy

Correct domains:

- Frontend: `https://fimamacro.com`
- API: `https://api.fimamacro.com`
- Stripe webhook: `https://api.fimamacro.com/api/webhooks/stripe`

## Render Service

Deploy this repository as a Node web service. If you keep these files inside a subfolder, set Render's root directory to that backend folder.

Build command:

```bash
npm install && npm run prisma:generate && npm run prisma:deploy
```

Start command:

```bash
npm start
```

Health check path:

```text
/health
```

## Required Environment Variables

Enter these in Render Environment settings. Keep secrets out of `/public`, GitHub, and frontend code.

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

Use Render PostgreSQL's Internal Database URL for `DATABASE_URL`.

## DNS

After Render deploys the web service, add `api.fimamacro.com` as a custom domain in the Render service settings. Render will show the exact target host.

IONOS DNS should be:

```text
Type: CNAME
Host: api
Value: <your-render-service>.onrender.com
```

Do not enable any separate proxy. Render provides HTTPS/TLS for the verified custom domain.

## Stripe Webhook

In Stripe test mode, create a webhook endpoint:

```text
https://api.fimamacro.com/api/webhooks/stripe
```

Event:

```text
checkout.session.completed
```

Copy the generated Stripe webhook signing secret into Render as `STRIPE_WEBHOOK_SECRET`.

## Test Checklist

1. `GET https://api.fimamacro.com/health`
2. `POST https://api.fimamacro.com/api/checkout/create-session`
3. Confirm Stripe Checkout URL is returned.
4. Pay with Stripe test card.
5. Confirm webhook creates order and license.
6. Confirm `https://fimamacro.com/success.html?session_id=...` shows the license key.
7. Validate license with `POST /api/license/validate`.
8. Confirm first HWID locks.
9. Confirm second HWID returns `hwid_mismatch`.
10. Open `https://api.fimamacro.com/admin`.
11. Test HWID reset and ban/unban.

Live mode is blocked until explicitly approved.
