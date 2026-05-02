---
phase: 04-aggregation-dashboard
plan: 03
subsystem: worker-ingest
tags: [rust, worker, postgres, serde, limit_type]

requires:
  - phase: 04-01
    provides: SubmittedEvent.limit_type and LimitType closed enum
  - phase: 04-02
    provides: events.limit_type SQL migration
provides:
  - POST /event persists limit_type into events.limit_type
  - enum_invalid field routing for top-level limit_type variants
  - Regression coverage for limit_type unknown-variant and missing-field serde paths
affects: [cron-aggregate, cli-fixture-regen, worker-ingest]

tech-stack:
  added:
    - serde_path_to_error as event-schema dev-dependency
  patterns:
    - strict serde envelope validation with top-level enum path extraction
    - typed Postgres parameter binding for wire-envelope fields

key-files:
  created:
    - .planning/phases/04-aggregation-dashboard/04-03-SUMMARY.md
  modified:
    - apps/worker/src/event.rs
    - crates/event-schema/tests/error_kinds.rs
    - crates/event-schema/Cargo.toml
    - Cargo.lock

key-decisions:
  - "The POST /event deserialization call stayed unchanged; SubmittedEvent.limit_type plus deny_unknown_fields handles validation natively."
  - "limit_type shares the existing enum_invalid error envelope rather than adding a new error code."
  - "Worker verification used the actual Cargo package name bloclawd-worker because worker is not a workspace package."

patterns-established:
  - "Top-level wire-envelope enum fields are added to enum_invalid_field directly, while payload enum fields keep the payload. prefix strip."

requirements-completed: []

duration: 8min
completed: 2026-05-02
---

# Phase 04 Plan 03: Worker Event Amendment Summary

**POST /event now carries strict-serde `limit_type` through typed Postgres insertion and existing enum_invalid errors.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-02T18:23:20Z
- **Completed:** 2026-05-02T18:31:13Z
- **Tasks:** 2
- **Files modified:** 4 code/manifest files plus this summary

## Accomplishments

- Extended `INSERT_EVENT_SQL` from the 8-column event insert to a 9-column insert with `limit_type` bound as `$8::text`.
- Added `InsertEvent.limit_type` and populated it with `enum_to_wire(&wire.limit_type)`.
- Added `limit_type` to `enum_invalid_field` without changing the serde deserialization site.
- Added worker unit tests for `enum_invalid_field` and SQL persistence.
- Added event-schema regression tests for top-level `limit_type` unknown-variant and missing-field serde behavior.

## Task Commits

1. **Task 1 RED:** `c477392` test(04-03): add failing worker tests for limit_type insert
2. **Task 1 GREEN:** `194f72e` feat(04-03): persist event limit_type
3. **Task 2:** `770d088` test(04-03): cover limit_type serde error paths

## Files Created/Modified

- `apps/worker/src/event.rs` - Threads `limit_type` from `SubmittedEvent` into `InsertEvent`, SQL, typed params, and enum-invalid field mapping.
- `crates/event-schema/tests/error_kinds.rs` - Adds `SubmittedEvent` serde-path regressions for invalid and missing `limit_type`.
- `crates/event-schema/Cargo.toml` - Adds `serde_path_to_error` as a dev-dependency for the regression tests.
- `Cargo.lock` - Records the event-schema dev-dependency edge.
- `.planning/phases/04-aggregation-dashboard/04-03-SUMMARY.md` - Execution record.

## Exact Event Diff

`INSERT_EVENT_SQL` before:

```rust
INSERT INTO events
    (event_id, submission_group_id, bucket_ts, payload, model, tier, harness, region)
VALUES
    ($1::uuid, $2::uuid, date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz),
     $3::jsonb, $4::text, $5::text, $6::text, $7::text)
```

`INSERT_EVENT_SQL` after:

```rust
INSERT INTO events (event_id, submission_group_id, bucket_ts, payload, model, tier, harness, region, limit_type)
VALUES
    ($1::uuid, $2::uuid, date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz),
     $3::jsonb, $4::text, $5::text, $6::text, $7::text, $8::text)
```

`enum_invalid_field` extension:

```rust
match path {
    "model" | "tier" | "harness" | "region" => path.to_string(),
    "limit_type" => path.to_string(),
    _ => "unknown".to_string(),
}
```

The `serde_path_to_error::deserialize` site needed zero changes. `WireRequest = SubmittedEvent`, and 04-01 made `SubmittedEvent.limit_type` a required non-Option closed enum under `#[serde(deny_unknown_fields)]`, so invalid and missing values are rejected by the existing validation chain.

## Decisions Made

- Shared the existing `enum_invalid` envelope for `limit_type` per D-84 instead of introducing `limit_type_invalid`.
- Kept `limit_type` as a top-level wire-envelope field, not a payload field.
- Used `bloclawd-worker` in verification commands because `worker` is the dependency crate name, not the workspace package name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added event-schema test dependency**
- **Found during:** Task 2
- **Issue:** `crates/event-schema/tests/error_kinds.rs` needed `serde_path_to_error`, but the crate did not declare it for integration tests.
- **Fix:** Added `serde_path_to_error = "0.1"` under `[dev-dependencies]` and updated `Cargo.lock`.
- **Files modified:** `crates/event-schema/Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo test -p event-schema --test error_kinds limit_type --locked` and `cargo test -p event-schema --tests --locked` passed.
- **Committed in:** `770d088`

**2. [Rule 3 - Blocking] Corrected stale worker package name in verification**
- **Found during:** Task 1
- **Issue:** Plan commands used `cargo test -p worker`, but the workspace package is `bloclawd-worker`.
- **Fix:** Ran equivalent commands with `-p bloclawd-worker`.
- **Files modified:** None
- **Verification:** `cargo test -p bloclawd-worker --locked` and `cargo check --target wasm32-unknown-unknown -p bloclawd-worker --locked` passed.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (2 blocking).
**Impact on plan:** Both were execution blockers only; code behavior stayed within the planned worker and regression-test scope.

## Dependency Checks

- Phase 3 preflight migration `apps/worker/sql/0002_add_submission_group_id.sql`: present before edits.
- 04-01 dependency `crates/event-schema/src/wire.rs::SubmittedEvent.limit_type`: present before edits.
- 04-02 migration `apps/worker/sql/0004_add_limit_type.sql`: missing at initial check, then landed from concurrent 04-02 work during this plan; final check found it present. This plan did not edit or commit that migration.

## Issues Encountered

- Task 2's new regression tests passed on first run because 04-01 had already implemented the strict-serde `SubmittedEvent.limit_type` behavior. No GREEN implementation was needed for that task.
- Concurrent agents committed 04-02 and 04-04 work while this plan executed. Their files were left untouched and not staged by this plan.

## TDD Gate Compliance

- Task 1 followed RED/GREEN: `c477392` failed as expected on `enum_invalid_field("limit_type")`, then `194f72e` made the worker tests and checks pass.
- Task 2 produced a test-only commit (`770d088`). The intended behavior already existed from 04-01, so the added regression tests were immediately green; no feature commit followed.

## Known Stubs

None - stub scan found no TODO, FIXME, placeholder, coming soon, not available, or empty UI data placeholders in this plan's modified files.

## Threat Flags

None. The planned trust-boundary changes use strict serde validation plus parameterized `Type::TEXT` SQL binding for `limit_type`.

## User Setup Required

None - no external service configuration required.

## Verification

- `cargo test -p bloclawd-worker --locked` - PASS, 26 tests.
- `cargo test -p event-schema --tests --locked` - PASS, 58 tests.
- `cargo check --target wasm32-unknown-unknown -p bloclawd-worker --locked` - PASS.
- `git grep -nE 'INSERT INTO events.*limit_type' apps/worker/src/event.rs` - PASS.
- `git grep -nE 'pub limit_type: &.*str' apps/worker/src/event.rs` - PASS.
- `cargo fmt -p bloclawd-worker -p event-schema --check` - PASS.

## Self-Check: PASSED

- Summary file exists.
- Modified code files exist: `apps/worker/src/event.rs`, `crates/event-schema/tests/error_kinds.rs`, `crates/event-schema/Cargo.toml`, `Cargo.lock`.
- Task commits exist: `c477392`, `194f72e`, `770d088`.
- No tracked file deletions were introduced by this plan's commits.

## Next Phase Readiness

Ready for cron aggregation plans to read `events.limit_type` after 04-02 migration application, and for CLI fixture regeneration to submit the same top-level wire field.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
