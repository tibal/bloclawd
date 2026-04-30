---
phase: 01-foundations
plan: 01
subsystem: specs
tags: [pow, hmac, sha256, jcs, rfc8785, enums]

requires: []
provides:
  - Byte-exact PoW v1 spec using HMAC-SHA256 stateless challenges and 72-byte hash input
  - RFC 8785 canonical payload spec naming Rust and TypeScript implementations
  - Canonical POST /event payload schema and machine-readable enum sets
affects: [phase-02-ingest, phase-03-cli, phase-04-aggregation, pow-fixtures, bilingual-ci]

tech-stack:
  added: []
  patterns:
    - Frozen Markdown specs at spec/*.md
    - Machine-readable enum source at spec/enums.json

key-files:
  created:
    - spec/pow-v1.md
    - spec/payload-canonical.md
    - spec/event-schema.md
    - spec/enums.json
  modified: []

key-decisions:
  - "PoW v1 challenge issuance is stateless HMAC-SHA256 with WORKER_SECRET and no challenge storage service."
  - "PoW input is exactly challenge_id (32B) || payload_hash (32B) || nonce (8B BE), total 72 bytes."
  - "Payload canonicalization uses RFC 8785 JCS via serde_jcs in Rust and @rfc-8785/json-canonicalize in TypeScript."
  - "spec/enums.json is the canonical enum source for Worker validation, CLI startup checks, and R2 publication."

patterns-established:
  - "Spec changes require versioned docs and downstream CLI + Worker coordination."
  - "Enum values live in one JSON artifact and are referenced by prose docs."

requirements-completed: [SPEC-01, SPEC-03]

duration: 5min
completed: 2026-04-30
---

# Phase 01 Plan 01: Canonical Specs Summary

**HMAC-signed 72-byte PoW contract, RFC 8785 payload canonicalization, and canonical event enum schema for downstream Rust/TypeScript parity**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-30T17:01:21Z
- **Completed:** 2026-04-30T17:05:52Z
- **Tasks:** 3
- **Files modified:** 4 spec files plus this summary

## Accomplishments

- Wrote `spec/pow-v1.md` with stateless HMAC-SHA256 challenge issuance, 60s expiry, exact 72-byte PoW input, K=22 difficulty, verification ordering, and database idempotency.
- Wrote `spec/payload-canonical.md` with RFC 8785 JCS as the canonical payload byte format and named Rust/TypeScript implementations.
- Wrote `spec/enums.json` and `spec/event-schema.md` locking v1 model/tier/harness/region values and excluding `tz_offset`, `event_id`, and `nonce` from the canonical payload.

## Task Commits

1. **Task 1: Write PoW v1 spec** - `630a1b4` (feat)
2. **Task 2: Write canonical payload spec** - `aca7605` (feat)
3. **Task 3: Write event schema and enums** - `526660b` (feat)

## Files Created/Modified

- `spec/pow-v1.md` - Frozen PoW v1 contract for challenge issuance, 72-byte input, verification ordering, and replay defenses.
- `spec/payload-canonical.md` - Frozen RFC 8785 JCS canonicalization contract with library choices and fixture edge cases.
- `spec/event-schema.md` - Canonical `POST /event` request body, payload constraints, excluded fields, and server-assigned DB fields.
- `spec/enums.json` - Machine-readable v1 enum sets for model, tier, harness, and region.

## Verification

- `test -f spec/pow-v1.md spec/payload-canonical.md spec/event-schema.md spec/enums.json` equivalent passed.
- `python3 -m json.tool spec/enums.json > /dev/null` passed.
- Task grep checks for PoW, payload canonicalization, event schema, enum contents, and no standalone `KV` token in `spec/pow-v1.md` passed.
- `spec/enums.json` arrays match exact v1 order for model, tier, harness, and region.

## Decisions Made

- Used no uppercase standalone `KV` token in `spec/pow-v1.md`; phrased the invariant as "no per-challenge state and no challenge storage service" so the spec passes its own forbidden-token gate.
- Corrected JCS Unicode language to specify preservation, not normalization.
- Added explicit payload-boundary wording: `event_id` and `nonce` are top-level transport fields, never canonical payload fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved contradictory PoW text versus verification**
- **Found during:** Task 1 (Write PoW v1 spec)
- **Issue:** The action text requested verbatim prose containing standalone `KV`, but the same task required `spec/pow-v1.md` to contain zero standalone `KV` tokens.
- **Fix:** Preserved the stateless/no-challenge-store invariant using "no per-challenge state" and "no challenge storage service" wording.
- **Files modified:** `spec/pow-v1.md`
- **Verification:** PoW grep block passed, including `! grep -E '(^|[^a-zA-Z])KV([^a-zA-Z]|$)' spec/pow-v1.md`.
- **Committed in:** `630a1b4`

**2. [Rule 1 - Bug] Corrected JCS Unicode normalization claim**
- **Found during:** Task 2 (Write canonical payload spec)
- **Issue:** The action text implied RFC 8785 JCS normalizes Unicode. JCS preserves JSON string values; accidental normalization would create drift.
- **Fix:** Documented Unicode preservation and NFC/NFD-shaped fixture coverage for drift detection.
- **Files modified:** `spec/payload-canonical.md`
- **Verification:** Payload canonicalization grep block passed and edge-case list includes Unicode-NFC/NFD preservation.
- **Committed in:** `aca7605`

**3. [Rule 2 - Missing Critical] Made payload boundary explicit**
- **Found during:** Task 3 (Write event schema and enums)
- **Issue:** Success criteria required `event_id` to be excluded from payload, but the action text only listed it as a top-level request field.
- **Fix:** Added explicit text that `event_id` and `nonce` are transport fields and must not appear inside canonical `payload`.
- **Files modified:** `spec/event-schema.md`
- **Verification:** Event schema grep checks passed, including payload-boundary assertions.
- **Committed in:** `526660b`

---

**Total deviations:** 3 auto-fixed (Rule 1: 1, Rule 2: 1, Rule 3: 1)
**Impact on plan:** Spec semantics match Phase 1 decisions and all automated acceptance checks pass.

## Issues Encountered

- The executor worktree did not contain `.planning/` because project planning artifacts are local-only and ignored. Read-only planning context was loaded from the main worktree; all created/modified outputs were written only inside `/Users/davinci/Developer/bloclawd-worktrees/01-01`.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

Phase 1 downstream plans can consume the four spec files. Plan 03 should generate `spec/pow-fixtures.json` from these contracts, and Plans 03/04 should ensure Rust and TypeScript fixtures enforce the 72-byte payload-bound PoW input.

## Self-Check: PASSED

- Verified all created files exist: `spec/pow-v1.md`, `spec/payload-canonical.md`, `spec/event-schema.md`, `spec/enums.json`, and this summary.
- Verified task commits exist: `630a1b4`, `aca7605`, `526660b`.
- Re-ran core file existence, JSON parse, and no-standalone-`KV` checks successfully.

---
*Phase: 01-foundations*
*Completed: 2026-04-30*
