---
phase: 03-rust-cli
plan: 04
subsystem: cli-parsers
tags: [parsers, defensive-jsonl, aggregate, min-version, zstd]

requires:
  - phase: 03-03
    provides: bloclawd-cli workspace scaffold and module surface
provides:
  - Defensive CC JSONL parser and walker
  - Defensive Codex JSONL parser and walker with .zst decode
  - Min-version field-shape predicates for CC and Codex
  - Per-model TokenCounts aggregation with 5-minute burst and window-total slots
affects: [03-05-wire-glue, 03-06-probe-render, 03-07-orchestration-fixtures]

tech-stack:
  added: []
  patterns:
    - serde_json::Value walks for upstream JSONL
    - turn_context model tracking for Codex token_count events
    - dense 5-minute rolling-window aggregation

key-files:
  created:
    - crates/cli/src/parsers/mod.rs
    - crates/cli/src/parsers/cc.rs
    - crates/cli/src/parsers/codex.rs
    - crates/cli/src/aggregate.rs
    - crates/cli/src/min_version.rs
  modified:
    - crates/cli/src/lib.rs

key-decisions:
  - "`_5min` means max 5-minute rolling burst inside the selected window."
  - "`_5h` means total over the selected window for the submit-supported five-hour path."
  - "Codex output includes reasoning_output_tokens in output and has cached_write fixed to zero."

patterns-established:
  - "Upstream JSONL remains loose and defensive; Worker wire parsing remains strict."
  - "Codex model attribution is stateful: latest turn_context applies to subsequent token_count lines."

requirements-completed: [CLI-03, CLI-04, CLI-05, CLI-06, CLI-18]

duration: 18min
completed: 2026-05-02
---

# Phase 03 Plan 04: Parsers and Aggregate Summary

**The CLI can now extract CC and Codex token events defensively, validate expected field shapes, and aggregate per-model token counts.**

## Performance

- **Duration:** 18 min
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments

- Added `parsers::cc` with discovery, mtime pre-filter, defensive line parsing, requestId deduplication, window filtering, and parse-failure counting.
- Added `min_version` constants and field-shape predicates: `MIN_CC_VERSION = "2.1.89"` and `MIN_CODEX_VERSION = "0.125.0"`.
- Added `parsers::codex` with rollout discovery, transparent `.jsonl.zst` decode, `turn_context` model tracking, `last_token_usage` extraction, reasoning-as-output, and null-info skips.
- Added `aggregate` to fan out per model, skip zero-token models, reject submit-time `WindowKind::Week`, and produce `TokenCounts`.

## Task Commits

1. **Task 1 RED: CC parser and min-version tests** - `d86cc73`
2. **Task 1 GREEN: CC parser and min-version checks** - `a825921`
3. **Task 2 RED: Codex parser and aggregate tests** - `bd406ed`
4. **Task 2 GREEN: Codex parser and token aggregation** - `f346022`

## Files Created/Modified

- `crates/cli/src/parsers/mod.rs` - Parser module declarations.
- `crates/cli/src/parsers/cc.rs` - CC parser, walker, dedup, and tests.
- `crates/cli/src/parsers/codex.rs` - Codex parser, walker, `.zst` open path, and tests.
- `crates/cli/src/min_version.rs` - Pinned min-version constants and field-shape predicates.
- `crates/cli/src/aggregate.rs` - Per-model token aggregation and tests.
- `crates/cli/src/lib.rs` - Module exports.

## Decisions Made

- `_5min` is the densest 5-minute rolling burst inside the selected window.
- `_5h` is the cumulative total over the selected submit-supported window.
- `gpt-5.5` is parsed end-to-end through `Model::Gpt55`, proving the Plan 01 enum dependency works for Codex sessions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered from a stalled executor**
- **Found during:** Wave 3 execution.
- **Issue:** The spawned executor created the RED tests and CC GREEN commit, then stopped before the Codex and aggregate GREEN implementation.
- **Fix:** Orchestrator closed the stalled executor and completed only the missing Codex parser and aggregate implementation inline.
- **Files modified:** `crates/cli/src/parsers/codex.rs`, `crates/cli/src/aggregate.rs`
- **Verification:** `cargo test -p bloclawd-cli --lib` and `cargo build -p bloclawd-cli` passed.
- **Committed in:** `f346022`

---

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No scope change; the planned tests and implementation are present.

## Verification

- `cargo test -p bloclawd-cli --lib` passed: 61 passed, 1 ignored.
- `cargo build -p bloclawd-cli` passed.
- `cargo test -p bloclawd-cli --lib parsers::codex` passed: 10 tests.
- `cargo test -p bloclawd-cli --lib aggregate` passed: 7 tests.
- Defensive parser grep passed: no strict wire structs, no line-content logging, and no cumulative Codex usage-field literal.
- `pub fn aggregate` count is exactly 1.

## User Setup Required

None.

## Next Phase Readiness

Ready for `03-05-wire-glue`: parsers now produce model-attributed CC and Codex events, and aggregation returns the `TokenCounts` shape required by the wire formatter.

## Self-Check: PASSED

- Found created files: `crates/cli/src/parsers/mod.rs`, `crates/cli/src/parsers/cc.rs`, `crates/cli/src/parsers/codex.rs`, `crates/cli/src/aggregate.rs`, `crates/cli/src/min_version.rs`.
- Found task commits: `d86cc73`, `a825921`, `bd406ed`, `f346022`.
- Found no `## Self-Check: FAILED` marker.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
