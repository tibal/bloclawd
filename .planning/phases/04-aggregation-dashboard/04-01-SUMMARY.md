---
phase: 04-aggregation-dashboard
plan: 01
subsystem: shared-types
tags: [rust, event-schema, ts-rs, aggregation, pricing, ci]

requires:
  - phase: 04-00
    provides: Phase 4 docs amendments and limit_type contract
provides:
  - LimitType, TokenType, and Window closed enums in event-schema
  - SubmittedEvent.limit_type wire envelope field outside JCS payload bytes
  - Log bin edges and bin_index helper for cron percentile fallback
  - MODEL_PRICES prior table and lookup helper for cron ridge fitting
  - ts-rs generated bindings for new shared types
  - xtask gen-canonical-fixture for frontend canonical-byte fixtures
affects: [worker-event-amendment, cli-fixture-regen, cron-aggregate, cron-percentile, frontend-r2-canonical, frontend-filters]

tech-stack:
  added: []
  patterns: [closed-serde-enums, ts-rs-bindings, curated-const-tables, log-boundary-grep]

key-files:
  created:
    - crates/event-schema/src/log_bins.rs
    - crates/event-schema/src/model_prices.rs
    - apps/web/src/generated/LimitType.ts
    - apps/web/src/generated/TokenType.ts
    - apps/web/src/generated/Window.ts
  modified:
    - crates/event-schema/src/enums.rs
    - crates/event-schema/src/wire.rs
    - crates/event-schema/src/lib.rs
    - apps/web/src/generated/SubmittedEvent.ts
    - apps/web/src/generated/index.ts
    - .github/workflows/pow.yml
    - xtask/src/main.rs
    - xtask/Cargo.toml
    - Cargo.lock

key-decisions:
  - "TokenType and Window keep ts-rs exports because Task 1 required TS derives; index.ts exports them alongside LimitType."
  - "MODEL_PRICES uses the same price for FiveMin and FiveH windows; these windows are aggregation windows, not provider cache TTLs."
  - "Gpt5Codex uses GPT-5 API token pricing as the public-pricing fallback because OpenAI identifies it as a GPT-5 coding variant but does not list a separate API rate on the main pricing page."

patterns-established:
  - "New event-schema shared constants expose namespace-safe root re-exports."
  - "Curated pricing rows are kept one tuple per source row with a completeness test."

requirements-completed: [AGGR-12]

duration: 16min
completed: 2026-05-02
---

# Phase 04 Plan 01: Shared Types Summary

**Shared aggregation contracts for limit-type filtering, log-bin percentile fallback, and model-price priors**

## Performance

- **Duration:** 16 min
- **Started:** 2026-05-02T18:01:46Z
- **Completed:** 2026-05-02T18:17:50Z
- **Tasks:** 5
- **Files modified:** 14

## Accomplishments

- Added `LimitType`, `TokenType`, and `Window` closed enums with serde/ts-rs coverage.
- Added required top-level `SubmittedEvent.limit_type` and tests proving it stays outside payload canonical bytes.
- Added `log_bins.rs` with 19 powers-of-two edges and a clamped `bin_index` helper.
- Added a complete 56-row `MODEL_PRICES` table for 7 models x 4 token types x 2 windows.
- Regenerated TypeScript bindings, extended the generated barrel, extended the log-boundary grep, and added `xtask gen-canonical-fixture`.

## Task Commits

Each TDD task has RED and GREEN commits:

1. **Task 1 RED:** `44dc77a` test(04-01): add failing tests for shared enums
2. **Task 1 GREEN:** `805efe6` feat(04-01): add shared limit and pricing enums
3. **Task 2 RED:** `ce83796` test(04-01): add failing tests for limit_type envelope field
4. **Task 2 GREEN:** `65abd78` feat(04-01): require limit_type on submitted events
5. **Task 3 RED:** `1010f5c` test(04-01): add failing tests for log bin helper
6. **Task 3 GREEN:** `d1ab6e9` feat(04-01): add log bin edges and index helper
7. **Task 4 RED:** `d6c3ae9` test(04-01): add failing tests for model price priors
8. **Task 4 GREEN:** `1b70cfb` feat(04-01): add model pricing prior table
9. **Task 5:** `a9a36ea` feat(04-01): regenerate bindings and extend log gate

## Files Created/Modified

- `crates/event-schema/src/enums.rs` - Adds `LimitType`, `TokenType`, and `Window`.
- `crates/event-schema/src/wire.rs` - Adds required `limit_type` envelope field and JCS-isolation tests.
- `crates/event-schema/src/log_bins.rs` - Adds `EDGES` and `bin_index`.
- `crates/event-schema/src/model_prices.rs` - Adds `MODEL_PRICES`, `lookup`, and completeness tests.
- `crates/event-schema/src/lib.rs` - Re-exports new shared types, log-bin helpers, and pricing helpers.
- `apps/web/src/generated/*.ts` - Regenerated ts-rs output for `LimitType`, `TokenType`, `Window`, and `SubmittedEvent`.
- `.github/workflows/pow.yml` - Extends both log-boundary grep patterns with `limit_type`.
- `xtask/src/main.rs` - Adds `gen-canonical-fixture <input.json> <output.bytes.txt>`.
- `xtask/Cargo.toml`, `Cargo.lock` - Adds direct `event-schema` and `hex` deps needed by the xtask command.

## LogBins Edges

`LOG_BIN_EDGES` / `log_bins::EDGES`:

```text
[1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456]
```

## Model Price Snapshot

Prices are USD per token, captured 2026-05-02 from Anthropic and OpenAI public pricing pages.

| Model | Input | Output | Cached Read | Cached Write |
| --- | ---: | ---: | ---: | ---: |
| `ClaudeOpus47` | `5e-6` | `25e-6` | `0.5e-6` | `6.25e-6` |
| `ClaudeSonnet46` | `3e-6` | `15e-6` | `0.3e-6` | `3.75e-6` |
| `ClaudeSonnet45` | `3e-6` | `15e-6` | `0.3e-6` | `3.75e-6` |
| `ClaudeHaiku45` | `1e-6` | `5e-6` | `0.1e-6` | `1.25e-6` |
| `Gpt5` | `1.25e-6` | `10e-6` | `0.125e-6` | `1.25e-6` |
| `Gpt55` | `5e-6` | `30e-6` | `0.5e-6` | `5e-6` |
| `Gpt5Codex` | `1.25e-6` | `10e-6` | `0.125e-6` | `1.25e-6` |

Each model has the same four values for both `Window::FiveMin` and `Window::FiveH`, for 8 rows per model and 56 rows total.

Sources:
- https://www.anthropic.com/claude/opus
- https://www.anthropic.com/claude/sonnet
- https://platform.claude.com/docs/en/about-claude/pricing
- https://openai.com/api/pricing/
- https://platform.openai.com/docs/models/gpt-5

## Regeneration Commands

- `cargo test --features ts-export -p event-schema --locked`
- `cargo run -p xtask -- gen-canonical-fixture <input.json> <output.bytes.txt>`

## Decisions Made

- Exported `TokenType` and `Window` from `apps/web/src/generated/index.ts` because they are emitted by ts-rs after Task 1's required `#[ts(export)]` derives.
- Preserved compact one-row-per-price formatting in `MODEL_PRICES` using `#[rustfmt::skip]` so the grep-count acceptance check remains stable and audit-friendly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added xtask direct dependencies**
- **Found during:** Task 5 (Regenerate ts-rs bindings + CI gate + xtask)
- **Issue:** `cargo build -p xtask --locked` failed because `xtask` referenced `event_schema` and `hex` without declaring direct dependencies; adding them required `Cargo.lock` refresh.
- **Fix:** Added `event-schema` and `hex` to `xtask/Cargo.toml`, updated `Cargo.lock`, then reran the locked build.
- **Files modified:** `xtask/Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo build -p xtask --locked` passed.
- **Committed in:** `a9a36ea`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** Required for the planned `xtask gen-canonical-fixture` target to compile; no scope expansion beyond the target's direct dependencies.

## Issues Encountered

- `cargo test` generates ts-rs files whenever exported types compile because `TS_RS_EXPORT_DIR` is configured globally. New `TokenType.ts` and `Window.ts` were committed with `LimitType.ts` to keep the drift gate clean.
- Other agents committed Phase 04-00 documentation changes while this plan executed; those commits were left untouched and are not part of this plan summary.

## Known Stubs

None.

## Threat Flags

None. The new xtask file-read/write path was explicitly planned by Task 5 and is local developer tooling only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 plans can now consume:

- `event_schema::LimitType` for worker/CLI wire amendments.
- `event_schema::MODEL_PRICES` and `model_price_lookup` for cron ridge prior fitting.
- `event_schema::LOG_BIN_EDGES` and `log_bin_index` for percentile fallback encoding.
- `apps/web/src/generated/LimitType.ts` for frontend filters.

## Self-Check: PASSED

- Created files exist: `log_bins.rs`, `model_prices.rs`, generated `LimitType.ts`, `TokenType.ts`, `Window.ts`, and this summary.
- All task commits exist in git history: `44dc77a`, `805efe6`, `ce83796`, `65abd78`, `1010f5c`, `d1ab6e9`, `d6c3ae9`, `1b70cfb`, `a9a36ea`.
- Verification commands listed above passed after the final task commit.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
