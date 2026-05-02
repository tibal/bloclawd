---
phase: 04-aggregation-dashboard
plan: 05
subsystem: worker-cron
tags: [rust, workers-rs, cron, hyperdrive, postgres, staging-smoke]

requires:
  - phase: 04-02
    provides: cron_state table migration with tier, bucket_ts, state, claimed_at, worker_id, finished_at, last_error
  - phase: 04-01
    provides: Phase 4 shared aggregation contracts and generated type groundwork
provides:
  - Worker scheduled event entrypoint delegated to cron::tick::run
  - cron module barrel with state and tick modules
  - cron_state work-queue helpers for eager fill, atomic claim, mark processed, revert, and stale sweep
  - ignored staging-smoke test for cron_state SQL transitions
affects: [cron-aggregate, cron-percentile, cron-r2-emit, cron-health, cron-orchestrator]

tech-stack:
  added: []
  patterns: [workers-rs-scheduled-handler, hyperdrive-open-query-drop, tokio-postgres-query-typed, ignored-staging-smoke]

key-files:
  created:
    - apps/worker/src/cron/mod.rs
    - apps/worker/src/cron/state.rs
    - apps/worker/src/cron/tick.rs
    - apps/worker/tests/cron_skeleton_contract.rs
    - apps/worker/tests/cron_state_staging.rs
  modified:
    - apps/worker/src/lib.rs
    - apps/worker/Cargo.toml

key-decisions:
  - "cron::state uses query_typed_* only; INSERT/UPDATE row counts come from count-returning CTEs instead of client.execute."
  - "STALE_CLAIM_MULT is fixed at 5 for this plan and remains tunable after staging UAT."
  - "The worker crate now also emits an rlib so staging-smoke integration tests can import SQL constants; cdylib remains for Worker deploy."

patterns-established:
  - "Scheduled Worker entry delegates to cron::tick::run while fetch routes remain unchanged."
  - "cron_state helpers open, drive, query, and drop a fresh Hyperdrive client per helper call."
  - "Native staging smoke tests import the same SQL constants used by the Worker helper path."

requirements-completed: [AGGR-17, AGGR-18]

duration: 13min
completed: 2026-05-02
---

# Phase 04 Plan 05: Cron State Summary

**Worker scheduled-entry skeleton with typed-query cron_state work-queue helpers and gated staging smoke coverage**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-02T18:36:47Z
- **Completed:** 2026-05-02T18:49:03Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `#[event(scheduled)]` in `apps/worker/src/lib.rs`, delegating scheduled ticks to `cron::tick::run`.
- Added `apps/worker/src/cron/` with a module barrel, a 04-10-owned tick stub, and the AGGR-17/18 `cron::state` helper surface.
- Implemented `eager_fill`, `claim_one`, `mark_processed`, `revert`, and `sweep_stale_claims` with per-call Hyperdrive open/query/drop and count/status-only logs.
- Added SQL contract tests plus an ignored `staging-smoke` integration test that exercises claim, finish, revert, and sweep transitions against `$PLANETSCALE_STAGING_URL`.

## Helper Signatures

- `eager_fill(env: &Env, tier: &str, lateness_min: i64) -> Result<u64>`
- `claim_one(env: &Env, worker_id: &str, stale_threshold: &str) -> Result<Option<(String, SystemTime)>>`
- `mark_processed(env: &Env, tier: &str, bucket_ts: SystemTime) -> Result<()>`
- `revert(env: &Env, tier: &str, bucket_ts: SystemTime, last_error: &str) -> Result<()>`
- `sweep_stale_claims(env: &Env, threshold: &str) -> Result<u64>`

`STALE_CLAIM_MULT` is `5`; 04-10 can compute per-tier stale thresholds as `5 * cron_interval`, then tune after staging UAT.

## Task Commits

1. **Task 1 RED: Cron skeleton contract test** - `905c016` (test)
2. **Task 1 GREEN: Scheduled cron skeleton** - `0a454ad` (feat)
3. **Task 2 RED: cron_state SQL unit tests** - `029e4c7` (test)
4. **Task 2 GREEN: cron_state helpers** - `6dc9e5e` (feat)
5. **Formatting follow-up: tick stub rustfmt** - `798c47f` (style)
6. **Task 3 RED: staging-smoke test** - `2166ded` (test)
7. **Task 3 GREEN: staging-smoke import wiring** - `8fe0b98` (feat)

## Files Created/Modified

- `apps/worker/src/lib.rs` - Adds `mod cron`, scheduled Worker entrypoint, and staging-smoke SQL re-export.
- `apps/worker/src/cron/mod.rs` - Declares `pub mod state; pub mod tick;`.
- `apps/worker/src/cron/tick.rs` - Stub orchestrator for 04-10.
- `apps/worker/src/cron/state.rs` - AGGR-17/18 work-queue SQL and helpers.
- `apps/worker/tests/cron_skeleton_contract.rs` - File-contract test for scheduled skeleton.
- `apps/worker/tests/cron_state_staging.rs` - Ignored native staging smoke test.
- `apps/worker/Cargo.toml` - Adds `rlib` crate type for integration-test linking while preserving `cdylib`.

## Decisions Made

- Used `query_typed_one`, `query_typed_opt`, and `query_typed` for all cron_state helper DB calls. `eager_fill` and `sweep_stale_claims` wrap INSERT/UPDATE statements in CTEs that return `count(*)::int8`, avoiding `client.execute` while still returning affected-row counts.
- Kept the scheduled handler signature as planned (`Result<()>`). workers-rs 0.8.1 emits an `unused_must_use` warning from the macro for scheduled handlers returning `Result`; checks pass and 04-10 can revisit if the project chooses a logging-only `()` scheduled handler.
- Exposed SQL constants behind the `staging-smoke` feature rather than broadening the default public API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added minimal state module during Task 1**
- **Found during:** Task 1 (cron skeleton)
- **Issue:** `cron/mod.rs` must declare `pub mod state;`, but Cargo cannot compile the barrel unless `apps/worker/src/cron/state.rs` exists.
- **Fix:** Added a minimal state module in Task 1, then filled it in Task 2.
- **Files modified:** `apps/worker/src/cron/state.rs`
- **Verification:** `cargo check -p bloclawd-worker --target wasm32-unknown-unknown --locked`
- **Committed in:** `0a454ad`

**2. [Rule 2 - Missing Critical] Replaced execute/query_opt plan sketch with query_typed_* helpers**
- **Found during:** Task 2 (cron_state helpers)
- **Issue:** The action sketch used `client.execute` / `query_opt`, but the plan must-haves and research Pitfall 4 require `query_typed_*` everywhere in cron to avoid Hyperdrive prepared-statement regressions.
- **Fix:** Implemented count-returning CTEs plus `query_typed_one`, `query_typed_opt`, and `query_typed`.
- **Files modified:** `apps/worker/src/cron/state.rs`
- **Verification:** state unit tests, WASM check, and no `.execute(`/plain `.query(` grep matches in `state.rs`.
- **Committed in:** `6dc9e5e`

**3. [Rule 3 - Blocking] Added rlib crate type for staging-smoke integration tests**
- **Found during:** Task 3 (cron_state staging smoke)
- **Issue:** Native integration tests could not import `bloclawd_worker` with only `crate-type = ["cdylib"]`.
- **Fix:** Added `"rlib"` alongside `"cdylib"` and re-exported SQL constants under `#[cfg(feature = "staging-smoke")]`.
- **Files modified:** `apps/worker/Cargo.toml`, `apps/worker/src/lib.rs`
- **Verification:** `cargo test -p bloclawd-worker --features staging-smoke --locked --no-run`
- **Committed in:** `8fe0b98`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking).
**Impact on plan:** All changes were required for compilation, Hyperdrive correctness, or the planned staging-smoke test surface.

## Issues Encountered

- `worker-build --release` passes but emits the same workers-rs scheduled-handler `unused_must_use` warning noted above.
- The staging-smoke test was compiled but not executed because it requires a live `PLANETSCALE_STAGING_URL` and an applied `0003_cron_state.sql` migration.

## Known Stubs

- `apps/worker/src/cron/tick.rs` is intentionally a stub in this plan. Plan 04-10 owns the real orchestrator.

## Threat Flags

None beyond the planned scheduled cron entrypoint and cron_state DB helper surface covered by the plan threat model.

## User Setup Required

None for default development. Optional staging smoke requires:

- `PLANETSCALE_STAGING_URL`
- `apps/worker/sql/0003_cron_state.sql` applied on that staging branch
- Manual command: `cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_state_staging`

## Verification

- `cargo test -p bloclawd-worker --lib cron::state::tests --locked` - PASS, 7 tests.
- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown --locked` - PASS, with workers-rs scheduled macro warning.
- `cargo test -p bloclawd-worker --locked` - PASS, 34 tests; staging smoke does not run by default.
- `worker-build --release` from `apps/worker` - PASS.
- WASM size gate - PASS, `apps/worker/build/index_bg.wasm` = 1,069,627 bytes < 2,621,440.
- `git grep -nE 'console_log!.*tier' apps/worker/src/cron/` - PASS, zero matches.
- Negative state log grep for `tier|bucket_ts|worker_id|last_error` variable emission - PASS, zero matches.

## Next Phase Readiness

Ready for 04-06/07/08/09 modules to call the `cron::state` work-queue helpers and for 04-10 to replace the tick stub with the full sweep -> eager fill -> claim -> process orchestration.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/04-aggregation-dashboard/04-05-SUMMARY.md`.
- Created cron module and staging test files exist on disk.
- Task commits exist in git history: `905c016`, `0a454ad`, `029e4c7`, `6dc9e5e`, `798c47f`, `2166ded`, `8fe0b98`.
- STATE.md and ROADMAP.md were left unstaged and untouched by this plan executor.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
