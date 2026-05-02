---
phase: 03-rust-cli
verified: 2026-05-02T00:00:00Z
status: human_needed
score: "19/19 implementation requirements verified; 1 live submit UAT pending"
overrides_applied: 0
deferred:
  - truth: "Release-build matrix for darwin-arm64, darwin-x64, and linux-x64-musl"
    addressed_in: "Phase 5 distribution/signing"
    evidence: "Phase 3 produced the `bloclawd` Rust bin target with static-link-friendly rustls dependencies; release packaging and target matrix are Phase 5 scope."
  - truth: "Rate-limit signature cassette from a genuinely rate-limited harness"
    addressed_in: "Pre-release operator verification"
    evidence: "Probe signatures are implemented from Phase 3 research and covered by classifier tests; live provider wording must be re-pinned before public release."
human_verification:
  - test: "Real rate-limited CLI submit"
    expected: "On a machine with a real CC or Codex provider limit already reached, `bloclawd --cc --tier max20 --end <local-time> --5h --yes` or `bloclawd --codex --tier pro_codex --end <local-time> --5h --yes` prints the dry-run view, solves PoW, recognizes the provider rate-limit probe, submits to the deployed ingest Worker, exits 0, and a row appears in PlanetScale."
    why_human: "Requires a genuinely rate-limited provider account plus deployed Worker/PlanetScale credentials not available to the agent runtime."
    result: "pending"
---

# Phase 3: Rust CLI Verification Report

**Phase Goal:** A user who just hit a rate limit on Claude Code or Codex can run `bloclawd --5h --cc` or `--codex`, see exactly what would be submitted, confirm with `[y/N]`, and have an anonymous, PoW-gated event accepted by the ingest Worker, with defensive parsers that survive CC/Codex format drift.

**Status:** human_needed

Automated implementation verification passes. The remaining item is the live external submit proof, which cannot be performed from this workspace because it requires real provider rate-limit state and deployed ingest/PlanetScale access.

## Goal Achievement

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `crates/cli` builds a `bloclawd` bin target and exposes library entry points for in-process tests. | VERIFIED | `crates/cli/Cargo.toml`; `src/bin/bloclawd.rs`; `cargo build --workspace` passed. |
| 2 | Clap flags include `--cc`, `--codex`, `--tier`, `--end`, `--5h`, `--week`, `--dry-run`, `--yes`, `--json`, `--no-color`, `--verbose`, `--help`, and `--version`. | VERIFIED | `cli.rs`; help tests pass in `cargo test --workspace`. |
| 3 | CC parser walks `~/.claude/projects/**/*.jsonl`, parses line-by-line with `serde_json::Value`, skips synthetic lines, dedups `requestId`, filters by timestamp, and counts bad lines. | VERIFIED | `parsers/cc.rs`; focused parser tests passed. |
| 4 | Codex parser walks `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl{,.zst}`, parses line-by-line, tracks `turn_context` model, uses `last_token_usage`, and counts bad lines. | VERIFIED | `parsers/codex.rs`; zstd and model-tracking tests passed. |
| 5 | Aggregator computes per-model 5-minute burst and selected-window totals for input/output/cache fields. | VERIFIED | `aggregate.rs`; fixture totals match committed expected JSON. |
| 6 | Region uses `sys-locale` with `BLOCLAWD_COUNTRY` override and shared country-to-region map. | VERIFIED | `region.rs`; `region_map.rs`; tests pass. |
| 7 | PoW path canonicalizes payload bytes, hashes with SHA-256, solves K=22 with a 30s deadline, and maps timeout to exit 3. | VERIFIED | `canonical.rs`, `solve.rs`, `pow`; tests pass. |
| 8 | Submit path uses blocking `reqwest` with rustls, `https_only(true)`, and default `https://api.bloclawd.com` with env override. | VERIFIED | `submit.rs`, `api.rs`; scheme and endpoint tests pass. |
| 9 | `event_id` and `submission_group_id` are UUIDv4-derived base64url values; no UUIDv7 appears in CLI code. | VERIFIED | `lib.rs`; manual `Uuid::new_v7` grep returned no matches. |
| 10 | Dry-run prints the same `SubmittedEvent` shape that submit sends and returns before network/probe. | VERIFIED | `render.rs`; `fixtures_e2e.rs`; dry-run no-network test passed. |
| 11 | Confirmation prompt is one `[y/N]` for the batch; `--yes` skips it. | VERIFIED | `lib.rs`; orchestration code path present. |
| 12 | `--json` emits a single machine-readable object. | VERIFIED | `render_json` in `render.rs`; render tests pass. |
| 13 | Output is plain ASCII and `--no-color` cannot introduce ANSI/color output. | VERIFIED | `render.rs` tests assert ASCII/no escape sequences. |
| 14 | Exit codes are documented and mapped: 0 success, 1 user error, 2 no events, 3 PoW timeout, 4 server/probe/wire errors. | VERIFIED | `wire_error.rs`; README; tests pass. |
| 15 | CLI-19 probe shells out with bare UUID prompt, strips `BLOCLAWD_*`, matches rate-limit signatures, converges all other outcomes to exit 4, and does not run on dry-run. | VERIFIED | `probe.rs`, `probe_sig.rs`, `lib.rs`; tests and dry-run ordering passed. |
| 16 | Fixture locks cover CC and Codex anonymized sessions with zero parse failures, expected totals, and byte-stable dry-run snapshots. | VERIFIED | `fixtures_e2e.rs`; `cargo test -p bloclawd-cli --test fixtures_e2e -- --nocapture` passed 13 tests. |
| 17 | `xtask anonymize-session` creates deterministic anonymized fixtures from plain or `.zst` JSONL. | VERIFIED | `xtask/src/anonymize_session.rs`; xtask tests and smoke command passed. |
| 18 | Minimum CC and Codex producer shape is documented and asserted with helpful errors. | VERIFIED | `min_version.rs`, `parsers/cc.rs`, `parsers/codex.rs`, README; post-verification fix `cea5c80` added Codex checked parser and helpful shape errors. |
| 19 | No sensitive identifiers are logged by CLI/Worker emitters. | VERIFIED | Manual source grep for `event_id`, `nonce`, and `submission_group_id` log emitters returned no matches; CI log-boundary grep exists. |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CLI-01 | SATISFIED with release-matrix deferred | `bloclawd` bin target builds locally; rustls avoids OpenSSL. Cross-target artifacts belong to Phase 5. |
| CLI-02 | SATISFIED | `cli.rs` clap derive and tests. |
| CLI-03 | SATISFIED | `parsers/cc.rs`. |
| CLI-04 | SATISFIED | `parsers/codex.rs`. |
| CLI-05 | SATISFIED | Parser failure counters and fixture tests. |
| CLI-06 | SATISFIED | `aggregate.rs`; expected fixture totals. |
| CLI-07 | SATISFIED | `region.rs`; `BLOCLAWD_COUNTRY` tests. |
| CLI-08 | SATISFIED | `solve.rs`; submit progress lines in `lib.rs`; timeout test. |
| CLI-09 | SATISFIED | `Uuid::new_v4` in `lib.rs`; no `new_v7`. |
| CLI-10 | SATISFIED | `canonical.rs`; `render.rs`; fixture snapshots. |
| CLI-11 | SATISFIED | `lib.rs` consent gate and `--yes` skip. |
| CLI-12 | SATISFIED | `lib.rs`, clap conflicts, fixture error tests. |
| CLI-13 | SATISFIED | Renderer is plain ASCII/no ANSI; `--no-color` exists. |
| CLI-14 | SATISFIED | `render_json`. |
| CLI-15 | SATISFIED | `wire_error.rs`; README exit code table. |
| CLI-16 | SATISFIED | `submit.rs`; `https_only(true)`. |
| CLI-17 | SATISFIED | Committed fixtures and `fixtures_e2e.rs`. |
| CLI-18 | SATISFIED | README + min-version shape checks in both parsers. |
| CLI-19 | SATISFIED | `probe.rs`, `probe_sig.rs`, orchestration ordering in `lib.rs`. |

## Behavioral Checks

| Check | Result |
|-------|--------|
| `cargo build --workspace` | PASS |
| `cargo test --workspace` | PASS: 207 passed, 2 ignored |
| `cargo test --locked` | PASS: 207 passed, 2 ignored |
| `cargo test -p bloclawd-cli --test fixtures_e2e -- --nocapture` | PASS: 13 tests |
| `cargo test -p bloclawd-cli --lib parsers -- --nocapture` | PASS: 21 tests |
| `cargo test -p xtask anonymize_session -- --nocapture` | PASS: 5 tests |
| `cargo run -p xtask -- anonymize-session --harness cc --input crates/cli/tests/fixtures/cc/sample.jsonl --output /tmp/bloclawd-test-anon-cc.jsonl` | PASS: output non-empty |
| `cargo test -p bloclawd-worker --features staging-smoke --locked` | PASS: 25 passed, 1 ignored |
| `cargo run -p xtask --quiet --locked -- gen-fixtures --check` | PASS: `OK` |
| `cargo test --features ts-export -p event-schema --locked` + generated diff check | PASS: 36 passed, no generated diff |
| Schema drift gate | PASS: `drift_detected=false` |
| Codebase drift gate | SKIPPED: `no-structure-md` |
| Advisory code review gate | NON-BLOCKING ERROR: reviewer timed out with no report |

## Human Verification Required

### 1. Real Rate-Limited CLI Submit

Run on a machine/account that is currently rate-limited by Claude Code or Codex:

```sh
bloclawd --cc --tier max20 --end <local-time> --5h --yes
# or
bloclawd --codex --tier pro_codex --end <local-time> --5h --yes
```

Expected:

- dry-run view prints first;
- stderr shows solve/probe/submit progress;
- provider probe returns a recognized rate-limit signature;
- CLI exits 0;
- ingest Worker accepts the event;
- PlanetScale contains the inserted row.

If the provider account is not genuinely rate-limited, the probe should converge to exit 4 and no event should be submitted.

## Gaps Summary

No automated implementation gaps remain. Phase completion is waiting on the live external submit UAT above.

---
_Verified: 2026-05-02_
_Verifier: orchestrator fallback after verifier-agent timeout_
