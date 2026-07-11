# Paradise vNext Execution Matrix

Generated: 2026-07-11T20:41:31.850Z

This file is a readable view of `paradise-vnext-execution-matrix.json`. The JSON matrix is authoritative.

| ID | Priority | Milestone | Source | Local | Deploy | Live Discord | Dashboard/Browser | Next action |
|---|---|---|---|---|---|---|---|---|
| LIC-001 | P0 | Milestone 1 | DEPLOYED | LOCAL VERIFIED | DEPLOYED | SOURCE ONLY | BLOCKED | Reconnect owner browser; run masked paid-license scan and copy/reveal test without recording the key. |
| ENV-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Create the redacted staging/production readiness contract for ENV-002; do not widen the exact test-guild guard. |
| ENV-002 | P1 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Have the owner provision separate staging identities, then run the redacted readiness check before any staging deploy. |
| AUTH-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Run an owner-controlled OAuth guilds-scope browser test, then add a separately authorized customer guild config route; keep owner console routes owner-only. |
| AUTH-002 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Design after the shared guild authorization foundation is established. |
| CFG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Browser-test history and rollback preview in an owner session; keep actual rollback disabled until a verified backup and dual-write migration are available. |
| FLAG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild and verify the command registry canary enables there while its kill switch leaves production command behavior unchanged. |
| DB-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Run Prisma migration only in an isolated staging database, then dual-write a single safe guild config before any legacy-state migration. |
| DB-002 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Design additive Prisma migration after production count preview and backup validation are available. |
| BACKUP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Define encrypted backup storage and perform an authorized restore drill in staging before any production rebuild path can consume backups. |
| OPS-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Add a scheduled, rate-limited reconciliation job and dashboard health card after runtime channel/message existence checks are safe to run in staging. |
| CMD-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild, re-register scoped commands, then prove member /help and Community command denial without unregistering legacy commands. |
| RBAC-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy only to staging/test guild, then run Owner, Training Hoster, Trial Referee and normal-member persona proof against challenge controls without changing role assignments. |
| COMP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deploy and test the non-destructive availability refresh panel across a bot restart in the exact test guild; retain old panel compatibility during the migration window. |
| SETUP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | LIVE DISCORD VERIFIED | SOURCE ONLY | Rebase existing setup handlers on the registry and environment guard; preserve current test guild behavior. |
| DASH-001 | P0 | Milestone 1 | SOURCE ONLY | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | BLOCKED | Map existing dashboard APIs to guild-scope auth; defer visual polish until baseline save/reload works. |
| TEST-001 | P0 | Milestone 1 | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | LIVE DISCORD VERIFIED | SOURCE ONLY | Repeat only after Milestone 1 guard/component/RBAC changes; do not rebuild the lab for artifact-only work. |
| TPL-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until Milestone 1 setup foundation is stable. |
| NAMING-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Deferred until compact template foundation and owner branding decision. |
| LANG-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer after component/config foundation. |
| PANEL-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until component and language foundations are complete. |
| PROFILE-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until database migration preview is ready. |
| PROFILE-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until verified profile storage exists. |
| CHALLENGE-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer after profile/database foundation. |
| CHALLENGE-002 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until ticket and persisted leaderboard foundations exist. |
| SESSION-001 | P1 | Milestone 2 | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | LIVE DISCORD VERIFIED | SOURCE ONLY | Re-test only after component/RBAC upgrade; localize remaining English labels later. |
| TICKET-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until persisted state/component protocol are in place. |
| TICKET-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer after ticket state machine. |
| VOICE-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until component/persistence base. |
| APP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer after persistent component and DB foundation. |
| RESELL-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until billing/legal owner decision. |
| ROBUX-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until ticket transaction and owner policy. |
| LINEUP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until persisted board foundation. |
| XP-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until scheduler/persistence base. |
| EVENT-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until shared event state and components exist. |
| SOCIAL-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer pending provider selection and release policy. |
| AI-001 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until AI provider/consent owner decision. |
| AI-002 | P2 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until AI mode foundation. |
| SEC-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Defer until RBAC/log base is integrated. |
| LOG-001 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Create shared safe audit/log event envelope after config versioning. |
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
