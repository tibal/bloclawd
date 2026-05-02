---
phase: 04-aggregation-dashboard
plan: 02
subsystem: database
tags: [postgres, migrations, cron-state, r2-ops]

requires:
  - phase: 04-01
    provides: LimitType shared type, aggregation constants, and Phase 4 wire-contract groundwork
provides:
  - Strict cron_state work-queue migration for AGGR-17 and AGGR-18
  - Strict events.limit_type migration for D-84 and D-86
  - Worker operator README steps for Phase 4 migrations, R2 buckets, and Workers Paid plan
affects: [cron-state, worker-event-amendment, cli-fixture-regen, cron-r2, cron-deploy]

tech-stack:
  added: []
  patterns: [strict-manual-sql-migrations, text-check-state, per-env-operator-runbook]

key-files:
  created:
    - apps/worker/sql/0003_cron_state.sql
    - apps/worker/sql/0004_add_limit_type.sql
    - .planning/phases/04-aggregation-dashboard/04-02-SUMMARY.md
  modified:
    - apps/worker/README.md

key-decisions:
  - "cron_state.state uses TEXT plus a CHECK constraint, not a Postgres ENUM, to avoid Hyperdrive prepared-statement enum lookup pitfalls."
  - "0004_add_limit_type.sql uses TEXT NOT NULL without DEFAULT, matching the Phase 3 0002 strict ALTER TABLE precedent."
  - "README documents staging TRUNCATE before 0004 and one-time R2 bucket provisioning before first cron deploy."

patterns-established:
  - "Phase 4 SQL migrations keep file-path headers, per-env psql lines, and fail-loud strictness."
  - "Operator-only Cloudflare resources are documented next to worker deploy instructions."

requirements-completed: [AGGR-17, AGGR-18]

duration: 3min
completed: 2026-05-02
---

# Phase 04 Plan 02: SQL Migrations Summary

**Strict Postgres migrations for cron work-queue state and limit_type storage, with operator notes for R2 and cron deploy readiness**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-02T18:23:17Z
- **Completed:** 2026-05-02T18:26:01Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `apps/worker/sql/0003_cron_state.sql` with the `cron_state` work-queue table, composite PK, TEXT+CHECK state guard, and unprocessed partial index.
- Added `apps/worker/sql/0004_add_limit_type.sql` with a strict `events.limit_type TEXT NOT NULL` migration.
- Extended `apps/worker/README.md` with per-env 0003/0004 apply steps, staging truncate guidance, R2 bucket creation commands, and Workers Paid plan requirement.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cron_state migration** - `99c4589` (feat)
2. **Task 2: Create limit_type migration** - `0f9a666` (feat)
3. **Task 3: Document migration operations** - `0d1f2f2` (docs)

## Files Created/Modified

- `apps/worker/sql/0003_cron_state.sql` - Creates cron work-queue state table and partial unprocessed index.
- `apps/worker/sql/0004_add_limit_type.sql` - Adds strict `limit_type TEXT NOT NULL` event column.
- `apps/worker/README.md` - Documents Phase 4 SQL apply order, staging cleanup, R2 bucket provisioning, and Workers Paid plan.
- `.planning/phases/04-aggregation-dashboard/04-02-SUMMARY.md` - Execution record.

## cron_state DDL

```sql
CREATE TABLE cron_state (
    tier         TEXT         NOT NULL,
    bucket_ts    TIMESTAMPTZ  NOT NULL,
    state        TEXT         NOT NULL DEFAULT 'not_processed'
                 CHECK (state IN ('not_processed', 'processing', 'processed')),
    claimed_at   TIMESTAMPTZ,
    worker_id    TEXT,
    finished_at  TIMESTAMPTZ,
    last_error   TEXT,
    PRIMARY KEY (tier, bucket_ts)
);

CREATE INDEX cron_state_unprocessed_idx
    ON cron_state (tier, bucket_ts)
    WHERE state = 'not_processed';
```

## Operator Checklist

Staging cutover:

1. Run `TRUNCATE TABLE events;` on staging immediately before applying 0004 if Phase 3 staging-smoke rows exist.
2. Apply `apps/worker/sql/0003_cron_state.sql` to staging.
3. Apply `apps/worker/sql/0004_add_limit_type.sql` to staging.
4. Re-seed staging-smoke fixtures via the Phase 3 fixture path.
5. Provision R2 buckets before first cron deploy:
   - `wrangler r2 bucket create bloclawd-reports-staging`
   - `wrangler r2 bucket create bloclawd-reports`
6. Confirm Cloudflare Workers Paid plan before deploying cron triggers.

Production:

1. Apply `0003_cron_state.sql`.
2. Apply `0004_add_limit_type.sql`.
3. Keep production R2 bucket ready before Phase 4 cron R2 binding deploy.

## Decisions Made

- Followed PATTERNS.md S-2 and RESEARCH Pattern 4: `cron_state.state` is `TEXT NOT NULL DEFAULT 'not_processed' CHECK (...)`, not a custom enum type.
- Kept `0004_add_limit_type.sql` strict and single-statement with no database DEFAULT. Existing staging rows are handled operationally by truncate/re-seed.
- Placed R2 and Workers Paid plan notes in the worker README because they are deploy-time operator prerequisites for later cron plans.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Two verification probes initially failed because RTK shell wrapping expanded shell builtins/variables in the probe command. The file contents were correct; each probe was rerun with RTK proxy or fixed-string `rg` and passed.
- Unrelated worktree changes appeared during execution: `.planning/ROADMAP.md`, `.planning/STATE.md`, `apps/worker/src/event.rs`, and `crates/cli/src/cli.rs`. They were left unstaged and untouched.

## Known Stubs

None - stub scan found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty UI data in plan-touched files.

## Threat Flags

None beyond planned migration trust boundaries and documented mitigations in T-04-02-01 through T-04-02-05.

## User Setup Required

No separate USER-SETUP document was generated. Operator setup is documented in `apps/worker/README.md`.

## Verification

- Preflight Phase 3 migration check: PASS (`apps/worker/sql/0002_add_submission_group_id.sql` exists).
- Task 1 grep gate: PASS (`CREATE TABLE cron_state`, TEXT+CHECK states, composite PK, partial index).
- Task 2 grep gate: PASS (`ALTER TABLE events ADD COLUMN limit_type TEXT NOT NULL`, Phase 4 D-84 header, per-env apply lines, one ALTER statement).
- Task 3 grep gate: PASS (`0003_cron_state.sql`, `0004_add_limit_type.sql`, R2 bucket commands, Workers Paid plan, `TRUNCATE TABLE events`).
- Plan-level file scope: PASS (`git diff --name-only 99c4589^..0d1f2f2` lists only the two SQL migrations and `apps/worker/README.md`).

## Next Phase Readiness

Ready for 04-03 Worker event amendment to persist `limit_type`, 04-04 CLI fixture regeneration, and 04-05 cron_state helpers to consume the table contract.

## Self-Check: PASSED

- Created files exist: `0003_cron_state.sql`, `0004_add_limit_type.sql`, and this summary.
- Modified README exists and includes Phase 4 migration, R2, and Workers Paid plan notes.
- Task commits exist in git history: `99c4589`, `0f9a666`, `0d1f2f2`.
- Summary includes copied requirements `[AGGR-17, AGGR-18]`, verbatim `cron_state` DDL, and staging cutover checklist.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
