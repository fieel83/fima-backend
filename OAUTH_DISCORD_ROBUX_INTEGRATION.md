# Fima OAuth, Discord Roles, and Manual Robux Flow

This backend keeps Stripe as the automatic card payment system and adds account linking plus manual Robux payment review.

## Public OAuth routes

- `GET /auth/discord/start`
- `GET /auth/discord/callback`
- `GET /auth/roblox/start`
- `GET /auth/roblox/callback`

Use these callback URLs in provider dashboards:

- Discord: `https://api.fimamacro.com/auth/discord/callback`
- Roblox: `https://fimamacro.com/auth/roblox/callback`

Discord can create or log in an account using the verified email from Discord. Roblox linking requires the user to already be logged in, then it attaches the Roblox identity to that Fima account. While the Roblox OAuth app is under review, the frontend callback page at `fimamacro.com` forwards the `code` and `state` to `POST https://api.fimamacro.com/auth/roblox/finish`; the `redirect_uri` used for both authorize and token exchange remains exactly `https://fimamacro.com/auth/roblox/callback`.

## Admin and role routes

- `GET /admin/health/bot`
- `POST /admin/roles/sync`
- `POST /admin/roles/give-buyer`
- `POST /admin/roles/remove-buyer`
- `POST /admin/roles/give-trial`
- `POST /admin/roles/remove-trial`

Role actions accept `discordUserId`, or a linked `userId` / `email`.

## Manual Robux payment routes

- `POST /payments/robux/manual/submit`
- `GET /admin/api/payments/robux/manual`
- `POST /admin/api/payments/robux/manual/:id/approve`
- `POST /admin/api/payments/robux/manual/:id/reject`

Submissions are stored as `payment_submissions`. Approval can grant the configured Discord buyer role when the user has a linked Discord account.

## Required environment variables

Keep all values in Render environment variables only:

- `SESSION_SECRET`
- `APP_ENCRYPTION_KEY`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_BUYER_ROLE_ID`
- `DISCORD_TRIAL_ROLE_ID`
- `DISCORD_LOG_CHANNEL_ID`
- `ROBLOX_CLIENT_ID`
- `ROBLOX_CLIENT_SECRET`
- `ROBLOX_REDIRECT_URI`
- `ROBLOX_OIDC_ISSUER`
- `OAUTH_COOKIE_DOMAIN`

If `APP_ENCRYPTION_KEY` is not set, OAuth access/refresh tokens are not stored. No secret values should be committed to the repo.
