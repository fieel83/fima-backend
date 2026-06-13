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
/healthz
```

## Required Environment Variables

Enter these in Render Environment settings. Keep secrets out of `/public`, GitHub, and frontend code.

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

Use Render PostgreSQL's Internal Database URL for `DATABASE_URL`.

The Free 1-Day Trial is not a Stripe Checkout product and must not use `STRIPE_PRICE_1DAY`. Legacy packages such as 15 Days, old one-time 1 Month, and 3 Months are not public checkout products and their old price or sale envs are not required.

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

In Stripe live mode, create a webhook endpoint:

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
4. In live mode, do not expect Stripe test card `4242` to work.
5. Confirm webhook creates order and license.
6. Confirm `https://fimamacro.com/success.html?session_id=...` shows the license key.
7. Confirm success page download calls `GET /api/download?licenseKey=...`.
8. Validate license with `POST /api/license/validate`.
9. Confirm first HWID locks.
10. Confirm second HWID returns `hwid_mismatch`.
11. Open `https://api.fimamacro.com/admin`.
12. Test HWID reset and ban/unban.

Live mode depends on Render `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and only these public live price envs: `STRIPE_PRICE_3DAYS`, `STRIPE_PRICE_MONTHLY`, and `STRIPE_PRICE_LIFETIME`. Production/live checkout must use Stripe Price IDs; inline `price_data` fallback is blocked.
