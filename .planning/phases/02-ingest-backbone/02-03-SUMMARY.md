---
phase: 02-ingest-backbone
plan: 03
subsystem: api
tags: [cloudflare-workers, rust, pow, hmac, rate-limit, getrandom]

requires:
  - phase: 02-ingest-backbone
    provides: Plan 02 ingest error envelopes, rate-limit wrapper, Worker dependency closure
provides:
  - Stateless GET /challenge Worker route
  - HMAC-signed 32-byte challenge issuance using crates/pow
  - RL_CHALLENGE gate before random bytes, secret fetch, or HMAC work
affects: [02-ingest-backbone, 03-cli-client]

tech-stack:
  added: []
  patterns:
    - Route-local IngestError::into_response boundary
    - getrandom 0.4 fill API aliased to preserve handler call shape

key-files:
  created:
    - apps/worker/src/challenge.rs
  modified:
    - apps/worker/src/lib.rs

key-decisions:
  - "Used getrandom::fill for getrandom 0.4.2 because the planned getrandom::getrandom API no longer exists in that crate line."

patterns-established:
  - "Challenge handler ordering: rate limit first, then time, CSPRNG, WORKER_SECRET, pow::issue_challenge, base64url response."
  - "Challenge route remains stateless: no DB, KV, R2, or module-scope storage."

requirements-completed: [INGE-01, INGE-10, INGE-11]

duration: 7min
completed: 2026-05-01
---

# Phase 02 Plan 03: Challenge Handler Summary

**Stateless GET /challenge route issuing base64url HMAC challenges behind RL_CHALLENGE**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-01T13:45:00Z
- **Completed:** 2026-05-01T13:51:56Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `apps/worker/src/challenge.rs` with `handle_challenge` using `ratelimit::check`, `Date::now().as_millis()`, 24 CSPRNG bytes, `WORKER_SECRET`, and `pow::issue_challenge`.
- Returned the locked 4-field body: `challenge_id`, `sig`, `difficulty`, and `expires_in`, with base64url no padding.
- Wired `GET /challenge` into the Worker router without touching `/`, `/db-ping`, `#[event(start)]`, or `_VERIFY_REACHABLE`.
- Preserved INGE-11: no `console_log!` in `challenge.rs`, and no storage or DB access.

## Task Commits

1. **Task 1: Create challenge handler and route** - `26ad35e` (feat)

## Files Created/Modified

- `apps/worker/src/challenge.rs` - Stateless challenge issuance handler.
- `apps/worker/src/lib.rs` - Module declaration and `/challenge` route registration.

## Decisions Made

- Used `getrandom::fill` from getrandom 0.4.2 and imported it as `getrandom` so the handler call remains `getrandom(&mut random_24)` while compiling against the actual crate API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated getrandom call to current crate API**
- **Found during:** Task 1 (Create challenge handler and route)
- **Issue:** The plan expected `getrandom::getrandom`, but `apps/worker/Cargo.toml` depends on getrandom 0.4.2, whose public API is `getrandom::fill`.
- **Fix:** Imported `getrandom::fill as getrandom`, preserving the planned handler call shape and the wasm_js-backed CSPRNG source.
- **Files modified:** `apps/worker/src/challenge.rs`
- **Verification:** Context7/docs.rs lookup confirmed `fill(dest: &mut [u8])`; `cargo check`, `cargo test`, and `worker-build` passed.
- **Committed in:** `26ad35e`

**2. [Rule 1 - Bug] Reworded comment to satisfy exact call-site grep**
- **Found during:** Task 1 acceptance criteria
- **Issue:** The planned comment text included `Date::now().as_millis()`, causing the exact grep for the real call site to count 2 occurrences.
- **Fix:** Reworded the comment while keeping the real `Date::now().as_millis()` call unchanged.
- **Files modified:** `apps/worker/src/challenge.rs`
- **Verification:** Acceptance grep for `Date::now().as_millis()` returned `1`.
- **Committed in:** `26ad35e`

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1)  
**Impact on plan:** No behavioral scope change. Fixes were required to compile against current dependencies and pass the plan's exact acceptance gate.

## Issues Encountered

- Initial compile failed because `getrandom::getrandom` is not exported by getrandom 0.4.2. Resolved with the alias described above.
- Existing dead-code warnings remain for `/event` plumbing from 02-02; these are expected until 02-04 wires the event route.

## Known Stubs

None.

## Threat Flags

None - the new network route and secret access were included in the plan threat model.

## Authentication Gates

None.

## Verification

- `grep` acceptance gate for handler signature, constants, route wiring, CSPRNG call, HMAC issue call, base64url encoding, no `console_log!`, and no module-scope state -> passed.
- `cargo check -p bloclawd-worker --target wasm32-unknown-unknown` -> passed with expected 02-02 dead-code warnings.
- `cargo test -p bloclawd-worker --lib` -> 3 tests passed.
- `worker-build --release --quiet` -> passed; WASM package built.
- Log-boundary grep over `apps/worker/src/challenge.rs` -> no matches.
- Manual smoke via `wrangler dev --env staging` was not run; plan marks it manual and it requires a local Worker runtime session.

## User Setup Required

None - this plan adds no new external service configuration.

## Next Phase Readiness

Ready for 02-04. `POST /event` can now consume the challenge wire contract, use `WORKER_SECRET`, and replace the `_VERIFY_REACHABLE` witness with the real `pow::verify` call.

## Self-Check: PASSED

- Created files exist: `apps/worker/src/challenge.rs`, `.planning/phases/02-ingest-backbone/02-03-SUMMARY.md`.
- Modified router file exists: `apps/worker/src/lib.rs`.
- Task commit found: `26ad35e`.
- No accidental file deletions found in the task commit.

---
*Phase: 02-ingest-backbone*
*Completed: 2026-05-01*
