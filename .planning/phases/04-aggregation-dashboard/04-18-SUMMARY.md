---
phase: 04-aggregation-dashboard
plan: 18
subsystem: staging-proof
tags: [staging, cloudflare, r2, cron, frontend, human-verification]

requires:
  - phase: 04-10
    provides: deployed cron tick orchestrator
  - phase: 04-15
    provides: dashboard route
  - phase: 04-16
    provides: methodology and data routes
  - phase: 04-17
    provides: CI and integration gates
provides:
  - Feature-gated ignored staging cron proof test
  - Frontend staging and production R2 env templates
  - Worker README staging operator runbook
  - Dashboard harness normalization for real event-schema wire values
affects: [staging-uat, frontend-build, worker-staging-smoke]

tech-stack:
  added: []
  patterns:
    - ignored-staging-smoke-test
    - env-template-force-add
    - operator-runbook-checkpoint

key-files:
  created:
    - apps/worker/tests/cron_e2e_staging.rs
    - apps/frontend/.env.staging
    - apps/frontend/.env.production
  modified:
    - apps/worker/README.md
    - apps/frontend/src/routes/dashboard.tsx
    - apps/frontend/src/components/Filters.tsx
    - apps/frontend/src/__tests__/useChartData.test.ts
    - apps/frontend/src/__tests__/integration/dashboard-e2e.test.tsx

key-decisions:
  - "The staging proof test is manual-only: `#[ignore]` plus `staging-smoke`; it compiles in no-run gates but never runs in CI."
  - "Frontend env templates are committed with placeholders despite the repo-wide `.env.*` ignore rule; real local hashes still belong in uncommitted local env files."
  - "The dashboard accepts `harness=cc` as a URL alias but normalizes to the event-schema wire value `claude-code`, so real cron-emitted cells render."

patterns-established:
  - "Manual staging proof command sequence is documented in apps/worker/README.md."
  - "The human browser checklist can be reused for Phase 5 production launch rehearsal."

requirements-completed: []

duration: 24min
completed: 2026-05-02
status: human_verification_pending
---

# Phase 04 Plan 18: Staging Proof Summary

**Staging cron proof test, R2 env templates, operator runbook, and browser verification checkpoint**

## Performance

- **Duration:** 24 min
- **Completed:** 2026-05-02
- **Tasks:** 2 automated tasks plus 1 blocking human verification checkpoint
- **Files modified:** 8 source/config/doc/test files plus this summary

## Accomplishments

- Added `apps/worker/tests/cron_e2e_staging.rs`, gated by `staging-smoke` and `#[ignore]`.
- Added frontend env templates:
  - `apps/frontend/.env.staging`
  - `apps/frontend/.env.production`
- Extended `apps/worker/README.md` with the Phase 4 staging proof runbook.
- Fixed a staging-readiness mismatch: dashboard URLs may still use `harness=cc`, but route search normalizes that alias to the real wire value `claude-code`.

## Operator Commands

```bash
export PLANETSCALE_STAGING_URL='postgres://...staging-branch-direct-url...'
export STAGING_R2_BASE_URL='https://pub-<r2-dev-url-hash>.r2.dev'

psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0003_cron_state.sql
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0004_add_limit_type.sql

cd apps/worker
wrangler deploy --env staging
cd ../..

pnpm --filter ./apps/frontend build --mode staging
cd apps/frontend
wrangler deploy --env staging
cd ../..

PLANETSCALE_STAGING_URL="$PLANETSCALE_STAGING_URL" \
STAGING_R2_BASE_URL="$STAGING_R2_BASE_URL" \
  cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_e2e_staging
```

When the ignored test pauses:

```bash
# Wrangler 4 has no `wrangler triggers cron` manual invoke command.
# Wait for the deployed staging cron trigger instead.
# Staging runs every 15 minutes: */15 * * * * UTC.
date -u
```

After the next quarter-hour tick has passed, return to the test terminal and press Enter.

## Staging URLs

- Worker: `https://bloclawd-worker-staging.<account-hash>.workers.dev/`
- Frontend: `https://bloclawd-frontend-staging.<account-hash>.workers.dev/`
- R2 manifest: `https://pub-<r2-dev-url-hash>.r2.dev/reports/v1/manifest.json`
- Dashboard verification URL: `https://bloclawd-frontend-staging.<account-hash>.workers.dev/dashboard?tier=max20&harness=cc&region=EU&limit_type=5h&window=7d`

## Manual Verification Checklist

1. Run the ignored staging test, wait for the next deployed staging cron tick when prompted, then press Enter.
2. Open the dashboard verification URL.
3. Confirm the chrome row shows recent public data, event count, approximate contributor count, and `Healthy`.
4. Confirm the chart renders a unified-cost timeseries and the table shows p10/p25/p50/p75/p90 values.
5. Toggle `Compare tiers`; max20 should have data and missing tiers should not invent values.
6. Open `/methodology`; confirm all methodology sections render.
7. Open `/data`; confirm canonical JSON bytes and field annotations render.
8. Open `/methodology/changelog`; confirm the v1 empty state renders.
9. In DevTools Network, reload `/dashboard`; confirm `manifest.json`, `_status.json`, and bucket file requests hit staging R2 over HTTPS.
10. Inspect the bucket response body; confirm no `submission_group_id`, `event_id`, `nonce`, or `tz_offset` substrings appear.

## Task Commits

1. **Tasks 1-2: Staging cron proof, env templates, runbook** - `70d49f5` (test)
2. **Staging-readiness fix: dashboard harness normalization** - `fd26c3b` (fix)
3. **Staging-deploy fix: frontend assets-only Worker config** - `5d3b42b` (fix)

## Files Created/Modified

- `apps/worker/tests/cron_e2e_staging.rs` - Manual staging proof for cron -> R2 emission.
- `apps/frontend/.env.staging` - Staging R2 base URL template.
- `apps/frontend/.env.production` - Production R2 base URL template for Phase 5.
- `apps/worker/README.md` - Phase 4 staging proof runbook.
- `apps/frontend/src/routes/dashboard.tsx` - Normalizes `cc` URL alias to `claude-code`.
- `apps/frontend/src/components/Filters.tsx` - Uses `claude-code` as the harness filter value.
- `apps/frontend/src/__tests__/useChartData.test.ts` - Aligns synthetic cells with wire harness value.
- `apps/frontend/src/__tests__/integration/dashboard-e2e.test.tsx` - Keeps `harness=cc` URL coverage while cells use `claude-code`.
- `apps/frontend/wrangler.toml` - Removes asset bindings from the static-assets-only frontend Worker so Wrangler 4 can deploy it.

## Deviations from Plan

- Commands use `-p bloclawd-worker`, not the stale `-p worker` selector in the plan.
- The manual browser checklist has 10 explicit checks instead of 8 because network verification and bucket-body inspection are listed separately.
- The staging test expects `harness: "claude-code"` in emitted cells because that is the event-schema wire value persisted by ingest. The dashboard keeps `harness=cc` as a URL alias for the planned operator URL.

## Issues Encountered

- Native `tokio-postgres` does not accept `serde_json::Value` directly for the staging test insert; the payload is passed as JSON text to `$3::jsonb`.
- `.env.*` is ignored repo-wide, so the two placeholder env templates were force-added intentionally.
- Wrangler 4 rejects `binding = "ASSETS"` in an assets-only Worker without a `main` script. Removed the asset binding from all frontend Wrangler asset blocks in `5d3b42b`.
- Per runtime instruction, `.planning/STATE.md` and `.planning/ROADMAP.md` remained dirty, unstaged, and untouched.

## Known Stubs

- `<account-hash>` placeholders must be replaced by the operator for real staging deploys.
- Real staging verification has not been performed in this environment.

## Threat Flags

None from code changes. The remaining risk is operational: the deployed staging stack must be manually verified against real Cloudflare and PlanetScale resources.

## User Setup Required

Human/operator verification is required before Phase 4 can be marked complete.

## Next Phase Readiness

Blocked pending staging approval. Phase 5 should not start until the manual verification checklist passes.

## Verification

- Preflight checks passed: `0002_add_submission_group_id.sql` exists, and both CC/Codex CLI dry-run fixtures exist.
- File/env checks for `cron_e2e_staging.rs`, `#[ignore]`, `.env.staging`, `.env.production`, `VITE_R2_BASE_URL`, and `data.bloclawd.com` - PASS.
- `cargo test -p bloclawd-worker --locked --no-run` - PASS.
- `cargo test -p bloclawd-worker --features staging-smoke --locked --no-run` - PASS.
- `pnpm --filter ./apps/frontend test:run -- src/__tests__/useChartData.test.ts src/__tests__/integration/dashboard-e2e.test.tsx` - PASS; Vitest ran 17 files and 46 tests.
- `pnpm --filter ./apps/frontend lint` - PASS.
- `pnpm --filter ./apps/frontend build` - PASS.
- `pnpm --filter ./apps/frontend build --mode staging` - PASS.
- `cd apps/frontend && wrangler deploy --env staging --dry-run` - PASS; generated config reports no bindings.

## Human Checkpoint: PENDING

Awaiting operator response:

- Type `approved` after the manual staging checklist passes.
- Type `issues` plus failure details if any checklist item fails.

## Self-Check: PASSED

- Created files exist: summary, staging test, env templates.
- Task commits exist in git history: `70d49f5`, `fd26c3b`, `5d3b42b`.
- Working tree before summary commit contains only this summary plus orchestrator-owned `.planning/ROADMAP.md` and `.planning/STATE.md`.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
