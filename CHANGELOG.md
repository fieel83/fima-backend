# Changelog

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
