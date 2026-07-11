# Paradise vNext Execution Matrix

Generated: 2026-07-11T15:22:13.066Z

This file is a readable view of `paradise-vnext-execution-matrix.json`. The JSON matrix is authoritative.

| ID | Priority | Milestone | Source | Local | Deploy | Live Discord | Dashboard/Browser | Next action |
|---|---|---|---|---|---|---|---|---|
| LIC-001 | P0 | Milestone 1 | DEPLOYED | LOCAL VERIFIED | DEPLOYED | SOURCE ONLY | BLOCKED | Reconnect owner browser; run masked paid-license scan and copy/reveal test without recording the key. |
| ENV-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Create the redacted staging/production readiness contract for ENV-002; do not widen the exact test-guild guard. |
| ENV-002 | P1 | Milestone 1 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Create redacted environment readiness contract after ENV-001 is integrated. |
| AUTH-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Integrate workspace access into customer-facing server selector/config APIs after the existing owner-only endpoint split is mapped. |
| AUTH-002 | P1 | Milestone 2 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Design after the shared guild authorization foundation is established. |
| CFG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Add authorized config-version history reading and rollback preview before exposing rollback actions. |
| FLAG-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Persist flags through the versioned guild configuration envelope after CFG-001 is integrated. |
| DB-001 | P0 | Milestone 1 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Inventory existing Setting JSON state and prepare additive migration preview; do not migrate production data yet. |
| DB-002 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Design additive Prisma migration after production count preview and backup validation are available. |
| BACKUP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Add restore dry-run validation and encrypted storage policy before any destructive rebuild path can consume backups. |
| OPS-001 | P0 | Milestone 1 | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Implement read-only reconciliation result builder for state/config records. |
| CMD-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Map existing slash command builders, help rendering and handlers to this registry incrementally without unregistering commands prematurely. |
| RBAC-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Map current Discord role IDs and existing staff checks to this vocabulary without changing role assignments. |
| COMP-001 | P0 | Milestone 1 | LOCAL VERIFIED | LOCAL VERIFIED | SOURCE ONLY | SOURCE ONLY | SOURCE ONLY | Migrate one non-destructive component family in the test guild and retain old-family repair messaging during the compatibility window. |
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
