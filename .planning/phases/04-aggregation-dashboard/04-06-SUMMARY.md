---
phase: 04-aggregation-dashboard
plan: 06
subsystem: worker-cron
tags: [rust, cron, ridge-regression, aggregation, k-anonymity]

requires:
  - phase: 04-01
    provides: MODEL_PRICES, TokenType, Window, LimitType shared contracts
  - phase: 04-05
    provides: cron module barrel with state and tick modules
provides:
  - Hand-rolled ridge regression solver for cron weight fitting
  - compute_cells numerics pipeline for submission grouping, ridge fit, 2sigma trim, k-anonymity, and model cells
  - Golden fixtures for ridge, two-sigma trim, and y=1 cohort math
  - Forward-declared PercentileEncoding for 04-07
affects: [cron-percentile, cron-r2-emit, cron-orchestrator, dashboard-r2-schema]

tech-stack:
  added: []
  patterns: [pure-cron-numerics, hand-rolled-gauss-jordan, serde-skipped-raw-costs, fixture-backed-math]

key-files:
  created:
    - apps/worker/src/cron/ridge.rs
    - apps/worker/src/cron/aggregate.rs
    - apps/worker/src/cron/percentile.rs
    - apps/worker/src/cron/tests/fixtures/golden_ridge_n12.json
    - apps/worker/src/cron/tests/fixtures/golden_two_sigma.json
    - apps/worker/src/cron/tests/fixtures/golden_ridge_y1_cohort_n50.json
  modified:
    - apps/worker/src/cron/mod.rs

key-decisions:
  - "N_FIT is `apps/worker/src/cron/aggregate.rs::N_FIT = 50`; post-staging tuning is a one-line constant change."
  - "Per-model tokens-to-limit projection formula is `unified_cost / mean(model.weights[0..8])`; 04-07 fills the PercentileEncoding values."
  - "Near-singular ridge returns prior weights plus infinite residual without logging, preserving the plan's pure numerics invariant."

patterns-established:
  - "Cron numerics accept EventRow-shaped input and stay detached from DB/env/R2 I/O."
  - "Public Cell raw samples stay internal via `#[serde(skip)] trimmed_unified_costs`."

requirements-completed: [AGGR-02, AGGR-03, AGGR-15, AGGR-16]

duration: 14min
completed: 2026-05-02
---

# Phase 04 Plan 06: Cron Aggregate Ridge Summary

**Pure cron numerics for ridge-weighted unified-cost cells with 2sigma trim, k-anonymity gates, and golden math fixtures**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-02T18:53:48Z
- **Completed:** 2026-05-02T19:07:35Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 7

## Accomplishments

- Added `cron::ridge::fit_ridge` using closed-form ridge with prior shift and partial-pivot dense solve.
- Added `cron::aggregate::compute_cells` for submission grouping, y=1 ridge fitting, stratified fallback, 2sigma trim, trim-rate alerts, k-anonymity suppression, and per-model output.
- Added forward-declared `cron::percentile::PercentileEncoding` so the locked Cell shape compiles before 04-07 fills variants.
- Added three JSON golden fixtures for future 04-20 expansion.

## Cell Shape

`Cell` field order: `tier`, `harness`, `region`, `limit_type`, `n_submissions`, `trim_rate`, `trim_rate_alert`, `trimmed_unified_costs` (`#[serde(skip)]`), `unified_cost`, `models`, `insufficient_data`.

`ModelCell` field order: `model`, `n_with_model`, `weights`, `weight_source`, `tokens_to_limit_if_only`.

Weights are ordered: `input_5min`, `output_5min`, `cached_read_5min`, `cached_write_5min`, `input_5h`, `output_5h`, `cached_read_5h`, `cached_write_5h`.

## Task Commits

1. **Task 1 RED:** `cd7aad0` test(04-06): add failing ridge solver tests
2. **Task 1 GREEN:** `42edff5` feat(04-06): implement ridge solver
3. **Task 2 RED:** `7dea095` test(04-06): add failing aggregate tests
4. **Task 2 GREEN:** `2f30fa0` feat(04-06): implement aggregate numerics

## Files Created/Modified

- `apps/worker/src/cron/ridge.rs` - `RidgeFit`, `fit_ridge`, `solve_dense`, residual calculation, and ridge unit tests.
- `apps/worker/src/cron/aggregate.rs` - `EventRow`, `Cell`, `ModelCell`, `N_FIT`, `two_sigma_trim`, `compute_cells`, fallback helpers, and aggregate tests.
- `apps/worker/src/cron/percentile.rs` - Empty `PercentileEncoding` forward declaration for 04-07.
- `apps/worker/src/cron/mod.rs` - Adds `aggregate`, `percentile`, and `ridge` modules while preserving `state` and `tick`.
- `apps/worker/src/cron/tests/fixtures/golden_ridge_n12.json` - Ridge solver golden vector.
- `apps/worker/src/cron/tests/fixtures/golden_two_sigma.json` - 2sigma trim golden vector.
- `apps/worker/src/cron/tests/fixtures/golden_ridge_y1_cohort_n50.json` - 50-submission y=1 ridge cohort fixture.

## Decisions Made

- Used the locked D-83 formula `unified_cost / mean(model.weights[0..8])` for the per-model projection helper; encoding remains `None` until 04-07 can fill `PercentileEncoding`.
- Kept near-singular ridge fallback log-free. The function returns prior weights and `residual_l2 = INFINITY`; callers use fallback/weight-source handling without adding I/O to pure numerics.
- Kept global fallback strata scoped by `limit_type` as well as tier/harness to avoid mixing 5h and weekly limit surfaces.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Fixed prior-fallback test below k-anonymity floor**
- **Found during:** Task 2 (aggregate tests)
- **Issue:** The plan sketch said to test prior fallback with 3 submissions, but AGGR-05 requires `n < 5` cells to drop `models[]`, making `weight_source` unobservable.
- **Fix:** Used 6 submissions for the prior fallback test so it stays below `N_FIT` while satisfying the k-anonymity floor.
- **Files modified:** `apps/worker/src/cron/aggregate.rs`
- **Verification:** `cargo test -p bloclawd-worker --lib cron::aggregate::tests --locked`
- **Committed in:** `2f30fa0`

**2. [Rule 2 - Missing Critical] Preserved pure numerics over debug logging**
- **Found during:** Task 1 (ridge implementation)
- **Issue:** The behavior text mentioned a debug log on singular pivots, while the must-have invariant requires all numeric functions to be pure and free of I/O.
- **Fix:** Returned prior weights plus infinite residual without logging; aggregate fallback handles the result.
- **Files modified:** `apps/worker/src/cron/ridge.rs`
- **Verification:** `cargo test -p bloclawd-worker --lib cron::ridge::tests --locked`
- **Committed in:** `42edff5`

---

**Total deviations:** 2 auto-fixed (1 test bug, 1 missing critical invariant preservation).
**Impact on plan:** Both changes preserve the privacy/purity invariants and do not expand scope.

## Known Stubs

- `apps/worker/src/cron/percentile.rs` contains an intentionally empty `PercentileEncoding` enum. Plan 04-07 replaces it with `Mean` and `Bin` variants.
- `Cell.unified_cost` and `ModelCell.tokens_to_limit_if_only` are initialized as `None` in this layer because 04-07 owns percentile encoding.

## Issues Encountered

- `worker-build` and cargo checks still emit the pre-existing workers-rs scheduled-handler `unused_must_use` warning from `apps/worker/src/lib.rs`.
- The local GSD SDK was not available under `node_modules` or `PATH`; no state/roadmap mutation was required or performed.

## Verification

- `cargo test -p bloclawd-worker --lib cron::ridge::tests --locked` - PASS, 4 tests.
- `cargo test -p bloclawd-worker --lib cron::aggregate::tests --locked` - PASS, 10 tests.
- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown --locked` - PASS, with existing scheduled-handler warning.
- `worker-build --release` from `apps/worker` - PASS.
- WASM size gate - PASS, `apps/worker/build/index_bg.wasm` = 1,069,635 bytes < 2,621,440.
- Golden fixtures parse with `jq empty` - PASS for all three JSON files.
- `git grep -nE 'console_log!.*\b(submission_group_id|tier|harness|region)\b' apps/worker/src/cron/aggregate.rs` - PASS, zero matches.

## Threat Flags

None beyond the planned numerical stability and trim-rate logging surfaces covered by this plan threat model.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-07 can replace `PercentileEncoding` with `Mean`/`Bin` variants and encode `Cell.trimmed_unified_costs`. 04-08 can serialize the locked `Cell`/`ModelCell` field order into public R2 bucket files without adding raw samples.

## Self-Check: PASSED

- Summary and created source files exist on disk.
- Task commits exist in git history: `cd7aad0`, `42edff5`, `7dea095`, `2f30fa0`.
- Final verification commands listed above passed after the task commits.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were left unstaged and untouched by this plan executor.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
