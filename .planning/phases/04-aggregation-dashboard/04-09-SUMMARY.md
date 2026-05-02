---
phase: 04-aggregation-dashboard
plan: 09
subsystem: worker-cron
tags: [rust, workers-rs, cron, hyperdrive, status-json, privacy]

requires:
  - phase: 04-05
    provides: cron module skeleton, scheduled entrypoint, cron_state helper pattern
  - phase: 04-08
    provides: r2_emit::write_status placeholder and R2 status cache semantics
provides:
  - Canonical cron::health::StatusJson for reports/v1/_status.json
  - Health classification helper for healthy/degraded/down status
  - Hyperdrive count helpers for lifetime events and 30d fuzzy contributor count
  - RFC3339 second-precision UTC formatter for status timestamps
  - Ignored staging-smoke SQL proof for health count queries
affects: [cron-orchestrator, frontend-r2-schema, tests-ci-gates, dashboard-chrome]

tech-stack:
  added: []
  patterns: [tdd-red-green, hyperdrive-open-query-drop, fuzzy-rounded-public-count, canonical-status-json]

key-files:
  created:
    - apps/worker/src/cron/health.rs
    - apps/worker/tests/cron_health_staging.rs
  modified:
    - apps/worker/src/cron/mod.rs
    - apps/worker/src/cron/r2_emit.rs
    - apps/worker/src/lib.rs

key-decisions:
  - "StatusJson now lives in cron::health and r2_emit::write_status imports that canonical type instead of keeping the 04-08 empty placeholder."
  - "The 30d contributor query returns only a scalar count and count_distinct_contributors_30d fuzzy-rounds before returning."
  - "Used the correct epoch 1777731300 for 2026-05-02T14:15:00Z; the plan's 1762093200 value was stale."

patterns-established:
  - "Public contributor totals are rounded to 1 significant digit before leaving cron::health."
  - "StatusJson serialization order is tested because frontend Chrome depends on the shape."

requirements-completed: [AGGR-14]

duration: 8min
completed: 2026-05-02
---

# Phase 04 Plan 09: Cron Health Summary

**Canonical `_status.json` builder with fuzzy-rounded contributor counts, lifetime event count, and ingest health classification**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-02T19:36:09Z
- **Completed:** 2026-05-02T19:43:58Z
- **Tasks:** 1 TDD task
- **Files modified:** 5

## Accomplishments

- Added `cron::health::StatusJson` with the D-104 status shape for dashboard chrome.
- Implemented `fuzzy_round`, `classify_health`, `count_lifetime_events`, `count_distinct_contributors_30d`, and `build_status_json`.
- Replaced the 04-08 empty `r2_emit::StatusJson` placeholder with the canonical `cron::health::StatusJson` import.
- Added ignored `staging-smoke` coverage for the lifetime and contributor count SQL constants.

## StatusJson Field Order

`StatusJson` serializes in this exact order:

1. `schema_version`
2. `last_cron_success_ts`
3. `last_cron_attempted_ts`
4. `ingest_health`
5. `total_events_lifetime`
6. `approximate_contributors_30d`
7. `approximate_contributors_window_days`

## Fuzzy Round Boundaries

Covered boundaries:

- `0`, `7`, `9` return unchanged.
- `10 -> 10`, `15 -> 20`, `94 -> 90`, `95 -> 100`.
- `237 -> 200`, `257 -> 300`, `2370 -> 2000`.
- `100` and `1000` stay stable.

## Task Commits

1. **Task 1 RED: Cron health tests** - `003c5a3` (test)
2. **Task 1 GREEN: Cron health implementation** - `36eea39` (feat)

## Files Created/Modified

- `apps/worker/src/cron/health.rs` - StatusJson, health classification, fuzzy rounding, DB count helpers, RFC3339 formatter, and unit tests.
- `apps/worker/src/cron/mod.rs` - Exports `health`.
- `apps/worker/src/cron/r2_emit.rs` - Imports canonical `cron::health::StatusJson` for `write_status`.
- `apps/worker/src/lib.rs` - Re-exports health SQL constants under `staging-smoke`.
- `apps/worker/tests/cron_health_staging.rs` - Ignored staging-smoke SQL proof.

## Decisions Made

- Kept the contributor window at 30 days per D-103 and exposed `approximate_contributors_window_days: 30`.
- Used `query_typed_one` for the count SQL helpers to preserve the Hyperdrive no-prepared-statements pattern from 04-05.
- Inlined the existing civil-time algorithm shape for RFC3339 output instead of introducing a date dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Corrected stale RFC3339 test epoch**
- **Found during:** Task 1 RED tests
- **Issue:** The plan stated `2026-05-02T14:15:00Z = 1762093200`, but the correct Unix epoch is `1777731300`.
- **Fix:** Used `1777731300` in the rfc3339 known-timestamp test.
- **Files modified:** `apps/worker/src/cron/health.rs`
- **Verification:** `node -e "console.log(Date.parse('2026-05-02T14:15:00Z')/1000)"` returned `1777731300`; rfc3339 unit test passes.
- **Committed in:** `003c5a3`

**2. [Rule 2 - Missing Critical] Canonicalized StatusJson across health and R2 emit**
- **Found during:** Task 1 GREEN implementation
- **Issue:** 04-08 left an empty placeholder `StatusJson` in `r2_emit.rs`; keeping both types would make 04-10 wire-up ambiguous.
- **Fix:** Moved the real shape into `cron::health::StatusJson` and changed `r2_emit::write_status` to import that type.
- **Files modified:** `apps/worker/src/cron/health.rs`, `apps/worker/src/cron/r2_emit.rs`
- **Verification:** `cargo test -p bloclawd-worker --lib cron::r2_emit::tests --locked` passed.
- **Committed in:** `36eea39`

**3. [Rule 3 - Blocking] Re-exported health SQL constants for staging-smoke import**
- **Found during:** Task 1 GREEN staging test
- **Issue:** The ignored integration test cannot import through private `cron` module paths.
- **Fix:** Re-exported the two health SQL constants from `lib.rs` behind `#[cfg(feature = "staging-smoke")]`.
- **Files modified:** `apps/worker/src/lib.rs`
- **Verification:** `cargo test -p bloclawd-worker --features staging-smoke --locked --no-run` passed.
- **Committed in:** `36eea39`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical integration fix, 1 blocking test import fix).
**Impact on plan:** All fixes preserve the planned status contract and avoid duplicate status schemas.

## Issues Encountered

- The existing workers-rs scheduled-handler macro warning from `apps/worker/src/lib.rs` remains during checks and builds.
- The local GSD SDK was unavailable under `node_modules` and on PATH through RTK; no STATE.md or ROADMAP.md tracking update was attempted, per user instruction.

## Known Stubs

None. The ignored staging-smoke test is intentional and requires `PLANETSCALE_STAGING_URL`.

## Threat Flags

None beyond the planned DB read helpers and public `_status.json` surface covered by the plan threat model.

## User Setup Required

None for default development. Optional staging smoke requires:

- `PLANETSCALE_STAGING_URL`
- Applied events migrations on the staging branch
- Manual command: `cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_health_staging`

## Verification

- `cargo test -p bloclawd-worker --lib cron::health::tests --locked` - PASS, 10 tests.
- `cargo test -p bloclawd-worker --lib cron::health::tests::rfc3339_emits_iso_8601_seconds_z_format --locked` - PASS, 1 test.
- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown --locked` - PASS, with existing scheduled-handler warning.
- `cargo test -p bloclawd-worker --features staging-smoke --locked --no-run` - PASS, ignored staging tests compile.
- `cargo test -p bloclawd-worker --locked` - PASS, 73 tests.
- `worker-build --release` from `apps/worker` - PASS, with existing scheduled-handler warning.
- WASM size gate - PASS, `apps/worker/build/index_bg.wasm` = 1,069,635 bytes < 2,621,440.
- `grep -nE 'console_log!.*\b(approximate_contributors|submission_group_id|contributors_30d)\b' apps/worker/src/cron/health.rs` - PASS, zero matches.
- `grep -E 'format!\("\{\}", secs\)' apps/worker/src/cron/health.rs` - PASS, zero matches.
- `git grep -nE 'submission_group_id' apps/worker/src/cron/health.rs` - PASS, exactly one hit inside the SQL string literal.

## Next Phase Readiness

Ready for 04-10 to call `build_status_json`, pass the result to `r2_emit::write_status`, and then rewrite the manifest last.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/04-aggregation-dashboard/04-09-SUMMARY.md`.
- Created health module and staging-smoke test files exist on disk.
- Task commits exist in git history: `003c5a3`, `36eea39`.
- STATE.md and ROADMAP.md were left unstaged and untouched by this plan executor.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
