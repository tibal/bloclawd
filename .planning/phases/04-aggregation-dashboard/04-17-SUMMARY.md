---
phase: 04-aggregation-dashboard
plan: 17
subsystem: ci-tests
tags: [ci, rust, cron, frontend, integration, anonymity]

requires:
  - phase: 04-05
    provides: cron state scaffolding
  - phase: 04-06
    provides: aggregate compute_cells
  - phase: 04-07
    provides: percentile encode_cell
  - phase: 04-08
    provides: R2 BucketEnvelope and schema fixture
  - phase: 04-09
    provides: health status JSON and contributor-count SQL
  - phase: 04-10
    provides: cron tick orchestrator write order
  - phase: 04-15
    provides: dashboard data route assembly
  - phase: 04-16
    provides: frontend transparency routes
provides:
  - Phase 4 CI jobs for anonymity strip, frontend build/test, R2 schema drift, and cron integration
  - Cron pipeline integration tests over aggregate -> percentile -> R2 envelope serialization
  - Dashboard integration test over router + TanStack Query cache + mocked R2 data
affects: [ci, rust-tests, frontend-tests, staging-proof]

tech-stack:
  added: []
  patterns:
    - ci-grep-anonymity-boundary
    - cron-module-integration-test
    - query-cache-backed-spa-integration-test

key-files:
  created:
    - apps/worker/src/cron/tests/mod.rs
    - apps/worker/src/cron/tests/integration_test.rs
    - apps/frontend/src/__tests__/integration/dashboard-e2e.test.tsx
  modified:
    - .github/workflows/pow.yml
    - apps/worker/src/cron/mod.rs

key-decisions:
  - "CI uses the actual Cargo package name `bloclawd-worker`; the plan text's `-p worker` selector is stale."
  - "The dashboard E2E test mocks the Chart wrapper only because jsdom lacks canvas support for uPlot; router, query cache, dashboard-data, Chrome, and DataTable remain real."
  - "The E2E fixture uses h1 buckets for the 7d window because the implemented tier picker maps 7d to h1."

patterns-established:
  - "Phase 4 anonymity CI checks r2_emit.rs, committed R2 JSON fixtures, health.rs SQL-only submission_group_id usage, and cron-side tz_offset absence."
  - "Cron integration tests construct public BucketEnvelope values directly from encoded cells without requiring a real R2 binding."

requirements-completed: []

duration: 32min
completed: 2026-05-02
---

# Phase 04 Plan 17: Tests + CI Gates Summary

**Phase 4 defensive CI, cron integration coverage, and dashboard E2E coverage**

## Performance

- **Duration:** 32 min
- **Completed:** 2026-05-02
- **Tasks:** 3 tasks
- **Files modified:** 5 source/workflow/test files plus this summary

## Accomplishments

- Added four Phase 4 jobs to `.github/workflows/pow.yml`.
- Wired the new jobs into `all-pass`.
- Added `cron::tests::integration` with three tests:
  - Well-populated synthetic cohort emits a schema-versioned public R2 envelope with mean encoding and no private identifiers.
  - Low-volume cohort emits `insufficient_data: true` with no model breakdown or percentiles.
  - Static manifest-last assertion verifies `write_bucket_file` appears before `write_status`, which appears before `rewrite_manifest`.
- Added a frontend dashboard E2E test with real router navigation and TanStack Query cached R2 data.

## CI Jobs Added

1. `strip-at-cron` - Greps `cron/r2_emit.rs` and committed R2 JSON fixtures for private strings, verifies `health.rs` only mentions `submission_group_id` in the contributor-count SQL literal, and checks cron modules do not mention `tz_offset`.
2. `frontend-build-test` - Installs pnpm dependencies, runs frontend tests, builds the frontend, and checks build artifacts exist.
3. `r2-schema-drift` - Runs the R2 schema fixture test and fails if `r2_v1_schema.json` drifts.
4. `cron-integration` - Runs `cargo test -p bloclawd-worker --lib cron::tests::integration --locked`.

The existing `size-check` job has no path filter, so worker cron changes already trigger the WASM size budget job.

## Task Commits

1. **Task 1: Phase 4 CI jobs** - `4e8c026` (ci)
2. **Task 2: Cron integration tests** - `ab4283d` (test)
3. **Task 3: Dashboard E2E integration** - `4f28a5f` (test)

## Files Created/Modified

- `.github/workflows/pow.yml` - New Phase 4 jobs and `all-pass` dependencies.
- `apps/worker/src/cron/mod.rs` - Adds the cron integration test module under `#[cfg(test)]`.
- `apps/worker/src/cron/tests/mod.rs` - Exposes `integration_test.rs` as `cron::tests::integration`.
- `apps/worker/src/cron/tests/integration_test.rs` - Synthetic pipeline and manifest-last integration tests.
- `apps/frontend/src/__tests__/integration/dashboard-e2e.test.tsx` - Router + query-cache dashboard integration test.

## Deviations from Plan

- The plan used `cargo test -p worker`; the workspace package is `bloclawd-worker`, so CI and local verification use `-p bloclawd-worker`.
- The dashboard E2E test mocks `@/components/Chart` because jsdom lacks `HTMLCanvasElement.getContext`, which uPlot needs. Chart behavior remains covered by the chart/component tests; this E2E test covers route, R2 cache, dashboard-data, Chrome, and DataTable integration.
- The dashboard E2E uses h1 buckets for `window=7d` because `pickTier(7)` returns `h1`.

## Issues Encountered

- Running the stale `-p worker` command fails because `worker` is a dependency crate name, not the workspace package.
- Real uPlot rendering raises a jsdom canvas error, so the test follows the existing dashboard integration pattern and mocks Chart.
- Per runtime instruction, `.planning/STATE.md` and `.planning/ROADMAP.md` remained dirty, unstaged, and untouched.

## Known Stubs

None.

## Threat Flags

None. The new CI and test coverage is specifically aimed at catching private-field leakage, R2 schema drift, manifest-last regressions, and dashboard integration regressions.

## User Setup Required

None.

## Next Phase Readiness

04-18 can perform staging proof with CI-level coverage already in place.

## TDD Gate Compliance

- Task 2 is test-only integration coverage over already-built cron modules; no production code change was needed beyond exposing the test module.
- Task 3 is test-only integration coverage over already-built frontend modules; no production code change was needed.

## Verification

- Workflow grep checks for `strip-at-cron`, `frontend-build-test`, `r2-schema-drift`, `cron-integration`, and `pnpm --filter ./apps/frontend` - PASS.
- `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/pow.yml')"` - PASS.
- Local strip-at-cron grep script equivalent - PASS.
- `cargo test -p bloclawd-worker --lib cron::tests::integration --locked` - PASS; 3 tests.
- `cargo test -p bloclawd-worker --lib cron::r2_emit::tests::schema_fixture --locked` - PASS; 1 test.
- `git diff --exit-code -- apps/worker/src/cron/tests/fixtures/r2_v1_schema.json` - PASS.
- `pnpm --filter ./apps/frontend test:run -- src/__tests__/integration/dashboard-e2e.test.tsx` - PASS; Vitest ran 17 files and 46 tests.
- `pnpm --filter ./apps/frontend test:run` - PASS; 17 files and 46 tests.
- `pnpm --filter ./apps/frontend lint` - PASS.
- `pnpm --filter ./apps/frontend build` - PASS.

## Self-Check: PASSED

- Created files exist: summary, cron test module files, and dashboard E2E test.
- Task commits exist in git history: `4e8c026`, `ab4283d`, `4f28a5f`.
- Working tree before summary commit contains only this summary plus orchestrator-owned `.planning/ROADMAP.md` and `.planning/STATE.md`.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
