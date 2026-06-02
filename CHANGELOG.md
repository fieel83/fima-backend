# Changelog

## 2026-06-02

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

