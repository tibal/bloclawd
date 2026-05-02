---
phase: 03-rust-cli
plan: 07
subsystem: cli-orchestration-fixtures
tags: [orchestration, fixtures, xtask-anonymizer, readme, e2e]

requires:
  - phase: 03-00
    provides: CLI-19 requirement and project rationale amendments
  - phase: 03-04
    provides: CC/Codex parsers, min-version checks, and token aggregation
  - phase: 03-05
    provides: canonical bytes, PoW solve, submit helpers, and wire errors
  - phase: 03-06
    provides: provider probe, dry-run renderer, and JSON renderer
provides:
  - Full `bloclawd` CLI orchestration from local parse to optional submit
  - Deterministic in-process fixture E2E tests for CC and Codex
  - Committed anonymized CC and Codex golden fixtures
  - `xtask anonymize-session` for deterministic fixture generation
  - README usage, install path, min-version, and privacy documentation
affects: [04-ingest-worker, 05-threat-model]

tech-stack:
  added:
    - chrono and zstd to xtask lock dependencies
  patterns:
    - writer-backed `run_inner_with_output` for deterministic E2E tests
    - single submission group UUID per process, event UUID provider per event
    - dry-run returns before probe/network
    - fixture snapshots lock canonical human output and aggregate token totals

key-files:
  created:
    - crates/cli/tests/fixtures_e2e.rs
    - crates/cli/tests/fixtures/cc/sample.jsonl
    - crates/cli/tests/fixtures/cc/sample.expected.json
    - crates/cli/tests/fixtures/cc/sample.expected.dryrun.txt
    - crates/cli/tests/fixtures/codex/sample.jsonl
    - crates/cli/tests/fixtures/codex/sample.expected.json
    - crates/cli/tests/fixtures/codex/sample.expected.dryrun.txt
    - README.md
  modified:
    - crates/cli/src/lib.rs
    - xtask/src/anonymize_session.rs
    - xtask/src/main.rs
    - xtask/Cargo.toml
    - Cargo.lock

requirements-completed: [CLI-11, CLI-12, CLI-17, CLI-18, CLI-19]

duration: 34min
completed: 2026-05-02
---

# Phase 03 Plan 07: Orchestration and Fixtures Summary

**The Rust CLI is now wired end-to-end, with deterministic fixture coverage and documented user-facing usage.**

## Performance

- **Duration:** 34 min
- **Tasks:** 3 completed
- **Files modified:** 13

## Accomplishments

- Implemented `lib::run`, `run_inner`, and `run_inner_with_output` orchestration for parse -> aggregate -> fan-out -> dry-run -> consent -> challenge fetch -> PoW solve -> probe once -> submit -> render.
- Generated one `submission_group_id` per invocation and UUIDv4 event IDs per event; fixture tests inject deterministic UUIDs without changing production behavior.
- Enforced `--cc`/`--codex` selection, missing tier/config errors, tier/provider mismatch errors, no-events exit 2, and v1 `--week` submit rejection.
- Added CC and Codex fixture E2E tests that assert zero parse failures, exact aggregate token totals, dry-run snapshot stability, dry-run no-network behavior, config tier save/load, and UUIDv4 event IDs.
- Added `xtask anonymize-session` for plain JSONL and `.zst` JSONL inputs, preserving model/token shape while replacing prompts, paths, UUIDs, and timestamps deterministically.
- Added `README.md` with install path, supported session paths, `MIN_CC_VERSION`, `MIN_CODEX_VERSION`, dry-run/submit examples, tier mapping, anonymizer usage, privacy notes, and exit codes.

## Task Commits

1. **Task 1 RED: fixture orchestration tests** - `f741e4d`
2. **Task 1 GREEN: CLI orchestration** - `15e1846`
3. **Task 2 RED: anonymize-session tests** - `918c296`
4. **Task 2 GREEN: anonymize-session command** - `e36de2c`
5. **Task 3 DOCS: CLI README** - `ad969cb`
6. **Formatting cleanup** - `69d3f85`

## Files Created/Modified

- `crates/cli/src/lib.rs` - Full orchestration entry points and submit sequence.
- `crates/cli/tests/fixtures_e2e.rs` - In-process fixture and orchestration tests.
- `crates/cli/tests/fixtures/cc/sample.*` - CC anonymized fixture, expected aggregate totals, and dry-run snapshot.
- `crates/cli/tests/fixtures/codex/sample.*` - Codex anonymized fixture, expected aggregate totals, and dry-run snapshot.
- `xtask/src/anonymize_session.rs` - Deterministic session anonymizer and tests.
- `xtask/src/main.rs` - `anonymize-session` subcommand dispatch.
- `xtask/Cargo.toml` / `Cargo.lock` - xtask support dependencies.
- `README.md` - CLI usage and supported-version documentation.

## Fixture Locks

- CC fixture totals: `claude-sonnet-4-5` input 150, output 275, cached read 14, cached write 8 for both 5-minute and 5-hour slots.
- Codex fixture totals: `gpt-5.5` input 500, output 90, cached read 48, cached write 0 for both 5-minute and 5-hour slots.
- Dry-run fixture tests assert committed text snapshots byte-for-byte.

## Decisions Made

- Plan 03-00 owns `REQUIREMENTS.md` and `PROJECT.md` amendments for CLI-19; this plan did not touch those files.
- Submit paths always aggregate with `WindowKind::FiveHour` in v1; `--week` remains dry-run-only and returns a user error for submit.
- JSON dry-run emits a single JSON object and returns before network/probe, matching the human dry-run safety boundary.
- The anonymizer canonicalizes input paths before reading and writes through a temporary file before rename.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered from a stalled executor**
- **Found during:** Wave 5 execution.
- **Issue:** The spawned executor committed orchestration and anonymizer test work but stalled before completing the anonymizer implementation, README, and SUMMARY artifact.
- **Fix:** Orchestrator completed the remaining implementation inline, verified it, and committed the missing docs.
- **Files modified:** `xtask/src/anonymize_session.rs`, `xtask/src/main.rs`, `Cargo.lock`, `README.md`, `.planning/phases/03-rust-cli/03-07-orchestration-fixtures-SUMMARY.md`
- **Verification:** Focused fixture/anonymizer tests, xtask smoke, full workspace build/test, and manual grep gates passed.

---

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No scope reduction; all plan must-haves are present.

## Verification

- `cargo test -p bloclawd-cli --test fixtures_e2e -- --nocapture` passed: 13 tests.
- `cargo test -p xtask anonymize_session -- --nocapture` passed: 5 tests.
- `cargo run -p xtask -- anonymize-session --harness cc --input crates/cli/tests/fixtures/cc/sample.jsonl --output /tmp/bloclawd-test-anon-cc.jsonl` plus non-empty output smoke passed.
- `cargo build --workspace` passed.
- `cargo test --workspace` passed: 205 passed, 2 ignored.
- Manual sensitive-log grep for `event_id`, `nonce`, and `submission_group_id` log emitters returned no matches.
- Manual `Uuid::new_v7` grep over CLI code returned no matches.
- Manual `REQUIREMENTS.md` / `PROJECT.md` diff check returned no changes from this plan.

## User Setup Required

Before a public release, run `bloclawd --cc --tier max20 --end <time> --5h --dry-run` and the equivalent Codex dry-run against current real local session artifacts to confirm producer field shapes still match the pinned minimum versions.

## Next Phase Readiness

Ready for Phase 04: the CLI can produce canonical payloads, solve PoW, probe provider rate-limit state, and submit through the Worker wire helpers.

## Self-Check: PASSED

- Found created files: fixture E2E test, CC/Codex fixture triplets, README.
- Found task commits: `f741e4d`, `15e1846`, `918c296`, `e36de2c`, `ad969cb`.
- Found no `## Self-Check: FAILED` marker.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
