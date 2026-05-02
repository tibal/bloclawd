---
phase: 04-aggregation-dashboard
plan: 07
subsystem: worker-cron
tags: [rust, cron, percentile, aggregation, k-anonymity, log-bins]

requires:
  - phase: 04-01
    provides: LOG_BIN_EDGES and log_bin_index semantics
  - phase: 04-06
    provides: Cell and ModelCell shapes with PercentileEncoding placeholders
provides:
  - Windowed L-estimator percentile encoding with floor-rule ranks
  - Powers-of-2 bin-index fallback for small or boundary-limited cells
  - encode_cell mutator that fills Cell.unified_cost and gated ModelCell.tokens_to_limit_if_only
  - Golden fixtures for n=21 Mean and n=12 Bin behavior
affects: [cron-r2-emit, cron-orchestrator, dashboard-r2-schema, phase-04-tests]

tech-stack:
  added: []
  patterns:
    - floor-rule-percentile-ranks
    - all-or-nothing-mean-or-bin-encoding
    - left-closed-log-bin-indexes

key-files:
  created:
    - apps/worker/src/cron/tests/fixtures/golden_percentile_n21.json
    - apps/worker/src/cron/tests/fixtures/golden_percentile_n12.json
  modified:
    - apps/worker/src/cron/percentile.rs

key-decisions:
  - "Mean encoding is pinned to n_trimmed >= 21 via floor-rule rank plus centered five-sample windows."
  - "Bin fallback emits LOG_BIN_EDGES left-closed bin indexes, not raw values or centroids."
  - "tokens_to_limit_if_only divides unified-cost percentiles by sum(model.weights); Bin projections use the selected bin's left edge before re-binning."
  - "No TokensToLimit type alias was added; Cell and ModelCell keep Option<PercentileEncoding> from the 04-06 locked shape."

patterns-established:
  - "PercentileEncoding is the unified public percentile representation for cohort and per-model projections."
  - "Golden fixtures lock the n=21 Mean boundary and n=12 Bin index behavior."

requirements-completed: [AGGR-04, AGGR-06]

duration: 6min
completed: 2026-05-02
---

# Phase 04 Plan 07: Cron Percentile Summary

**Windowed L-estimator percentiles with n_trimmed >= 21 Mean encoding and powers-of-two bin-index fallback**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-02T19:11:56Z
- **Completed:** 2026-05-02T19:17:42Z
- **Tasks:** 1 TDD task
- **Files modified:** 3

## Accomplishments

- Filled `PercentileEncoding` with `Mean` and `Bin` variants.
- Added `encode` using floor-rule ranks, centered five-sample windows, and all-or-nothing Bin fallback.
- Added `encode_cell` to fill `Cell.unified_cost` and per-model `tokens_to_limit_if_only` only when `n_with_model >= 5`.
- Added golden fixtures for n=21 Mean behavior and n=12 Bin behavior.

## Task Commits

1. **Task 1 RED:** `8350481` test(04-07): add failing percentile tests
2. **Task 1 GREEN:** `e15e198` feat(04-07): implement percentile encoding

## Files Created/Modified

- `apps/worker/src/cron/percentile.rs` - Implements `PercentileEncoding`, `encode`, `encode_cell`, bin helpers, and 7 unit tests.
- `apps/worker/src/cron/tests/fixtures/golden_percentile_n21.json` - Locks n=21 Mean expected values: p10=3, p25=6, p50=11, p75=16, p90=19.
- `apps/worker/src/cron/tests/fixtures/golden_percentile_n12.json` - Locks n=12 Bin expected indexes: p10=1, p25=3, p50=6, p75=9, p90=10.

## Decisions Made

- Kept `apps/worker/src/cron/mod.rs` unchanged because `pub mod percentile;` already existed from 04-06/04-05.
- Did not add a `TokensToLimit` alias; the locked 04-06 field shape already uses `Option<PercentileEncoding>` for both cohort and per-model percentile output.
- Used left-closed bin semantics from `crates/event-schema::log_bin_index`: exact edge values map to that edge's index.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Corrected stale n12 golden Bin indexes**
- **Found during:** Task 1 (golden fixture creation)
- **Issue:** The plan's JSON sketch listed p10/p25/p50/p75 as `0,2,5,8`, but the same plan's hand-check text and `LOG_BIN_EDGES` implementation require exact edge values to map left-closed: 2048->1, 8192->3, 65536->6, 524288->9.
- **Fix:** Wrote `golden_percentile_n12.json` with `1,3,6,9,10` and implemented the encoder against left-closed bin semantics.
- **Files modified:** `apps/worker/src/cron/tests/fixtures/golden_percentile_n12.json`, `apps/worker/src/cron/percentile.rs`
- **Verification:** `cargo test -p bloclawd-worker --lib cron::percentile::tests --locked` passed all 7 tests.
- **Committed in:** `8350481`, `e15e198`

**2. [Rule 2 - Missing Critical] Guarded invalid per-model weight sums**
- **Found during:** Task 1 (`encode_cell` implementation)
- **Issue:** The plan specified dividing by `sum(weights)` but did not define behavior for zero, negative, or non-finite sums.
- **Fix:** `encode_cell` leaves `tokens_to_limit_if_only` as `None` when the model weight sum is not positive finite, avoiding invalid public projections.
- **Files modified:** `apps/worker/src/cron/percentile.rs`
- **Verification:** `cargo test -p bloclawd-worker --lib cron::percentile::tests --locked` and WASM check both passed.
- **Committed in:** `e15e198`

---

**Total deviations:** 2 auto-fixed (1 test bug, 1 missing critical guard).
**Impact on plan:** Both preserve the intended AGGR-04/06 privacy and determinism contract. No schema shape changes.

## Issues Encountered

- The RED test gate failed as expected before implementation with missing `encode`, `encode_cell`, and `Mean`/`Bin` variants.
- `cargo check` and `worker-build` still emit the pre-existing workers-rs scheduled-handler `unused_must_use` warning from `apps/worker/src/lib.rs`.

## Verification

- `cargo test -p bloclawd-worker --lib cron::percentile::tests --locked` - PASS, 7 tests.
- `cargo fmt --check` - PASS.
- `stat apps/worker/src/cron/tests/fixtures/golden_percentile_n21.json` - PASS.
- `stat apps/worker/src/cron/tests/fixtures/golden_percentile_n12.json` - PASS.
- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown --locked` - PASS, with existing scheduled-handler warning.
- `worker-build --release` from `apps/worker` - PASS.
- WASM size gate - PASS, `apps/worker/build/index_bg.wasm` = 1,069,635 bytes < 2,621,440.
- `git grep -nE 'PercentileEncoding' apps/worker/src/cron/` - PASS, more than 3 matches.

## Known Stubs

None.

## Threat Flags

None. This plan added pure Rust numerical encoding only; no new network endpoint, auth path, file access pattern, or trust-boundary schema surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-08 can serialize `Cell.unified_cost` and `ModelCell.tokens_to_limit_if_only` through the locked 04-06 shapes. 04-20 tests can cite the pinned `n_trimmed >= 21` threshold and the n12/n21 golden fixtures.

## Self-Check: PASSED

- Summary exists on disk.
- Created fixture files and modified percentile source exist on disk.
- Task commits exist in git history: `8350481`, `e15e198`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were left unstaged and untouched by this plan executor.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
