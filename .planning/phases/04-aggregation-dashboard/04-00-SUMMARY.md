---
phase: 04-aggregation-dashboard
plan: 00
subsystem: docs
tags: [requirements, roadmap, privacy, aggregation, schema]

requires:
  - phase: 03-rust-cli
    provides: Phase 3 event submission and staging events table prerequisites for Phase 4 wave >= 2
provides:
  - Phase 4 aggregation requirement amendments for unified-cost trim, per-limit-type cells, and cron_state
  - Roadmap success criteria and dependency gate for Phase 4
  - Canonical CLAUDE.md and PROJECT.md privacy/outlier-policy invariants
  - spec/event-schema.md limit_type wire envelope documentation
affects: [phase-04, aggregation, dashboard, event-schema, cron]

tech-stack:
  added: []
  patterns: [docs-first invariant lock, downstream grep anchors]

key-files:
  created: [.planning/phases/04-aggregation-dashboard/04-00-SUMMARY.md]
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/PROJECT.md
    - CLAUDE.md
    - spec/event-schema.md

key-decisions:
  - "Phase 4 aggregation docs now use 2σ trim on unified per-submission cost with cohort = (tier, harness, region)."
  - "limit_type is documented as a top-level wire envelope field, not part of payload."
  - "submission_group_id is part of the canonical public-R2 strip list."

patterns-established:
  - "Docs amendments land before Phase 4 code plans rely on grep anchors."

requirements-completed: [AGGR-01, AGGR-02, AGGR-04, AGGR-05, AGGR-06]

duration: 8min
completed: 2026-05-02
---

# Phase 04 Plan 00: Docs Amendments Summary

**Phase 4 documentation now anchors unified-cost aggregation, per-limit-type cells, cron_state work queue semantics, and the limit_type wire field before implementation starts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-02T18:01:39Z
- **Completed:** 2026-05-02T18:09:40Z
- **Tasks:** 2
- **Files modified:** 5 plan docs plus this summary

## Accomplishments

- Rewrote AGGR-01/02/04/05/06 and added AGGR-15..18 with traceability and coverage counts.
- Updated Phase 4 roadmap dependency, requirements, SC#1, and SC#4 for daily-default unified-cost aggregation and limit_type URL filtering.
- Updated project/CLAUDE invariants for 2σ unified-cost trim and submission_group_id stripping.
- Added `limit_type` to `spec/event-schema.md` as a top-level transport field.

## Task Commits

1. **Task 1: Amend REQUIREMENTS.md** - `a0aca56` (docs)
2. **Task 2: Amend ROADMAP.md, PROJECT.md, CLAUDE.md, spec/event-schema.md** - `31a41b3` (docs)

Process note: `1d9aeb2` is an empty marker commit created when the branch advanced under concurrent 04-01 work. It has no file changes and is documented under Issues Encountered.

## Files Created/Modified

- `.planning/REQUIREMENTS.md` - AGGR requirements, traceability rows, coverage totals, dated trailer.
- `.planning/ROADMAP.md` - Phase 4 dependency gate, requirements shorthand, SC#1, SC#4, dated trailer.
- `.planning/PROJECT.md` - Constraints and Key Decisions outlier/cohort policy plus anonymity strip list.
- `CLAUDE.md` - Key invariants and anonymity boundary strip list.
- `spec/event-schema.md` - `limit_type` wire envelope field, constraint row, payload exclusion, dated trailer.
- `.planning/phases/04-aggregation-dashboard/04-00-SUMMARY.md` - Execution record.

## Line Amendments

### .planning/REQUIREMENTS.md

Before:
`AGGR-02`: "Per-cohort double-MAD outlier trim applied at `3 × MAD` ... cohort = `(model, tier, harness, region)`"

After:
`AGGR-02`: "Per-cohort 2σ trim on the unified per-submission cost ... cohort = `(tier, harness, region)`."

Added:
`AGGR-15` per-(cohort, limit_type) ridge weight fit, `AGGR-16` per-model k-anon gate, `AGGR-17` cron_state claim/revert, `AGGR-18` eager work-item fill.

Coverage changed from `82 total` / Phase 4 `31 requirements` to `86 total` / Phase 4 `35 requirements (AGGR-01..18, WEB-01..17)`.

### .planning/ROADMAP.md

Before:
`Depends on`: "Phase 3 (real events flowing into PlanetScale)"

After:
`Depends on`: "Phase 3 fully merged (plans 03-00..03-07 — CLI fixture path + submission_group_id wire field + staging events table populated by a cargo-test --features staging-smoke run)."

Before:
SC#1 used "every 15 minutes", "double-MAD trim at 3 × MAD", and cohort `(model, tier, harness, region)`.

After:
SC#1 uses config-driven cadence, per-(cohort, limit_type) ridge weights, unified per-submission cost, 2σ trim, cohort `(tier, harness, region)`, `n_distinct_submission_groups < 5`, and `submission_group_id`/`event_id`/`nonce` strip.

SC#4 now says "unified-cost percentiles" and adds `limit_type` to URL-synced filters.

### .planning/PROJECT.md

Before:
`Aggregation outlier policy`: "Per-cohort double-MAD trim at `3 × MAD` (cohort = `(model, tier, harness, region)`)"

After:
`Aggregation outlier policy`: "Per-cohort 2σ trim on the unified per-submission cost. cohort = `(tier, harness, region)`."

Anonymity strip list now includes `submission_group_id / event_id / nonce`.

### CLAUDE.md

Before:
`Outlier policy`: "per-cohort double-MAD at 3 × MAD (NOT >2σ from median). Cohort = `(model, tier, harness, region)`."

After:
`Outlier policy`: "2σ trim on unified per-submission cost (per Phase 4 D-82). Cohort = `(tier, harness, region)`. Per-model dimensions live inside each cell's `models[]` array."

Anonymity boundary now strips `submission_group_id`, `event_id`, and `nonce` at cron materialization.

### spec/event-schema.md

Before:
The wire envelope listed `submission_group_id` followed by `payload`.

After:
The wire envelope lists `"limit_type": "5h"` after `submission_group_id`, documents `"5h" | "weekly"`, and states it is a top-level transport field outside payload.

## Decisions Made

- Used the lower-case `cohort =` anchor in REQUIREMENTS.md and PROJECT.md because the plan's automated grep gates require that exact string.
- Kept ROADMAP SC#2/3/5 unchanged as instructed, even though SC#3 still names the old methodology copy; later frontend methodology content plans can update user-facing copy.

## Deviations from Plan

None - content changes match the planned document scope and acceptance criteria.

## Issues Encountered

- Concurrent 04-01 work advanced the branch while Task 2 was in progress. I did not revert or rewrite those commits. The actual Task 2 docs were committed in `31a41b3`; `1d9aeb2` is an empty marker commit with no file changes, left only to preserve the 04-00 task boundary after the branch moved.
- Unrelated uncommitted files remain in the worktree from concurrent work: `.planning/STATE.md`, `apps/web/src/generated/*`, and `crates/event-schema/src/*`. They were not staged or modified by this plan's commits.

## User Setup Required

None - docs-only plan.

## Known Stubs

None - stub scan found no `TODO`, `FIXME`, `placeholder`, `coming soon`, or `not available` in the plan-modified files.

## Threat Flags

None beyond the planned D-84 `limit_type` transport-field documentation and T-04-00-02 submission_group_id strip-list mitigation.

## Verification

- Task 1 exact grep gate: PASS.
- Task 2 exact grep gate: PASS.
- Final composite grep: `.planning/REQUIREMENTS.md:3`, `spec/event-schema.md:5` for `limit_type`.
- Plan files clean in worktree after commits: PASS.

## Self-Check: PASSED

- Created summary file exists.
- All five plan-modified docs exist.
- Task commits `a0aca56` and `31a41b3` exist in git history.
- Marker commit `1d9aeb2` exists and has no file changes.

## Next Phase Readiness

Ready for 04-01 shared-type amendments to implement `LimitType`, `TokenType`, `Window`, log bins, and model prices against these doc anchors.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
