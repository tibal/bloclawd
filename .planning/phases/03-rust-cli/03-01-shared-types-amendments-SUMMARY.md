---
phase: 03-rust-cli
plan: 01
subsystem: shared-types
tags: [event-schema, wire-amendment, region-map, ts-rs]

requires:
  - phase: 03-00
    provides: Phase 3 documentation amendments and shared-type prerequisites
provides:
  - SubmittedEvent transport wrapper with submission_group_id outside EventPayload
  - country_to_region ISO2 to Region helper covering all seven Region partitions
  - Model::Gpt55 serde/TypeScript support for real Codex gpt-5.5 sessions
affects: [03-02-worker-amendment, 03-03-cli-scaffold, 03-04-parsers-aggregate, 03-05-wire-glue, phase-4-cron-dashboard]

tech-stack:
  added: []
  patterns:
    - ts-rs generated bindings from Rust event-schema source
    - serde deny_unknown_fields on wire transport structs
    - hand-curated UN M49 ISO2 match for region derivation

key-files:
  created:
    - crates/event-schema/src/region_map.rs
    - crates/event-schema/src/wire.rs
    - apps/web/src/generated/SubmittedEvent.ts
  modified:
    - crates/event-schema/src/enums.rs
    - crates/event-schema/src/lib.rs
    - apps/web/src/generated/Model.ts
    - apps/web/src/generated/index.ts
    - spec/event-schema.md

key-decisions:
  - "submission_group_id is String-typed on the wire, matching existing base64url transport fields and avoiding ts-rs uuid-impl."
  - "submission_group_id remains outside EventPayload, so it is not JCS-canonicalized or PoW-bound."
  - "country_to_region uses a hand-curated UN M49 match with Antarctica/AN coverage, not a dependency or generated map."

patterns-established:
  - "SubmittedEvent: strict top-level transport wrapper around EventPayload with deny_unknown_fields."
  - "Region lookup: closed match over ISO2 strings, uppercase-normalized at lookup time."

requirements-completed: []

duration: 11min
completed: 2026-05-02
---

# Phase 03 Plan 01: Shared Types Amendments Summary

**Event-schema now supports Codex gpt-5.5, ISO2 region derivation, and the SubmittedEvent wire envelope with submission_group_id kept outside canonical payload bytes.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T08:45:03Z
- **Completed:** 2026-05-02T08:52:51Z
- **Tasks:** 2 completed
- **Files modified:** 8

## Accomplishments

- Added `Model::Gpt55` with serde rename `gpt-5.5` and regenerated the frontend `Model` binding.
- Added `country_to_region(iso2)` with a closed, uppercase-normalized ISO2 match covering 251 distinct quoted region codes and all seven `Region` variants.
- Added `SubmittedEvent` as the strict transport wrapper for `POST /event`, generated `SubmittedEvent.ts`, and documented `submission_group_id` as transport-only in `spec/event-schema.md`.

## Task Commits

1. **Task 1 RED: shared type amendment tests** - `6a3da6a` (test)
2. **Task 1 GREEN: Gpt55 and region map** - `e9d800e` (feat)
3. **Task 2 RED: submitted event wrapper tests** - `2d59022` (test)
4. **Task 2 GREEN: SubmittedEvent wire wrapper** - `7305914` (feat)

## Files Created/Modified

- `crates/event-schema/src/region_map.rs` - ISO2 to `Region` closed match plus coverage tests.
- `crates/event-schema/src/wire.rs` - `SubmittedEvent` struct and tests for roundtrip, unknown fields, field order, and JCS separation.
- `crates/event-schema/src/enums.rs` - `Model::Gpt55` and serde roundtrip tests.
- `crates/event-schema/src/lib.rs` - module declarations and crate-root exports for `country_to_region` and `SubmittedEvent`.
- `apps/web/src/generated/Model.ts` - generated `gpt-5.5` TypeScript literal.
- `apps/web/src/generated/SubmittedEvent.ts` - generated TypeScript binding for the transport wrapper.
- `apps/web/src/generated/index.ts` - barrel export for `SubmittedEvent`.
- `spec/event-schema.md` - wire-body documentation for `submission_group_id` and D-52 separation rationale.

## Decisions Made

- Used `String` fields for all SubmittedEvent identifiers, including `submission_group_id`, to match the Worker wire convention and avoid a `uuid-impl` ts-rs feature requirement.
- Kept `submission_group_id` outside `EventPayload`, so the existing JCS payload hash and 72-byte PoW input stay unchanged.
- Implemented region derivation as a reviewed match table sourced from UN M49/ISO alpha-2 references, including Antarctica coverage for partition exhaustiveness.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## TDD Gate Compliance

- Task 1: RED `6a3da6a` failed before implementation; GREEN `e9d800e` passed `cargo test -p event-schema -- --nocapture`.
- Task 2: RED `2d59022` failed before implementation; GREEN `7305914` passed `cargo test -p event-schema`.

## Verification

- `cargo test -p event-schema` passed: 36 tests across 6 suites.
- `cargo test --features ts-export -p event-schema --locked` passed: 36 tests across 6 suites.
- `cargo build --workspace` passed.
- `git diff --exit-code apps/web/src/generated` passed after generated bindings were committed.
- Acceptance grep/file checks passed for `Gpt55`, `gpt-5.5`, `country_to_region`, `Region::An`, `SubmittedEvent`, `deny_unknown_fields`, `submission_group_id`, and D-52 spec traceability.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `03-02-worker-amendment`: the shared Rust and TypeScript wire types now expose `submission_group_id` and the crate root exports `SubmittedEvent`.

## Self-Check: PASSED

- Found created files: `crates/event-schema/src/region_map.rs`, `crates/event-schema/src/wire.rs`, `apps/web/src/generated/SubmittedEvent.ts`.
- Found SUMMARY file: `.planning/phases/03-rust-cli/03-01-shared-types-amendments-SUMMARY.md`.
- Found task commits: `6a3da6a`, `e9d800e`, `2d59022`, `7305914`.

---
*Phase: 03-rust-cli*
*Completed: 2026-05-02*
