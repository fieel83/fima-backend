# Changelog

## 2026-06-03

- Added `scripts/e2e-gift-license-flow.js` for end-to-end gift code, direct package and license validation matrix testing against a real backend/database session.
- Expanded admin license source labels for old buyer trials, Robux manual orders and legacy imports.
- Added `inactive`, buyer identity, bound HWID, last validation, and app message preview fields to license validation diagnostics.
- Upgraded Cloud Admin License Debug from a raw JSON-only output into a readable diagnostic summary with actions for opening the buyer/license, resetting HWID, re-enabling a key and adding notes.
- Expanded `POST /api/license/validate` diagnostics:
  - distinguishes `invalid_format`, `license_not_found`, `disabled`, `banned`, `canceled`, `payment_failed`, `expired`, `trial_expired`, `account_not_connected`, `discord_not_connected`, `roblox_not_connected`, `hwid_mismatch` and `server_error`
  - returns license source, status, plan label, product name, expiry/time-left, HWID binding state and account-link state
  - keeps first-use HWID binding on the backend as the source of truth
- Added protected admin dry-run validation endpoint:
  - `POST /admin/api/licenses/validate`
  - `POST /api/admin/licenses/validate`
  - does not bind HWID, useful for debugging website/gift/trial/manual keys
- Added Cloud Admin Manual Tools UI for License Debug with optional HWID and copyable JSON result.
- Added account-link enforcement to `POST /api/license/validate`:
  - cloud/website licenses require a matching Fima account
  - Discord must be connected
  - Roblox must be connected
  - backend returns clear `account_not_connected`, `discord_not_connected` and `roblox_not_connected` reasons
- Added Discord identity fields to admin license payloads so the desktop Admin Panel can show website buyer context.

## 2026-06-02

- Added gift checkout metadata support:
  - checkout accepts a selected registered gift recipient
  - Stripe metadata stores buyer and recipient ids
  - webhook fulfillment creates the license for the selected recipient account
  - admin license source now marks gift purchases as `Gift/Website`
- Kept the gift flow account-only and recipient-only, so licenses cannot be gifted to arbitrary unregistered emails.
- Added the referral / invite rewards database schema:
  - referral codes
  - referral records
  - referral rewards
  - referral abuse flags
- Added referral backend APIs:
  - `GET /api/referrals/me`
  - `POST /api/referrals/apply`
  - `GET /admin/api/referrals`
  - `POST /admin/api/referrals/:id/status`
- Added automatic referral verification after Discord and Roblox account linking.
- Added the 3 verified invites = 15 days reward rule.
- Added referral reward license creation or active license extension.
- Added admin referral review actions for approve, reject and flag.
- Added dashboard referral UI support for code, link, progress, recent invites and applying an invite code.
- Added register-page referral-code prefill from `?ref=...`.
- Added email verification tokens and dashboard verification APIs:
  - `POST /api/auth/email-verification/send`
  - `POST /api/auth/email-verification/confirm`
- Tightened referral validation so rewards require verified email + connected Discord + connected Roblox.
- Added referral re-evaluation after email verification completes.
