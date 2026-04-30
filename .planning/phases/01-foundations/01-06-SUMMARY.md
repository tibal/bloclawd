---
phase: 01-foundations
plan: 06
subsystem: docs
tags: [docs, project, requirements, claude-md, roadmap, hmac-pow, jcs, kv-removal]

requires: []
provides:
  - PROJECT.md source of truth updated for stateless HMAC PoW
  - REQUIREMENTS.md updated for 72-byte PoW input, JCS, SPEC-05, and 77/77 coverage
  - CLAUDE.md updated with no standalone KV token and no CHALLENGES reference
  - ROADMAP.md Phase 1 and Phase 2 criteria updated for no-KV HMAC PoW
affects: [phase-02-planning, phase-03-planning, phase-04-planning, pow, ingest]

tech-stack:
  added: []
  patterns:
    - local-only planning docs can be force-added when executing ignored .planning tasks
    - doc drift gates use grep assertions for stale KV guidance

key-files:
  created:
    - .planning/phases/01-foundations/01-06-SUMMARY.md
  modified:
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - CLAUDE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Stateless HMAC-signed PoW is the documented model across project, requirements, CLAUDE, and roadmap docs."
  - "SPEC-05 tracks spec/payload-canonical.md and RFC 8785 JCS as a Phase 1 requirement."
  - "Task verification used executor worktree paths instead of main-worktree absolute paths to honor the plan's critical worktree rule."

patterns-established:
  - "Docs that drive later planners must not contain stale KV-backed PoW instructions."
  - "REQUIREMENTS traceability and coverage counts must change together when adding requirement IDs."

requirements-completed: [SPEC-01, SPEC-03]

duration: 4m14s
completed: 2026-04-30
---

# Phase 01 Plan 06: Documentation Drift Resolution Summary

**Project, requirements, CLAUDE, and roadmap docs now describe the locked 72-byte stateless HMAC PoW + RFC 8785 JCS model without stale KV-backed challenge guidance.**

## Performance

- **Duration:** 4m14s
- **Started:** 2026-04-30T17:01:51Z
- **Completed:** 2026-04-30T17:06:05Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Removed stale KV-backed one-shot PoW guidance from the upstream docs that Phase 2 planners will read.
- Added SPEC-05 and updated requirements coverage to 77/77 with Phase 1 at 6 requirements.
- Rewrote roadmap success criteria so Phase 1 and Phase 2 are traceable to `spec/pow-v1.md`, `spec/payload-canonical.md`, `spec/event-schema.md`, `spec/enums.json`, and `xtask/`.

## Task Commits

1. **Task 1: Edit PROJECT.md** - `8d2ae8f` (docs)
2. **Task 2: Edit REQUIREMENTS.md** - `acd333a` (docs)
3. **Task 3: Edit CLAUDE.md** - `3415d0e` (docs)
4. **Task 4: Edit ROADMAP.md** - `6fa267e` (docs)

## Files Created/Modified

- `.planning/PROJECT.md` - Active scope, key decisions, outlier policy, and footer updated for HMAC PoW and double-MAD.
- `.planning/REQUIREMENTS.md` - SPEC/INGE/BACK requirements, SPEC-05, traceability, coverage, by-phase counts, footer, and stale HMAC out-of-scope row updated.
- `CLAUDE.md` - Storage, PoW invariant, and idempotency guidance updated; standalone `KV` and `CHALLENGES` references removed.
- `.planning/ROADMAP.md` - Phase 1 and Phase 2 criteria updated for 72-byte payload binding, JCS, HMAC challenge issuance, and no KV lookup.
- `.planning/phases/01-foundations/01-06-SUMMARY.md` - This execution summary.

## Edits Applied

### PROJECT.md

1. Deleted the Out of Scope line that excluded stateless HMAC-signed PoW in favor of KV-backed consume-on-use.
2. Replaced the Active KV challenge bullet with stateless HMAC-signed PoW using `WORKER_SECRET`, 60s expiry, and no KV.
3. Replaced the PoW invariant bullet with the 72-byte input, `spec/payload-canonical.md`, RFC 8785 JCS, fixture vectors, and `xtask gen-fixtures --check`.
4. Replaced the PoW key-decision row with the no-KV HMAC model, payload_hash binding, and replay-defense rationale.
5. Replaced the `>2σ` outlier policy row with per-cohort double-MAD at `3 x MAD`.
6. Replaced the initialization footer with the Phase 1 HMAC PoW / 72-byte / double-MAD doc-conflict footer.

### REQUIREMENTS.md

1. Rewrote SPEC-01 for 72-byte input, stateless HMAC-SHA256 issuance, verification ordering, `WORKER_SECRET`, and K=22.
2. Rewrote SPEC-02 with the expanded vector schema including `payload_canonical_b64` and `payload_hash_b64`, JCS cases, and fixture drift check.
3. Rewrote SPEC-03 to reference `spec/enums.json` and exclude `tz_offset`, identifiers, country, user/session/account IDs, and IP from the wire payload.
4. Added SPEC-05 for `spec/payload-canonical.md`, RFC 8785 JCS, Rust/TS implementations, and JCS edge cases.
5. Rewrote BACK-03 to list Hyperdrive, R2, and `WORKER_SECRET` with no KV binding.
6. Rewrote INGE-01 for stateless challenge issuance with 8B `unix_ms_be`, 24B random, signature, difficulty, and 60s expiry.
7. Rewrote INGE-02 for HMAC verification, constant-time compare, expiry, and clock-skew rejection.
8. Rewrote INGE-04 for server-side JCS payload hash recompute, payload-hash binding, PoW/signature/expiry success, and `INSERT IGNORE`.
9. Rewrote INGE-09 to classify payload_hash binding as the primary replay defense.
10. Added the SPEC-05 traceability row.
11. Updated coverage from 76/76 to 77/77.
12. Updated Phase 1 by-phase count from 5 to 6 requirements.
13. Replaced the footer with the Phase 1 doc-conflict resolution footer.

### CLAUDE.md

1. Replaced the Storage line with R2 storage plus stateless HMAC-signed PoW issuance using `WORKER_SECRET`.
2. Replaced the PoW invariant convention with 72-byte input, RFC 8785 JCS, `spec/payload-canonical.md`, `cargo xtask gen-fixtures`, fixture drift check, and `.github/workflows/pow.yml`.
3. Replaced the Idempotency convention so payload_hash binding is primary replay defense, `event_id` PK second, and 60s expiry third.
4. Ran the robust `KV` / `CHALLENGES` grep gate and adjusted prose to remove all matching standalone/binding-name tokens.

### ROADMAP.md

1. Rewrote Phase 1 success criterion #1 for 32-byte `payload_hash`, HMAC-SHA256 stateless challenge model, 60-second expiry, `spec/payload-canonical.md`, and `spec/enums.json`.
2. Rewrote Phase 1 success criterion #4 to include `xtask/` and `spec/payload-canonical.md`.
3. Rewrote Phase 2 success criterion #1 for stateless HMAC challenges, `HMAC-SHA256(WORKER_SECRET`, payload_hash binding, `spec/enums.json`, and `no KV lookup`.
4. Rewrote the Phase 2 plans bullet to use Hyperdrive bindings + `WORKER_SECRET` and stateless HMAC challenges instead of `Hyperdrive/KV bindings`.

## Verification

- PROJECT.md task grep gate passed.
- REQUIREMENTS.md task grep gate passed, including SPEC-05 in both required places and 77/77 coverage.
- CLAUDE.md task grep gate passed with zero standalone `KV` matches and zero case-insensitive `CHALLENGES` matches.
- ROADMAP.md task grep gate passed.
- ROADMAP.md contains `32-byte payload_hash`, `HMAC-SHA256(WORKER_SECRET`, `spec/payload-canonical.md`, `xtask/`, and `no KV lookup`.
- ROADMAP.md does not contain `KV with 90-second TTL`, `consumes the KV key`, or `Hyperdrive/KV bindings`.
- Downstream phase planners reading these docs will not see stale KV-backed PoW guidance.

## Decisions Made

- The plan's absolute verification paths targeting the main worktree were adapted to the executor worktree path because the user explicitly forbade editing or verifying against the main worktree for this execution.
- `CLAUDE.md` uses "PoW issuance" instead of "PoW challenges" because the acceptance gate rejects case-insensitive `CHALLENGES`, which also matches lowercase prose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Seeded ignored planning files into executor worktree**
- **Found during:** Startup before Task 1
- **Issue:** The executor worktree had no `.planning/` directory because `.planning/` is gitignored, but the plan owns `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, and `.planning/ROADMAP.md`.
- **Fix:** Copied only the owned planning docs from the main worktree into the executor worktree, then force-added the task-owned files when committing.
- **Files modified:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
- **Verification:** All task grep gates passed against `/Users/davinci/Developer/bloclawd-worktrees/01-06`.
- **Committed in:** `8d2ae8f`, `acd333a`, `6fa267e`

**2. [Rule 2 - Missing Critical] Removed stale REQUIREMENTS.md HMAC out-of-scope row**
- **Found during:** Task 2
- **Issue:** The plan rewrote active requirements but left an Out of Scope row saying stateless HMAC PoW was excluded in favor of KV-backed consume-on-use.
- **Fix:** Removed that row so REQUIREMENTS.md no longer contradicts the locked model.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `! grep -q "KV-backed consume-on-use" .planning/REQUIREMENTS.md`
- **Committed in:** `acd333a`

**3. [Rule 2 - Missing Critical] Adjusted CLAUDE.md wording to satisfy CHALLENGES grep gate**
- **Found during:** Task 3
- **Issue:** The prescribed replacement used lowercase "challenges", but the required `grep -i CHALLENGES` gate treats that as a failure.
- **Fix:** Replaced "PoW challenges" with "PoW issuance" while preserving the stateless HMAC + `WORKER_SECRET` meaning.
- **Files modified:** `CLAUDE.md`
- **Verification:** `! grep -i "CHALLENGES" CLAUDE.md`
- **Committed in:** `3415d0e`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** All deviations were required to make the plan executable in this ignored-planning worktree and to satisfy the stated no-stale-KV guidance.

## Issues Encountered

- The executor worktree initially contained only `.gitignore` and `CLAUDE.md`; `.planning/` was absent because it is ignored. Resolved by seeding only task-owned planning docs into the executor worktree.
- The task 3 and task 4 automated snippets used main-worktree absolute paths. Resolved by running equivalent checks against the executor worktree path.

## User Setup Required

None.

## Known Stubs

None.

## Self-Check: PASSED

- Found all expected files: PROJECT.md, REQUIREMENTS.md, CLAUDE.md, ROADMAP.md, and this SUMMARY.md.
- Found all task commits: `8d2ae8f`, `acd333a`, `3415d0e`, `6fa267e`.
- Re-ran final no-stale-KV grep gates and SPEC-05 / 77 coverage checks successfully.
- Stub scan found no TODO/FIXME/placeholder-style markers in changed files.

## Next Phase Readiness

Phase 2 planners can read PROJECT.md, REQUIREMENTS.md, CLAUDE.md, and ROADMAP.md without seeing stale KV-backed PoW instructions. SPEC-05 is traceable for `spec/payload-canonical.md`, and Phase 1 counts are consistent at 6 requirements / 77 total.

---
*Phase: 01-foundations*
*Completed: 2026-04-30*
