# Paradise vNext Execution Matrix

Generated: 2026-07-12T09:46:42.062Z

This file is a readable view of `paradise-vnext-execution-matrix.json`. The JSON matrix is authoritative.

## Current status summary

- Total accepted requirements: 47
- SOURCE ONLY: 17
- LOCAL VERIFIED: 29
- DEPLOYED: 1
- LIVE DISCORD VERIFIED: 1
- DASHBOARD VERIFIED: 0
- BLOCKED rows: 25
- FAILED rows: 0

| ID | Priority | Milestone | Source | Local | Deploy | Live Discord | Dashboard/Browser | Next action |
|---|---|---|---|---|---|---|---|---|
| LIC-001 | P0 | Milestone 1 | DEPLOYED | LOCAL VERIFIED | DEPLOYED | SOURCE ONLY | BLOCKED | Reconnect owner browser; run masked paid-license scan and copy/reveal test without recording the key. |
| ENV-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Create the redacted staging/production readiness contract for ENV-002; do not widen the exact test-guild guard. |
| ENV-002 | P1 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Have the owner provision separate staging identities, then run the redacted readiness check before any staging deploy. |
| AUTH-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Run an owner-controlled OAuth guilds-scope browser test, then add a separately authorized customer guild config route; keep owner console routes owner-only. |
| AUTH-002 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Run a real authorized browser OAuth callback in staging, then verify single-use state rejection, CSRF retry, session revocation and guild-scope denial without retaining provider tokens in browser artifacts. |
| CFG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Browser-test history and rollback preview in an owner session; keep actual rollback disabled until a verified backup and dual-write migration are available. |
| FLAG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild and verify the command registry canary enables there while its kill switch leaves production command behavior unchanged. |
| DB-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Run Prisma migration only in an isolated staging database, then dual-write a single safe guild config before any legacy-state migration. |
| DB-002 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Design additive Prisma migration after production count preview and backup validation are available. |
| BACKUP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Define encrypted backup storage and perform an authorized restore drill in staging before any production rebuild path can consume backups. |
| OPS-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; verify one scheduled run stores the safe summary and that a production guild cannot enable this canary. |
| CMD-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild, re-register scoped commands, then prove member /help and Community command denial without unregistering legacy commands. |
| RBAC-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild, then run Owner, Training Hoster, Trial Referee and normal-member persona proof against challenge controls without changing role assignments. |
| COMP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy and test the non-destructive availability refresh panel across a bot restart in the exact test guild; retain old panel compatibility during the migration window. |
| SETUP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; prove preview, create-missing, idempotent rerun and a production-guild guard denial using the current compact schema. |
| DASH-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | BLOCKED | Use an authorized customer browser session to verify save, reload, CSRF refresh/retry and responsive server switching; do not call local API tests dashboard proof. |
| TEST-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy current code only to the exact test guild, then record guard denial, restart and no-duplicate proof; do not rebuild the lab for artifact-only work. |
| TPL-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild, install each compact template, verify channel type/count/mapping/role visibility, and capture no-duplicate repair proof before any production migration preview. |
| NAMING-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deferred until compact template foundation and owner branding decision. |
| LANG-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild, switch the guild language, and verify each stored guide/panel edits in place while personal help remains ephemeral. |
| PANEL-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild, delete one canonical handbook, run repair, then verify the replacement is pinned and no duplicate remains. |
| PROFILE-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; verify a duplicate Roblox identity denial, per-guild completion/privacy behavior and profile lookup by user/profile ID/Roblox name. |
| PROFILE-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until verified profile storage exists. |
| CHALLENGE-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild and verify Top 10/20/30 message IDs edit in place, with no raw IDs or default public notes. |
| CHALLENGE-002 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild and verify Referee/Trial Referee/Experienced Referee approval boundaries, co-ref display, transcript and edit-in-place result update. |
| SESSION-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; create Turkish and English training/tryout posts, press Lock/Unlock/End as authorized and unauthorized personas, then verify reply placement and no active-session footer. |
| TICKET-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; prove Claim → Close → Reopen → Close → typed Delete and transcript-failure channel preservation with staff and member personas. |
| TICKET-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Template ticket categories and lifecycle naming are local; keep the dedicated cross-guild appeal bridge disabled until the owner explicitly chooses it, then add its isolated audit/visibility tests. |
| VOICE-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; verify Join to Create, Community Voice and AFK are GuildVoice, then test move, control panel, empty cleanup and wrong-type repair preview. |
| APP-001 | P2 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to isolated staging/the exact test guild; prove multi-step Continue/Cancel, duplicate denial, More Info follow-up, approval/role grant and website-to-review-queue delivery without testing against a production guild. |
| RESELL-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until billing/legal owner decision. |
| ROBUX-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until ticket transaction and owner policy. |
| LINEUP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Main/War lineup, roster, relations and the canonical pinned mainer notice are local. Implement the remaining safe War/Spar ticket/result state with audit before this combined requirement can be LOCAL VERIFIED. |
| XP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until scheduler/persistence base. |
| EVENT-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until shared event state and components exist. |
| SOCIAL-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer pending provider selection and release policy. |
| AI-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until AI provider/consent owner decision. |
| AI-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until AI mode foundation. |
| SEC-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild and verify member/moderator/senior personas for invite blocking, risky attachment quarantine, case review, purge bounds and channel lock/hide without any automatic ban. |
| LOG-001 | P1 | Milestone 2 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to the exact test guild, verify a sensitive ticket/payment-style log is redacted, manager/owner visibility is enforced and expired local log metadata is removed without deleting transcript records. |
| BLACKLIST-001 | P2 | Milestone 2 | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | LIVE DISCORD VERIFIED | SOURCE ONLY | Re-test after RBAC migration; preserve known behavior. |
| WEB-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until command registry and dashboard auth are reliable. |
| BILLING-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Blocked pending owner legal/tax and product activation decision. |
| LEGAL-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer pending owner legal policy decision. |
| OPS-002 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until environment and backup foundation pass. |
| MIGRATE-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deferred until compact templates and backup integrity are complete. |
| FIMAAPP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Do not mix into Milestone 1; later read-only reference intake from owner-provided Fima assets. |

## Milestone 1 frozen scope

- LIC-001
- ENV-001
- ENV-002
- AUTH-001
- CFG-001
- FLAG-001
- DB-001
- DB-002
- BACKUP-001
- OPS-001
- CMD-001
- RBAC-001
- COMP-001
- SETUP-001
- DASH-001
- TEST-001

## Blocking owner decisions



## Progress rule

Before work, read the JSON matrix, select the oldest incomplete unblocked dependency in Milestone 1, update the same row and avoid duplicate proof artifacts.
