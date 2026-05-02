---
phase: 03-rust-cli
plan: 03
subsystem: cli
tags: [cli-scaffold, clap, config-toml, chrono, sys-locale, reqwest]

requires:
  - phase: 03-01
    provides: event-schema Tier, Region, country_to_region, and SubmittedEvent exports
provides:
  - bloclawd-cli workspace member with `bloclawd` bin target
  - clap Args surface for CLI-02, required --end, and required --5h/--week window kind
  - hardcoded TOML tier config helpers at ~/.config/bloclawd/config.toml
  - local-time --end parser and UTC window helper
  - BLOCLAWD_COUNTRY/sys-locale region resolver and API URL helpers
affects: [03-04-parsers-aggregate, 03-05-wire-glue, 03-06-probe-render, 03-07-orchestration-fixtures]

tech-stack:
  added:
    - clap 4.6.1 with derive
    - reqwest 0.13.3 with blocking + rustls
    - sys-locale 0.3.2
    - chrono 0.4.44
    - zstd 0.13.3
    - uuid 1.23.1 with v4 only
    - toml 0.8.23
    - tokio 1.52.1 minimal probe features
    - indicatif 0.18.4
  patterns:
    - lib/bin split with thin clap bin entry
    - CliTier mirror with explicit clap value names and From<CliTier> for event_schema::Tier
    - env mutations in tests guarded by a crate-level test mutex

key-files:
  created:
    - crates/cli/Cargo.toml
    - crates/cli/src/lib.rs
    - crates/cli/src/bin/bloclawd.rs
    - crates/cli/src/cli.rs
    - crates/cli/src/api.rs
    - crates/cli/src/config.rs
    - crates/cli/src/window.rs
    - crates/cli/src/region.rs
  modified:
    - Cargo.toml
    - Cargo.lock

key-decisions:
  - "Kept reqwest on 0.13.3 but used its current `rustls` feature name; 0.13 no longer exposes the older `rustls-tls` feature."
  - "Used a required clap ArgGroup for `--5h`/`--week`, satisfying the B3 missing-window-kind invariant at parse time."
  - "Committed Cargo.lock refresh because adding a workspace member with new dependencies makes locked/reproducible builds otherwise fail."

patterns-established:
  - "CLI scaffold modules stay small and directly tested inline until later parser/submit plans add integration tests."
  - "Local env tests use `crate::ENV_LOCK` because Rust 2024 makes process-env mutation unsafe and global."

requirements-completed: [CLI-01, CLI-02, CLI-07, CLI-13, CLI-15]

duration: 11min
completed: 2026-05-02
---

# Phase 03 Plan 03: CLI Scaffold Summary

**Rust CLI scaffold with clap flag parsing, TOML tier config, local-time window parsing, region resolution, and API URL helpers.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T08:58:23Z
- **Completed:** 2026-05-02T09:09:27Z
- **Tasks:** 2 completed
- **Files modified:** 10

## Accomplishments

- Added `crates/cli` as the `bloclawd-cli` workspace member with a `bloclawd` binary and library entry.
- Implemented clap parsing for every CLI-02 flag plus documented exit codes, required `--end`, `--cc`/`--codex` mutex, and required one-of `--5h`/`--week`.
- Added config, window, region, and API helpers with inline tests covering TOML load/save, local-time parsing, `pro_codex`, and ISO2/locale region resolution.

## Task Commits

1. **Task 1: Add crates/cli workspace scaffold** - `a36bdc6` (feat)
2. **Task 2 RED: config/window/region tests** - `455fda1` (test)
3. **Task 2 GREEN: config/window/region implementation** - `90732a4` (feat)

**Plan metadata:** committed separately in the docs completion commit.

## Files Created/Modified

- `Cargo.toml` - Added `crates/cli` workspace member and CLI dependency pins.
- `Cargo.lock` - Locked new CLI dependency graph for reproducible builds.
- `crates/cli/Cargo.toml` - Defines `bloclawd-cli` lib and `bloclawd` bin target.
- `crates/cli/src/lib.rs` - Public module declarations, `Args` re-export, and scaffold-only `run` stub.
- `crates/cli/src/bin/bloclawd.rs` - Thin clap parse to `bloclawd_cli::run` entrypoint.
- `crates/cli/src/cli.rs` - `Args` and `CliTier` clap derive surface with inline parser tests.
- `crates/cli/src/api.rs` - Production API URL constant and env override helpers.
- `crates/cli/src/config.rs` - Hardcoded TOML tier config path, load, and save helpers.
- `crates/cli/src/window.rs` - Three-format local `--end` parser and UTC window calculation.
- `crates/cli/src/region.rs` - `BLOCLAWD_COUNTRY` and sys-locale region resolver.

## Decisions Made

- Used reqwest `0.13.3` with features `blocking` + `rustls` after current crate metadata showed `rustls-tls` is no longer a 0.13 feature.
- Used clap `ArgGroup` for the required window kind instead of only cross-referenced `required_unless_present` attributes.
- Kept `resolve_region_from_locale` `pub(crate)` so the literal acceptance grep for `pub fn resolve_region` stays unambiguous while unit tests still cover the helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted reqwest 0.13 TLS feature name**
- **Found during:** Task 1 (CLI scaffold)
- **Issue:** `cargo build -p bloclawd-cli --locked` rejected `reqwest = "0.13"` with `rustls-tls`; current reqwest 0.13 exposes `rustls` instead.
- **Fix:** Kept reqwest on `0.13` and changed the feature to `rustls`.
- **Files modified:** `Cargo.toml`, `Cargo.lock`
- **Verification:** `cargo tree -p bloclawd-cli -i reqwest` shows `reqwest v0.13.3`; full build/test pass.
- **Committed in:** `a36bdc6`

**2. [Rule 3 - Blocking] Refreshed Cargo.lock for new workspace member**
- **Found during:** Task 1 (CLI scaffold)
- **Issue:** Locked build failed because `Cargo.lock` did not contain the new CLI dependency graph.
- **Fix:** Ran the build without `--locked` to generate the lock refresh and committed it with the scaffold.
- **Files modified:** `Cargo.lock`
- **Verification:** `cargo build -p bloclawd-cli` and `cargo test -p bloclawd-cli` pass.
- **Committed in:** `a36bdc6`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were dependency-resolution fixes required for the scaffold to build; no architecture or behavior scope changed.

## Issues Encountered

- Parallel 03-02 work committed between this plan's Task 2 RED and GREEN commits. No files overlapped with this plan.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were dirty before summary creation; left untouched per coordination instructions.

## Known Stubs

- `crates/cli/src/lib.rs:11` - `run(args)` intentionally returns the scaffold-only exit path. Plan 07 owns full orchestration.

## TDD Gate Compliance

- Task 2 RED commit `455fda1` produced failing tests before implementation: `cargo test -p bloclawd-cli --lib` reported 10 passed, 16 failed, 1 ignored.
- Task 2 GREEN commit `90732a4` passed after implementation: `cargo test -p bloclawd-cli --lib` reported 26 passed, 1 ignored.

## Verification

- `cargo build -p bloclawd-cli` passed.
- `cargo test -p bloclawd-cli` passed: 26 passed, 1 ignored across lib, bin, and doctest suites.
- `cargo run -p bloclawd-cli --bin bloclawd -- --help` lists all CLI flags and documented exit codes.
- `cargo run -p bloclawd-cli --bin bloclawd -- --version` prints `bloclawd 0.0.1`.
- `cargo run -p bloclawd-cli --bin bloclawd -- --cc --tier max20 --end 16:00 --5h` exits 1 and prints the scaffold-only diagnostic.
- Source search under `crates/cli` and `Cargo.toml` found no `--api-url` flag.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 03-04 parsers/aggregate: the CLI crate builds, exposes the front-end flag/config/window/region/API surfaces, and can be extended without further workspace setup.

## Self-Check: PASSED

- Found created/modified files: `Cargo.toml`, `Cargo.lock`, `crates/cli/Cargo.toml`, `crates/cli/src/lib.rs`, `crates/cli/src/bin/bloclawd.rs`, `crates/cli/src/cli.rs`, `crates/cli/src/api.rs`, `crates/cli/src/config.rs`, `crates/cli/src/window.rs`, `crates/cli/src/region.rs`.
- Found SUMMARY file: `.planning/phases/03-rust-cli/03-03-cli-scaffold-SUMMARY.md`.
- Found task commits: `a36bdc6`, `455fda1`, `90732a4`.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
