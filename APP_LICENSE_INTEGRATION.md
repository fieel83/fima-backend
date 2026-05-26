# Fima Macro App License Integration

This document explains how the Fima Macro Windows app should connect to the Fima Macro license backend.

## API Base

Production API:

```text
https://api.fimamacro.com
```

Validation endpoint:

```text
POST https://api.fimamacro.com/api/license/validate
```

## First App Launch

1. Ask the user for a license key.
2. Normalize the input visually as `FIMA-XXXX-XXXX-XXXX-XXXX`.
3. Generate the current device HWID.
4. Send the license key, HWID, and app version to the backend.
5. If valid, open the app and cache a small local license state.
6. If invalid, show the backend message and keep the user on the license screen.

## HWID Guidance

Use a stable device identifier that does not expose raw private hardware data when possible.

Recommended approach:

- Build a device fingerprint from stable Windows identifiers.
- Hash it locally with SHA-256.
- Send only the hash-like HWID string to the backend.
- Keep it stable across app updates.

Do not include user names, local file paths, emails, or other unnecessary personal data in the HWID.

## Validate Request

```json
{
  "licenseKey": "FIMA-XXXX-XXXX-XXXX-XXXX",
  "hwid": "USER_HWID_HASH",
  "appVersion": "1.0.0"
}
```

## Valid Response

```json
{
  "valid": true,
  "licenseKey": "FIMA-XXXX-XXXX-XXXX-XXXX",
  "plan": "1month",
  "expiresAt": "2026-06-26T00:00:00.000Z",
  "lifetime": false,
  "message": "License valid"
}
```

When `lifetime` is true, `expiresAt` can be null and the app should treat the license as never expiring unless the backend later returns banned or inactive.

## Invalid Responses

Show the user clear messages:

| reason | App message |
| --- | --- |
| `invalid` | Invalid license key. |
| `expired` | Your license has expired. Renew your plan to continue. |
| `banned` | This license has been banned. Contact support if this is a mistake. |
| `inactive` | This license is inactive. Contact support. |
| `hwid_mismatch` | This license is already used on another device. Request an HWID reset from support. |
| `server_error` | The license server could not validate right now. Try again shortly. |

## First HWID Lock

If a license has no HWID yet, the first successful validation locks it to the HWID in that request.

After that:

- Same HWID: valid if status and expiry allow it.
- Different HWID: `hwid_mismatch`.
- Admin can reset HWID from the admin panel.
- After reset, the next successful validation locks the license again.

## Local Cache

Cache only enough data to make the app smoother:

- license key
- plan
- expiry
- lifetime flag
- last successful validation timestamp

If the license key is stored locally in plaintext, a user or malware can read it. Prefer OS-protected storage such as Windows Credential Manager or DPAPI. If plaintext storage is unavoidable, treat it as convenience only and always revalidate online.

## Offline Mode

Recommended default: online validation required.

If offline mode is added later:

- Allow only a short grace period after a successful validation.
- Store the last validation timestamp.
- Never extend access beyond `expiresAt`.
- Do not allow offline access after banned, inactive, or HWID mismatch responses.
- Force a fresh validation after app updates or suspicious local state changes.

## App Startup Flow

```text
Open app
  -> read saved license key if present
  -> generate HWID
  -> POST /api/license/validate
  -> valid: open app
  -> expired: show expired screen
  -> banned/inactive: block app and show support message
  -> hwid_mismatch: show HWID reset instructions
  -> server_error/network: retry or show temporary server message
```

## Download Flow

Users download Fima Macro from the success/license page after checkout. The website calls:

```text
GET https://api.fimamacro.com/api/download?licenseKey=FIMA-....
```

The backend checks the license status and expiry, then returns the current download URL from `latest.json` or the configured fallback.

## Security Notes

- Do not embed API secrets in the Windows app.
- Do not trust client-side plan or expiry data.
- Treat the backend validation response as the source of truth.
- Rate-limit retry loops in the app.
- Send only minimal data: license key, HWID, app version.
- Never log full license keys in crash reports unless the user explicitly submits them for support.
