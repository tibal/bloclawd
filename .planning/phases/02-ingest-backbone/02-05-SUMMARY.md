---
phase: 02-ingest-backbone
plan: 05
subsystem: testing
tags: [rust, cargo, staging-smoke, pow, planetscale, tokio-postgres]

requires:
  - phase: 02-ingest-backbone
    provides: Plans 02-01, 02-03, and 02-04 Worker topology, challenge route, event route, and idempotent insert path
provides:
  - Manual staging end-to-end smoke test gated by staging-smoke and #[ignore]
  - Shared event-schema sample EventPayload fixture for future CLI tests
  - README documentation for D-46 run command and D-47 duplicate response check
affects: [03-cli-client, 04-aggregation-dashboard, staging-verification]

tech-stack:
  added: []
  patterns:
    - Feature-gated native integration tests for deployed staging verification
    - Shared event-schema fixture shape mirrored by cross-crate integration tests

key-files:
  created:
    - apps/worker/tests/e2e_staging.rs
    - crates/event-schema/tests/fixtures.rs
  modified:
    - apps/worker/README.md
    - apps/worker/Cargo.toml
    - Cargo.lock

key-decisions:
  - "Read staging SELECT bucket_ts as SystemTime and format to second-precision RFC3339, matching the Worker path without adding a direct chrono dependency."
  - "Kept the deployed staging happy_path test manual-only via staging-smoke and #[ignore]; it is not in CI."

patterns-established:
  - "Manual staging proof: GET /challenge, solve with pow::solve, POST /event, SELECT by event_id, then duplicate POST idempotency check."
  - "Native-only optional test dependencies remain behind the staging-smoke feature so default cargo test does not pull reqwest, tokio, tokio-postgres-native, or sha2."

requirements-completed: [INGE-01, INGE-02, INGE-03, INGE-04, INGE-05, INGE-06, INGE-09]

duration: 9min
completed: 2026-05-01
---

# Phase 02 Plan 05: Staging E2E Proof Summary

**Manual staging-smoke integration test proving challenge, PoW solve, event ingest, DB persistence, and D-47 idempotency**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-01T14:17:09Z
- **Completed:** 2026-05-01T14:26:08Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `crates/event-schema/tests/fixtures.rs` with `sample_event_payload()` and self-tests for validation, canonical size, and serde round-trip.
- Added `apps/worker/tests/e2e_staging.rs`, gated by `staging-smoke` and `#[ignore]`, covering deployed staging `/challenge` -> PoW solve -> `/event` -> PlanetScale SELECT -> duplicate POST.
- Updated `apps/worker/README.md` so the D-46 smoke instructions include the D-47 duplicate idempotency assertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared EventPayload fixture** - `6b84383` (test)
2. **Task 2: Gated staging e2e smoke test** - `0281a6d` (test)
3. **Task 3: README smoke-test idempotency docs** - `f76e63b` (docs)

## Files Created/Modified

- `crates/event-schema/tests/fixtures.rs` - Canonical synthetic EventPayload and token-count fixture plus 3 tests.
- `apps/worker/tests/e2e_staging.rs` - Manual staging happy-path integration test, feature-gated and ignored by default.
- `apps/worker/README.md` - D-46 smoke section now documents duplicate POST idempotency.
- `apps/worker/Cargo.toml` - Added `with-uuid-1` to the native `tokio-postgres-native` feature set.
- `Cargo.lock` - Reflected the native tokio-postgres UUID feature dependency.

## Decisions Made

- Used the actual `TokenCounts` field names from `crates/event-schema/src/payload.rs` (`input_5min`, `output_5min`, `cached_read_5min`, `cached_write_5min`, `input_5h`, `output_5h`, `cached_read_5h`, `cached_write_5h`) instead of the older sketch in the plan.
- Used `SystemTime` for the staging SELECT `bucket_ts` and formatted it to RFC3339 seconds locally, matching the Worker implementation and avoiding a new direct chrono dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Enabled native UUID binding for staging SELECT**
- **Found during:** Task 2 (Create apps/worker/tests/e2e_staging.rs)
- **Issue:** `cargo test -p bloclawd-worker --features staging-smoke --no-run` failed because `Uuid: ToSql` was not implemented for the native `tokio-postgres-native` dependency.
- **Fix:** Added `with-uuid-1` to the gated native `tokio-postgres-native` feature list and updated `Cargo.lock`.
- **Files modified:** `apps/worker/Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo test -p bloclawd-worker --features staging-smoke --no-run` passed.
- **Committed in:** `0281a6d`

---

**Total deviations:** 1 auto-fixed (1 Rule 3)  
**Impact on plan:** Required for the manual staging test to compile while preserving the default no-feature dependency boundary.

## Issues Encountered

- The deployed staging `happy_path` run was not performed because `BLOCLAWD_STAGING_URL` and `BLOCLAWD_STAGING_PG_URL` were not set in this runtime. The test remains manual and documented exactly as planned.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| `apps/worker/README.md` | 52, 56 | Inherited production Hyperdrive placeholder documentation from 02-01; intentional operator setup step before production deploy. |

## Authentication Gates

None.

## Verification

- `cargo test -p event-schema --test fixtures` -> 3 passed.
- `cargo test -p event-schema` -> passed.
- `cargo test -p bloclawd-worker --no-run` -> passed.
- `cargo test -p bloclawd-worker --features staging-smoke --no-run` -> passed.
- `cargo test -p bloclawd-worker` -> 12 passed; `happy_path` absent from output without feature.
- `cargo test -p bloclawd-worker --features staging-smoke` -> 12 passed, 1 ignored.
- README D-46/D-47 grep anchors -> passed.
- `grep -c "RETURNING bucket_ts" apps/worker/src/event.rs` -> 1.
- Manual staging run `cargo test -p bloclawd-worker --features staging-smoke -- --ignored happy_path` -> not run; missing staging URL and PG URL env vars.

## User Setup Required

To complete live staging proof, set `BLOCLAWD_STAGING_URL` and `BLOCLAWD_STAGING_PG_URL`, then run:

```bash
cargo test -p bloclawd-worker --features staging-smoke -- --ignored happy_path
```

## Next Phase Readiness

Phase 2 ingest backbone is complete from a code and local verification standpoint. Phase 3 can build the CLI against the locked `/challenge` and `/event` wire contracts. Live staging proof remains an operator action once deployed staging Worker and PlanetScale branch credentials are available.

## Self-Check: PASSED

- Created files exist: `apps/worker/tests/e2e_staging.rs`, `crates/event-schema/tests/fixtures.rs`, `.planning/phases/02-ingest-backbone/02-05-SUMMARY.md`.
- Task commits found: `6b84383`, `0281a6d`, `f76e63b`.
- No accidental file deletions found in task commits.

---
*Phase: 02-ingest-backbone*
*Completed: 2026-05-01*
