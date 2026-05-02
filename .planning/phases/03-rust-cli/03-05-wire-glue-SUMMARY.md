---
phase: 03-rust-cli
plan: 05
subsystem: cli-wire-glue
tags: [canonical-formatter, pow-solve, reqwest-blocking, wire-error]

requires:
  - phase: 03-03
    provides: bloclawd-cli workspace scaffold and API helpers
  - phase: 03-04
    provides: EventPayload-producing parser and aggregate layer
provides:
  - Canonical payload formatter shared by dry-run and PoW paths
  - PoW solve wrapper with 30-second timeout and base64url challenge decoding
  - Closed CLI mirror of the 14-code Worker error envelope
  - Blocking reqwest client plus challenge and event submit helpers
affects: [03-06-probe-render, 03-07-orchestration-fixtures]

tech-stack:
  added: []
  patterns:
    - event_schema::canonical_bytes as the only CLI canonical formatter
    - reqwest blocking client with rustls and https_only(true)
    - SubmittedEvent as the POST /event body shape

key-files:
  created:
    - crates/cli/src/canonical.rs
    - crates/cli/src/solve.rs
    - crates/cli/src/submit.rs
    - crates/cli/src/wire_error.rs
  modified:
    - crates/cli/src/lib.rs

key-decisions:
  - "Wire errors map to five CLI variants, with all Worker errors exiting 4."
  - "PoW timeout remains local-only and exits 3."
  - "submission_group_id is serialized at SubmittedEvent top level and never inside payload canonical bytes."

patterns-established:
  - "CLI wire modules are pure/testable helpers; Plan 07 owns orchestration loops."
  - "Malformed challenge or server response bodies converge to ServerUnavailable."

requirements-completed: [CLI-08, CLI-09, CLI-10, CLI-15, CLI-16]

duration: 14min
completed: 2026-05-02
---

# Phase 03 Plan 05: Wire Glue Summary

**The CLI now has canonical bytes, PoW solving, Worker error mapping, and HTTP submit helpers ready for orchestration.**

## Performance

- **Duration:** 14 min
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments

- Added `canonical.rs` as the single CLI formatter around `event_schema::canonical_bytes`, with SHA-256 payload hash helper.
- Added `solve.rs` with `decode_challenge_id`, `solve_for_payload`, `solve_until_deadline`, K=22, and 30-second timeout behavior.
- Added `wire_error.rs` with closed `IngestCliError`, `from_wire`, and documented exit-code mapping.
- Added `submit.rs` with `https_only(true)` reqwest blocking client, `GET /challenge` parser, `SubmittedEvent` body builder, and `POST /event` response/error parsing.

## Task Commits

1. **Task 1 RED: canonical and solve tests** - `e0ffcef`
2. **Task 1 GREEN: canonical and solve glue** - `efa0d0f`
3. **Task 2 RED: wire errors and submit tests** - `deb4c25`
4. **Task 2 GREEN: wire errors and submit glue** - `1086772`

## Files Created/Modified

- `crates/cli/src/canonical.rs` - Canonical byte and payload hash helpers.
- `crates/cli/src/solve.rs` - Challenge decode and PoW solve wrappers.
- `crates/cli/src/wire_error.rs` - CLI error enum and Worker wire-code mapping.
- `crates/cli/src/submit.rs` - HTTP client, challenge parser, submit body, and response parser.
- `crates/cli/src/lib.rs` - Module exports and `IngestCliError` re-export.

## Decisions Made

- Kept the JCS implementation centralized in `event_schema::canonical_bytes`; the CLI does not reimplement canonicalization.
- Mapped malformed challenge bodies, bad base64, network failures, and unknown wire codes to `ServerUnavailable` for convergence.
- Kept `SubmittedEvent` construction in `submit.rs`, with `submission_group_id` top-level and outside `payload`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered from a stalled executor**
- **Found during:** Wave 3 execution.
- **Issue:** The spawned executor committed all code tasks but shut down before creating the required SUMMARY artifact.
- **Fix:** Orchestrator verified the committed implementation and created this summary artifact.
- **Files modified:** `.planning/phases/03-rust-cli/03-05-wire-glue-SUMMARY.md`
- **Verification:** `cargo test -p bloclawd-cli --lib` and `cargo build -p bloclawd-cli` passed.

---

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No code scope change; missing metadata was added.

## Verification

- `cargo test -p bloclawd-cli --lib` passed: 86 passed, 2 ignored.
- `cargo build -p bloclawd-cli` passed.
- `canonical.rs` delegates to `event_schema::canonical_bytes`.
- `solve.rs` calls `pow::solve`, decodes 32-byte base64url challenges, and maps timeout to `PowTimeout`.
- `submit.rs` builds a reqwest blocking client with `https_only(true)` and serializes `SubmittedEvent`.
- `wire_error.rs` covers the locked Worker code set, including `rate_limited`, `server_unavailable`, and `signature_invalid`.

## User Setup Required

None.

## Next Phase Readiness

Ready for `03-06-probe-render`: the canonical formatter and wire error enum are available for render and probe convergence.

## Self-Check: PASSED

- Found created files: `crates/cli/src/canonical.rs`, `crates/cli/src/solve.rs`, `crates/cli/src/submit.rs`, `crates/cli/src/wire_error.rs`.
- Found task commits: `e0ffcef`, `efa0d0f`, `deb4c25`, `1086772`.
- Found no `## Self-Check: FAILED` marker.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
