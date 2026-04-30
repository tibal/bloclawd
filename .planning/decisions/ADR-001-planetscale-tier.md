# ADR-001: PlanetScale Tier Confirmation

<!-- PHASE-2-GATE: Phase 2 plan-checker verifies this file has no unfilled placeholders. -->

**Status:** Accepted
**Date proposed:** 2026-04-30
**Date confirmed:** 2026-04-30
**Decider:** thibault.dalmon@cycliz.fr

## Context

PlanetScale's Hobby (free) tier was deprecated in March 2024 (see `.planning/research/PITFALLS.md` Pitfall #7). New databases must start on a paid plan. bloclawd's `events` table will be the only PlanetScale Postgres database in the project at v1; capacity needed is small (a few rows/sec write peak, modest storage).

D-21..D-23 in `.planning/phases/01-foundations/01-CONTEXT.md` require:
- This ADR exist before Phase 2 begins (grep gate on file existence in the plan-checker).
- A billing alert be configured before any production DB write.
- Verification of the alert is *manual user confirmation* at v1 -- no automated probe (deferred per CONTEXT.md "Deferred Ideas").

## Decision

| Field | Value |
|-------|-------|
| Tier name | PlanetScale Postgres `PS-5` (HA / highly available) |
| Monthly base cost (USD) | $15/month |
| Billing alert threshold (USD) | $25 |
| Alert recipient | thibault.dalmon@cycliz.fr |
| Alert configured (link or screenshot path) | User confirmation in Codex session on 2026-04-30; no screenshot saved |
| Date confirmed | 2026-04-30 |

## Consequences

- Phase 2 plan-checker greps for `.planning/decisions/ADR-001-planetscale-tier.md` (filename match) AND for the absence of unfilled placeholders before greenlighting any DB-write task.
- Phase 2 uses PlanetScale Postgres semantics: `pg`/node-postgres via Hyperdrive, `event_id UUID PRIMARY KEY`, `payload JSONB`, and `INSERT ... ON CONFLICT (event_id) DO NOTHING` for idempotency.
- Future infra-cost ADRs (Hyperdrive, Workers Paid, custom-domain SSL, Apple Developer account, ...) follow this `ADR-NNN-<topic>.md` naming convention under `.planning/decisions/`.
- If actual PlanetScale spend exceeds the alert threshold, the alert fires to thibault.dalmon@cycliz.fr; we revisit budget here.

## Alternatives considered

- Cloudflare D1 (SQLite at edge): rejected -- PlanetScale is canonical per PROJECT.md.
- Self-hosted Postgres on a VM: rejected -- ops burden inconsistent with edge-only stack.
- Automated probe of the alert (PlanetScale API): rejected for v1 (deferred); manual confirmation is the v1 control.

## References

- `.planning/research/PITFALLS.md` Pitfall #7
- `.planning/phases/01-foundations/01-CONTEXT.md` D-21, D-22, D-23
- PlanetScale Postgres pricing: `PS-5` single-node is $5/month; `PS-5` highly available is $15/month
- PlanetScale billing docs: spend email alerts are configured from the organization billing page
