---
phase: 04-aggregation-dashboard
plan: 04
subsystem: cli
tags: [rust, clap, fixtures, limit-type, submitted-event]

requires:
  - phase: 04-01
    provides: event_schema::LimitType and SubmittedEvent.limit_type wire envelope field
provides:
  - CLI limit_type derivation from existing --5h/--week ArgGroup
  - SubmittedEvent.limit_type population for dry-run and submit paths
  - BLOCLAWD_REGEN_FIXTURES fixture regeneration mode
  - Regenerated CC and Codex fixtures containing "limit_type": "5h"
affects: [cli-fixtures, worker-event-amendment, cron-limit-type-tests, dashboard-data-contract]

tech-stack:
  added: []
  patterns: [clap-arggroup-derived-wire-field, fixture-regen-env-var, payload-only-canonical-boundary]

key-files:
  created:
    - .planning/phases/04-aggregation-dashboard/04-04-SUMMARY.md
  modified:
    - crates/cli/src/cli.rs
    - crates/cli/src/lib.rs
    - crates/cli/src/submit.rs
    - crates/cli/src/canonical.rs
    - crates/cli/src/render.rs
    - crates/cli/tests/fixtures_e2e.rs
    - crates/cli/tests/fixtures/cc/sample.expected.dryrun.txt
    - crates/cli/tests/fixtures/cc/sample.expected.json
    - crates/cli/tests/fixtures/codex/sample.expected.dryrun.txt
    - crates/cli/tests/fixtures/codex/sample.expected.json

key-decisions:
  - "Implemented Args::limit_type(&self) -> LimitType instead of adding a new CLI flag or value enum."
  - "Kept crates/cli/src/canonical.rs::canonicalize as pub fn canonicalize(payload: &EventPayload) -> Result<Vec<u8>> so limit_type remains outside payload JCS bytes."
  - "Wrapped fixture expected JSON as { limit_type, tokens } because existing expected JSON fixtures represented token totals, not submitted envelopes."

patterns-established:
  - "BLOCLAWD_REGEN_FIXTURES=1 cargo test -p bloclawd-cli --test fixtures_e2e --locked regenerates dry-run and token fixtures from the live formatter/parser paths."

requirements-completed: [CLI-10, CLI-17]

duration: 7min
completed: 2026-05-02
---

# Phase 04 Plan 04: CLI Fixture Regen Summary

**CLI submitted-event envelopes now derive limit_type from --5h/--week and fixtures regenerate with the new wire field.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-02T18:24:24Z
- **Completed:** 2026-05-02T18:31:26Z
- **Tasks:** 1 TDD task
- **Files modified:** 11

## Accomplishments

- Added `Args::limit_type(&self) -> LimitType`, mapping `--5h` to `LimitType::FiveH` and `--week` to `LimitType::Weekly`.
- Threaded `limit_type` into all CLI `SubmittedEvent` construction paths, including dry-run fixture orchestration and submit helper tests.
- Preserved the payload canonical boundary in `crates/cli/src/canonical.rs` as `pub fn canonicalize(payload: &EventPayload) -> Result<Vec<u8>>`.
- Added `BLOCLAWD_REGEN_FIXTURES` regen mode and regenerated all four committed CC/Codex fixture outputs with `"limit_type": "5h"`.

## Task Commits

1. **RED: CLI limit_type behavior test** - `5316d77` (test)
2. **GREEN: limit_type wiring + fixture regen** - `f795a9c` (feat)

## Files Created/Modified

- `crates/cli/src/cli.rs` - Adds `Args::limit_type(&self) -> LimitType` and the parse-to-limit-type unit test.
- `crates/cli/src/lib.rs` - Sets each dry-run/submit `SubmittedEvent.limit_type` from parsed args.
- `crates/cli/src/submit.rs` - Adds `LimitType` to `build_submit_body` and asserts it stays top-level.
- `crates/cli/src/canonical.rs` - Adds D-84 comment while preserving `canonicalize(&EventPayload)`.
- `crates/cli/src/render.rs` - Updates test fixture event construction for the new required field.
- `crates/cli/tests/fixtures_e2e.rs` - Adds `BLOCLAWD_REGEN_FIXTURES` mode for dry-run and expected JSON files.
- `crates/cli/tests/fixtures/{cc,codex}/sample.expected.*` - Regenerated fixtures with `"limit_type": "5h"`.
- `.planning/phases/04-aggregation-dashboard/04-04-SUMMARY.md` - Execution record.

## Regeneration Command

`BLOCLAWD_REGEN_FIXTURES=1 cargo test -p bloclawd-cli --test fixtures_e2e --locked`

The plan text used `-p cli`, but the actual Cargo package is `bloclawd-cli`; all verification used the real package name.

## TDD Gate Compliance

- RED commit present: `5316d77` (`test(04-04): add failing test for CLI limit type`).
- GREEN commit present after RED: `f795a9c` (`feat(04-04): wire CLI limit type into submitted events`).
- Refactor commit: not needed.

## Decisions Made

- Used the plan-recommended inherent method `Args::limit_type(&self) -> LimitType`.
- Added fixture regen support because `fixtures_e2e.rs` did not have an existing regen mode.
- Kept `sample.expected.json` useful for token-total assertions by nesting existing totals under `tokens` and adding sibling `limit_type`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted expected JSON fixture shape**
- **Found during:** Task 1 (fixture regeneration)
- **Issue:** The plan required both `sample.expected.json` files to contain `"limit_type": "5h"`, but the existing tests used those files as raw model-token maps.
- **Fix:** Regenerated expected JSON as `{ "limit_type": "5h", "tokens": { ... } }` and updated the fixture test generator/assertion accordingly.
- **Files modified:** `crates/cli/tests/fixtures_e2e.rs`, `crates/cli/tests/fixtures/{cc,codex}/sample.expected.json`
- **Verification:** `cargo test -p bloclawd-cli --test fixtures_e2e --locked` passed.
- **Committed in:** `f795a9c`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** Required to satisfy the plan's four-fixture `limit_type` requirement without losing existing token-total fixture coverage.

## Issues Encountered

- `cargo test -p cli ...` from the plan cannot run because the workspace package is named `bloclawd-cli`. Equivalent `cargo test -p bloclawd-cli ...` commands passed.
- Concurrent orchestrator-owned `.planning/ROADMAP.md` and `.planning/STATE.md` changes were present before summary creation and were left unstaged.

## Verification

- `cargo fmt --all --check` - PASS.
- `cargo test -p bloclawd-cli --lib cli_window_flag_drives_limit_type --locked` - PASS, 1 passed.
- `cargo test -p bloclawd-cli --locked` - PASS, 134 passed, 2 ignored.
- `BLOCLAWD_REGEN_FIXTURES=1 cargo test -p bloclawd-cli --test fixtures_e2e --locked` - PASS, 13 passed.
- `cargo test -p bloclawd-cli --test fixtures_e2e --locked` - PASS, 13 passed.
- Fixture idempotence checksum check around a second regen run - PASS, no checksum diff.
- `cargo test -p event-schema --tests --locked` - PASS, 58 passed.
- `cargo test -p bloclawd-worker --locked` - PASS, 26 passed.
- `rg '"limit_type": "5h"'` over all four fixture files - PASS, all four matched.
- `rg 'pub fn canonicalize\(payload: &EventPayload\) -> Result<Vec<u8>>' crates/cli/src/canonical.rs` - PASS.
- `rg 'wire-envelope field and MUST NOT|EventPayload` parameter' crates/cli/src/canonical.rs` - PASS.
- `rg 'limit_type' crates/cli/` - PASS, found CLI method, submit/lib wiring, canonical comment, and fixture hits.

## Known Stubs

None - stub scan found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty UI values in plan-modified files.

## Threat Flags

None. No new network endpoints, auth paths, file trust boundaries beyond the planned local fixture regeneration mode, or schema changes were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-05+ can construct CLI-generated fixtures with `Args::limit_type(&self) -> LimitType`, and Worker/cron follow-up plans can rely on CLI dry-run and submit envelopes carrying the top-level `limit_type`.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/04-aggregation-dashboard/04-04-SUMMARY.md`.
- Task commits `5316d77` and `f795a9c` exist in git history.
- Plan-owned code and fixture files were committed before summary creation.
- `.planning/STATE.md` and `.planning/ROADMAP.md` remained unstaged.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
