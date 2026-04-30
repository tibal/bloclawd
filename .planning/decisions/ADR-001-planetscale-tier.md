# ADR-001: PlanetScale Tier Confirmation

<!-- PHASE-2-GATE: Phase 2 plan-checker verifies `! grep -F TBD-USER` in this file. Until then, this skeleton is a Phase-1-complete artifact but a Phase-2 blocker. -->

**Status:** Pending user confirmation (skeleton committed; values land in Task 2 of phase 01-02; Task 2 is advisory for Phase 1 completion but blocking for Phase 2).
**Date proposed:** 2026-04-30
**Date confirmed:** TBD-USER
**Decider:** thibault.dalmon@cycliz.fr

## Context

PlanetScale's Hobby (free) tier was deprecated in March 2024 (see `.planning/research/PITFALLS.md` Pitfall #7). New databases must start on a paid plan. bloclawd's `events` table will be the only PlanetScale database in the project at v1; capacity needed is small (a few rows/sec write peak, modest storage).

D-21..D-23 in `.planning/phases/01-foundations/01-CONTEXT.md` require:
- This ADR exist before Phase 2 begins (grep gate on file existence in the plan-checker).
- A billing alert be configured before any production DB write.
- Verification of the alert is *manual user confirmation* at v1 -- no automated probe (deferred per CONTEXT.md "Deferred Ideas").

## Decision

| Field | Value |
|-------|-------|
| Tier name | TBD-USER (e.g., `Scaler`, `Scaler Pro`, ...) |
| Monthly base cost (USD) | TBD-USER |
| Billing alert threshold (USD) | TBD-USER |
| Alert recipient | thibault.dalmon@cycliz.fr |
| Alert configured (link or screenshot path) | TBD-USER (e.g., `.planning/decisions/assets/ADR-001-billing-alert.png`) |
| Date confirmed | TBD-USER (YYYY-MM-DD) |

## Consequences

- Phase 2 plan-checker greps for `.planning/decisions/ADR-001-planetscale-tier.md` (filename match) AND for the absence of `TBD-USER` in the resulting file before greenlighting any DB-write task.
- Future infra-cost ADRs (Hyperdrive, Workers Paid, custom-domain SSL, Apple Developer account, ...) follow this `ADR-NNN-<topic>.md` naming convention under `.planning/decisions/`.
- If actual PlanetScale spend exceeds the alert threshold, the alert fires to thibault.dalmon@cycliz.fr; we revisit budget here.

## Alternatives considered

- Cloudflare D1 (SQLite at edge): rejected -- PlanetScale is canonical per PROJECT.md.
- Self-hosted MySQL on a VM: rejected -- ops burden inconsistent with edge-only stack.
- Automated probe of the alert (PlanetScale API): rejected for v1 (deferred); manual confirmation is the v1 control.

## References

- `.planning/research/PITFALLS.md` Pitfall #7
- `.planning/phases/01-foundations/01-CONTEXT.md` D-21, D-22, D-23
- planetscale.com/pricing (canonical pricing page)
