---
phase: 03-rust-cli
plan: 06
subsystem: cli-probe-render
tags: [probe, cli-19, render, dry-run, json-output]

requires:
  - phase: 03-04
    provides: parsed and aggregated token events
  - phase: 03-05
    provides: canonical formatter, SubmittedEvent wire glue, and IngestCliError
provides:
  - CLI-19 provider harness probe with opaque convergence
  - Rate-limit signature classifiers for Claude Code and Codex
  - ASCII-only dry-run renderer
  - --json single-object renderer
affects: [03-07-orchestration-fixtures]

tech-stack:
  added: []
  patterns:
    - one-shot current-thread tokio runtime for subprocess probing
    - lowercased stdout+stderr substring classification with exclusions first
    - canonical pretty output derived from canonical formatter path

key-files:
  created:
    - crates/cli/src/probe.rs
    - crates/cli/src/probe_sig.rs
    - crates/cli/src/render.rs
  modified:
    - crates/cli/src/lib.rs

key-decisions:
  - "Probe argv is bare UUIDv4 only: claude --print <uuid> or codex exec <uuid>."
  - "All non-rate-limit probe outcomes converge to ProbeOutcome::Converge."
  - "Render output is structurally plain ASCII; no force_plain runtime switch exists."

patterns-established:
  - "Probe code contains no log emitters."
  - "Render code returns strings; callers own stdout/stderr routing."

requirements-completed: [CLI-13, CLI-14, CLI-19]

duration: 13min
completed: 2026-05-02
---

# Phase 03 Plan 06: Probe and Render Summary

**The CLI now has the opaque CLI-19 probe and a single render layer for human dry-run and machine JSON output.**

## Performance

- **Duration:** 13 min
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added `probe_sig.rs` with the research-pinned Claude Code and Codex rate-limit token and exclusion lists.
- Added `probe.rs` with bare UUIDv4 probe prompts, `BLOCLAWD_*` env scrubbing, 30-second timeout, subprocess output classification, and convergence behavior.
- Added `render.rs` for ASCII dry-run tables, per-event pretty JSON, and the D-72 single-object JSON shape.
- Exported `probe`, `probe_sig`, and `render` from the CLI library.

## Task Commits

1. **Task 1 RED: probe tests** - `4ead439`
2. **Task 1 GREEN: probe rate-limit gate** - `9bf1968`
3. **Task 2 RED: render tests** - `2b140b3`
4. **Task 2 GREEN: dry-run and JSON renderers** - `ca18f46`

## Files Created/Modified

- `crates/cli/src/probe_sig.rs` - CC/Codex signature constants and classifiers.
- `crates/cli/src/probe.rs` - Probe command construction, env scrubber, tokio timeout, and outcome convergence.
- `crates/cli/src/render.rs` - Dry-run and JSON renderers.
- `crates/cli/src/lib.rs` - Module exports.

## Decisions Made

- The Claude Code tokens are: `usage limit reached`, `5-hour limit reached`, `weekly limit reached`, `limit reached`, and `rate limit reached`; exclusions are `server is temporarily limiting` and `anthropic_api_key`.
- The Codex tokens are: `hit your usage limit`, `usage limit reached`, and `rate limit reached`; exclusion is `openai_api_key`.
- `probe.rs` has zero log emitters, and production argv construction contains no bloclawd-identifying argument.
- `render.rs` uses ASCII pipes and dashes only; no ANSI or Unicode box drawing is emitted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered from a stalled executor**
- **Found during:** Wave 4 execution.
- **Issue:** The spawned executor committed all code tasks but shut down before creating the required SUMMARY artifact.
- **Fix:** Orchestrator verified the committed implementation and created this summary artifact.
- **Files modified:** `.planning/phases/03-rust-cli/03-06-probe-render-SUMMARY.md`
- **Verification:** probe/render focused tests, full CLI lib tests, and CLI build passed.

---

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No code scope change; missing metadata was added.

## Verification

- `cargo test -p bloclawd-cli --lib probe` passed: 19 tests.
- `cargo test -p bloclawd-cli --lib render` passed: 11 tests.
- `cargo test -p bloclawd-cli --lib` passed: 116 passed, 2 ignored.
- `cargo build -p bloclawd-cli` passed.
- Manual probe log-emitter grep returned no matches.
- Manual render log-boundary grep for event id, nonce, and submission group id emitters returned no matches.
- CLI-10 byte-equality tests passed for rendered request JSON against canonical `SubmittedEvent` bytes.

## User Setup Required

Before tagging a release, run the RESEARCH §3 pin-at-implementation-time check on a real rate-limited machine or cassette:

`claude --print "00000000-0000-4000-8000-000000000000"`

Compare the actual stdout+stderr with the committed `probe_sig.rs` token list. This is an operator follow-up, not a blocker for this plan.

## Next Phase Readiness

Ready for `03-07-orchestration-fixtures`: all parser, wire, probe, and render modules are present for full CLI orchestration.

## Self-Check: PASSED

- Found created files: `crates/cli/src/probe.rs`, `crates/cli/src/probe_sig.rs`, `crates/cli/src/render.rs`.
- Found task commits: `4ead439`, `9bf1968`, `2b140b3`, `ca18f46`.
- Found no `## Self-Check: FAILED` marker.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
