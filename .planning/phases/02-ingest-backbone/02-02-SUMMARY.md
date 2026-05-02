---
phase: 02-ingest-backbone
plan: 02
subsystem: api
tags: [cloudflare-workers, rust, rate-limit, serde-json, wasm]

requires:
  - phase: 02-ingest-backbone
    provides: Plan 01 Worker env bindings, DB binding topology, and ingest env split
provides:
  - Worker dependency closure for Phase 2 ingest helpers
  - Flat D-40/D-41 ingest error envelope helper
  - Cloudflare RateLimiter wrapper for ingest routes
  - 8 KB request body cap helper
  - serde_json error-prefix regression tests
affects: [02-ingest-backbone, 03-cli-client]

tech-stack:
  added: [base64, getrandom, uuid, thiserror]
  patterns:
    - Flat JSON error envelopes via IngestError::into_response
    - Workers-rs RateLimiter binding wrapper with local-only request key handling
    - Dual body cap enforcement on Content-Length and materialized bytes

key-files:
  created:
    - apps/worker/src/errors.rs
    - apps/worker/src/ratelimit.rs
    - apps/worker/src/body.rs
    - crates/event-schema/tests/error_kinds.rs
  modified:
    - apps/worker/Cargo.toml
    - Cargo.lock
    - apps/worker/src/lib.rs

key-decisions:
  - "Moved staging-smoke dependencies to native-only optional dependencies because Cargo rejects optional dev-dependencies."
  - "Added uuid's js feature because current uuid 1.x requires an explicit wasm randomness source for v4 on wasm32-unknown-unknown."
  - "Added thiserror as a direct worker dependency because errors.rs derives Error in this crate."

patterns-established:
  - "IngestError owns the locked flat error envelope and status mapping for future /challenge and /event routes."
  - "Route helpers return Result<T, IngestError>, leaving route handlers to call into_response at the boundary."
  - "serde_json classifier prefix dependencies are pinned by event-schema integration tests."

requirements-completed: [INGE-10, INGE-11]

duration: 10min
completed: 2026-05-01
---

# Phase 02 Plan 02: Ingest Plumbing Primitives Summary

**Worker ingest primitives for flat error envelopes, rate limiting, body caps, and serde error-prefix drift detection**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-01T13:25:57Z
- **Completed:** 2026-05-01T13:35:51Z
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments

- Added Worker dependencies for Phase 2 ingest: `base64`, `getrandom`, `uuid`, and `thiserror`.
- Created `IngestError` with the 14 locked D-41 codes, flat D-40 JSON envelope, `Retry-After` handling, `pow::VerifyError` mapping, and serde error classification.
- Created `ratelimit::check` for workers-rs `RateLimiter`, using `cf-connecting-ip` only as the limiter key and never logging it.
- Created `body::read_capped` with the required 8 KB cap checks on both `Content-Length` and actual request bytes.
- Added `crates/event-schema/tests/error_kinds.rs` to pin serde_json display prefixes consumed by the Worker classifier.

## Task Commits

1. **Task 1: Update worker Cargo.toml** - `e45339e` (chore)
2. **Task 2: Create ingest error helper** - `ca020b2` (feat)
3. **Task 3: Create rate limit helper** - `02565f5` (feat)
4. **Task 4: Create body cap helper** - `193bfdb` (feat)
5. **Task 5: Create serde error-prefix tests** - `5edd2b5` (test)

## Files Created/Modified

- `apps/worker/Cargo.toml` - Worker ingest dependencies and `staging-smoke` feature scaffold.
- `Cargo.lock` - Dependency lock updates for worker and future staging smoke dependency closure.
- `apps/worker/src/errors.rs` - `IngestError`, response envelope helper, pow error mapping, serde error classifier, unit tests.
- `apps/worker/src/ratelimit.rs` - RateLimiter binding wrapper and static 60-second retry window.
- `apps/worker/src/body.rs` - 8 KB request body cap helper.
- `apps/worker/src/lib.rs` - Registered `errors`, `ratelimit`, and `body` modules.
- `crates/event-schema/tests/error_kinds.rs` - serde_json display-prefix regression tests.

## Decisions Made

- Used native-only optional dependencies for `staging-smoke` because Cargo does not allow optional `[dev-dependencies]`.
- Added `uuid` feature `js` alongside `v4` so `cargo check --target wasm32-unknown-unknown` succeeds with current `uuid` 1.x.
- Kept comments in `errors.rs` free of banned request-context identifiers so the INGE-11 grep boundary remains useful.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced invalid optional dev-dependencies**
- **Found during:** Task 1 (Update worker Cargo.toml)
- **Issue:** Cargo rejected the planned manifest shape: optional `[dev-dependencies]` are invalid.
- **Fix:** Moved `reqwest`, `tokio`, `tokio-postgres-native`, and `sha2` to native-only optional dependencies gated by `staging-smoke`; kept `[dev-dependencies]` empty with a comment.
- **Files modified:** `apps/worker/Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo check -p bloclawd-worker --target wasm32-unknown-unknown` passed.
- **Committed in:** `e45339e`

**2. [Rule 3 - Blocking] Added uuid wasm randomness feature**
- **Found during:** Task 1 (Update worker Cargo.toml)
- **Issue:** Current `uuid` 1.x fails on `wasm32-unknown-unknown` with only `features = ["v4"]`; it requires an explicit randomness source.
- **Fix:** Changed worker `uuid` dependency to `features = ["v4", "js"]`.
- **Files modified:** `apps/worker/Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo check -p bloclawd-worker --target wasm32-unknown-unknown` passed.
- **Committed in:** `e45339e`

**3. [Rule 3 - Blocking] Added direct thiserror dependency**
- **Found during:** Task 2 (Create ingest error helper)
- **Issue:** `errors.rs` derives `thiserror::Error`, but `bloclawd-worker` did not directly depend on `thiserror`.
- **Fix:** Added `thiserror = { workspace = true }` to worker dependencies.
- **Files modified:** `apps/worker/Cargo.toml`, `Cargo.lock`
- **Verification:** Worker wasm check and worker lib tests passed.
- **Committed in:** `ca020b2`

**4. [Rule 1 - Bug] Removed contradictory banned identifiers from errors.rs comments**
- **Found during:** Task 2 (Create ingest error helper)
- **Issue:** The planned source comments included request-context identifiers that the acceptance grep forbids in `errors.rs`.
- **Fix:** Preserved behavior and wire contract while shortening comments so only the locked `payload_hash_mismatch` code contains the permitted substring.
- **Files modified:** `apps/worker/src/errors.rs`
- **Verification:** `grep -cE 'event_id|nonce|cf-connecting-ip|WORKER_SECRET|connection_string' apps/worker/src/errors.rs` returned `0`.
- **Committed in:** `ca020b2`

---

**Total deviations:** 4 auto-fixed (1 Rule 1, 3 Rule 3)  
**Impact on plan:** No route behavior changed. Fixes were required for a valid Cargo manifest, wasm compilation, and INGE-11 grep hygiene.

## Issues Encountered

- Worker helpers are intentionally not routed yet, so Rust emits dead-code warnings during `cargo check` and `cargo test`. This matches the plan boundary; routes land in 02-03 and 02-04.
- `rtk` summarizes cargo test output, so raw `grep -E "test result.*5 passed"` verification used `rtk proxy sh -c`.

## Known Stubs

None.

## Authentication Gates

None.

## Verification

- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown` -> passed.
- `cargo test -p bloclawd-worker --lib` -> 3 tests passed.
- `cargo test -p event-schema --test error_kinds` -> 5 tests passed.
- `cargo test -p event-schema` -> 20 tests passed.
- `grep -rE 'console_log!.*event_id|console_log!.*nonce|console_log!.*cf-connecting-ip|console_log!.*WORKER_SECRET' apps/worker/src/` -> no matches.
- Module gates passed: `mod errors;`, `mod ratelimit;`, `mod body;`, and `pub enum IngestError` each appear exactly once.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 02-03 and 02-04. `/challenge` and `/event` can now compose the shared dependency closure, error envelope, rate-limit wrapper, and body cap helper instead of inventing them inside route handlers.

## Self-Check: PASSED

- Created files exist: `apps/worker/src/errors.rs`, `apps/worker/src/ratelimit.rs`, `apps/worker/src/body.rs`, `crates/event-schema/tests/error_kinds.rs`, `.planning/phases/02-ingest-backbone/02-02-SUMMARY.md`.
- Task commits found: `e45339e`, `ca020b2`, `02565f5`, `193bfdb`, `5edd2b5`.
- No accidental file deletions found in task commits.

---
*Phase: 02-ingest-backbone*
*Completed: 2026-05-01*
