---
phase: 03-rust-cli
plan: 02
subsystem: worker-ingest
tags: [worker-amendment, sql-migration, submission-group-id, log-boundary]

requires:
  - phase: 03-01
    provides: SubmittedEvent transport wrapper with submission_group_id outside EventPayload
provides:
  - Worker accepts strict SubmittedEvent wire bodies with submission_group_id
  - events table 0002 migration for submission_group_id UUID NOT NULL
  - CI log-boundary grep covers submission_group_id across Worker and Rust emitters
affects: [03-03-cli-scaffold, 03-05-wire-glue, phase-4-cron-dashboard]

tech-stack:
  added: []
  patterns:
    - Shared event-schema SubmittedEvent consumed directly by Worker
    - UUIDv4 base64url transport validation via one helper
    - Split log-boundary grep for worker::console_log! and Rust std/tracing emitters

key-files:
  created:
    - apps/worker/sql/0002_add_submission_group_id.sql
  modified:
    - apps/worker/src/event.rs
    - apps/worker/README.md
    - .github/workflows/pow.yml

key-decisions:
  - "Worker aliases WireRequest to event_schema::SubmittedEvent so the shared transport wrapper is the single source of truth."
  - "Malformed submission_group_id reuses the existing bad_json envelope shape, preserving the closed 14-code error set."
  - "CI uses two grep invocations: one for worker::console_log!, one for eprintln!/println!/tracing emitters."

patterns-established:
  - "parse_wire_uuid_v4 validates base64url-no-pad UUIDv4 strings for both event_id and submission_group_id."
  - "INSERT_EVENT_SQL is a testable constant with typed UUID placeholders."

requirements-completed: []

duration: 11min
completed: 2026-05-02
---

# Phase 03 Plan 02: Worker Amendment Summary

**Worker ingest now accepts, validates, and persists submission_group_id while CI blocks future log leaks of that transport id.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T08:56:44Z
- **Completed:** 2026-05-02T09:07:20Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added `apps/worker/sql/0002_add_submission_group_id.sql` with `submission_group_id UUID NOT NULL`.
- Replaced the local Worker request shape with the shared `SubmittedEvent` wrapper, then validates both `event_id` and `submission_group_id` as base64url UUIDv4 strings.
- Extended `INSERT INTO events` to persist `submission_group_id` through a typed UUID placeholder.
- Extended the log-boundary CI gate to cover `submission_group_id` for `console_log!`, `eprintln!`, `println!`, and `tracing::*`.

## Task Commits

1. **Task 1 RED: worker submission group tests** - `c35eaff` (test)
2. **Task 1 GREEN: Worker migration and persistence** - `15847b7` (feat)
3. **Task 2: log-boundary CI grep gate** - `6b95ffb` (chore)

## Files Created/Modified

- `apps/worker/sql/0002_add_submission_group_id.sql` - Additive DDL for `events.submission_group_id`.
- `apps/worker/src/event.rs` - Uses `SubmittedEvent`, validates UUIDv4 ids, and inserts `submission_group_id`.
- `apps/worker/README.md` - Documents the 0002 apply step and log-boundary wording.
- `.github/workflows/pow.yml` - Adds `submission_group_id` and Rust emitter grep gate.

## Decisions Made

- Used `event_schema::SubmittedEvent` directly via the local `WireRequest` alias to keep the Worker wire contract aligned with Plan 03-01.
- Reused `bad_json` for malformed `submission_group_id`, matching the existing malformed `event_id` shape and avoiding a 15th wire error code.
- Kept the CI gate as two greps: one for Worker `console_log!`, one for CLI/Worker standard Rust emitters.
- Did not apply the 0002 migration to staging or main. Operator must run the README commands before first Phase 3 CLI submissions land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded README log-boundary prose so CI grep passes**
- **Found during:** Task 2 (Extend log-boundary CI grep gate)
- **Issue:** Existing README prose put `console_log!` and forbidden id tokens on the same line, causing the local CI grep simulation to match documentation.
- **Fix:** Reworded the prose to describe the boundary without a regex-triggering emitter/token line.
- **Files modified:** `apps/worker/README.md`
- **Verification:** Both `! git grep ...` CI simulations returned exit 0.
- **Committed in:** `6b95ffb`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for the planned CI gate to pass. No behavior or architecture change.

## Issues Encountered

- A parallel CLI scaffold edit briefly broke workspace dependency resolution while verification was running. I did not edit `Cargo.toml` or `crates/cli`; after the parallel change settled, the actual workspace verification passed.

## Known Stubs

None.

## Verification

- `cargo test -p bloclawd-worker -- --nocapture` passed: 22 tests across 3 suites.
- `cargo build --workspace` passed.
- `apps/worker/sql/0002_add_submission_group_id.sql` exists and contains exactly one `submission_group_id UUID NOT NULL`.
- `apps/worker/README.md` references `0002_add_submission_group_id.sql` twice.
- `.github/workflows/pow.yml` contains `submission_group_id` in both grep invocations.
- Both local log-boundary grep simulations returned exit 0.
- `git diff --exit-code -- apps/worker/sql/0001_events.sql` returned zero changes.

## User Setup Required

Apply `apps/worker/sql/0002_add_submission_group_id.sql` manually to PlanetScale staging and main before Phase 3 CLI submissions are sent. The migration has not been applied by this plan.

## Next Phase Readiness

Ready for `03-03-cli-scaffold` and later submit wiring: the Worker accepts the shared `SubmittedEvent` envelope and persists the invocation-level grouping id.

## Self-Check: PASSED

- Found created file: `apps/worker/sql/0002_add_submission_group_id.sql`.
- Found SUMMARY file: `.planning/phases/03-rust-cli/03-02-worker-amendment-SUMMARY.md`.
- Found task commits: `c35eaff`, `15847b7`, `6b95ffb`.
- Verified key grep counts: migration DDL count `1`, Worker `submission_group_id` count `15`, pow.yml count `2`.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
