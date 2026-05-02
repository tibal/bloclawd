---
phase: 04-aggregation-dashboard
plan: 15
subsystem: frontend
tags: [react, tanstack-query, tanstack-router, uplot, dashboard]

requires:
  - phase: 04-13
    provides: R2 manifest/status/bucket hooks, useBuckets, and q15/h1/d1 tier picker
  - phase: 04-14
    provides: Dashboard chart, filters, toggles, chrome, table, and empty-state components
provides:
  - End-to-end /dashboard route assembly with real R2-backed data flow
  - useChartData hook returning chart-ready AlignedData and compare-tier overlays
  - Route-level stale, degraded, loading, error, no-tier, no-data, and partial-bucket states
affects: [frontend-tests, frontend-methodology-data, spa-uat]

tech-stack:
  added: []
  patterns:
    - usebuckets-variable-bucket-loading
    - route-derived-dashboard-state
    - compare-tier-aligned-series

key-files:
  created:
    - apps/frontend/src/lib/dashboard-data.ts
    - apps/frontend/src/__tests__/dashboard.integration.test.tsx
    - apps/frontend/src/__tests__/useChartData.test.ts
  modified:
    - apps/frontend/src/routes/dashboard.tsx
    - apps/frontend/src/__tests__/routes.test.tsx
    - apps/frontend/src/__tests__/setup.ts
    - apps/frontend/src/components/Chart.tsx
    - apps/frontend/package.json
    - apps/frontend/eslint.config.js
    - pnpm-lock.yaml

key-decisions:
  - "Compare mode fetches the selected resolution bucket set once with useBuckets, then extracts pro/max5/max20 series from each loaded bucket."
  - "Optional model and region filters aggregate matching cells with submission-count weighting instead of pretending an R2 all-region cell exists."
  - "Dashboard search validation now rejects unknown model/tier/region values at route validation time."

patterns-established:
  - "Dashboard display state is derived during render from hook results and URL search state."
  - "All dashboard helpers and static arrays are module-scoped; DashboardPage has no nested component definitions."

requirements-completed: [WEB-03, WEB-04, WEB-05, WEB-07]

duration: 11min
completed: 2026-05-02
---

# Phase 04 Plan 15: Frontend Dashboard Assembly Summary

**R2-backed dashboard route with URL filters, lazy bucket loading, tier comparison overlays, and route-level public-data health states**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T21:15:26Z
- **Completed:** 2026-05-02T21:26:31Z
- **Tasks:** 1 TDD task
- **Files modified:** 6 source/test files plus this summary

## Accomplishments

- Added `useChartData(filters)` in `apps/frontend/src/lib/dashboard-data.ts`.
- Replaced the `/dashboard` placeholder with Chrome, Filters, BandToggle, TierToggle, Chart, DataTable, and EmptyState composition.
- Added tests for bucket selection, model drill-down, compare tiers, no-tier nudge, single-tier chart/table success, stale/down, stale-healthy, and degraded states.
- Tightened dashboard route search validation for model, tier, and region enum values.

## useChartData Contract

`useChartData(filters)` returns:

```ts
{
  data: uPlot.AlignedData | null;
  compareData: { tier: "pro" | "max5" | "max20"; data: uPlot.AlignedData }[] | null;
  loading: boolean;
  error: Error | null;
  bucketsLoaded: number;
  bucketsTotal: number;
}
```

It calls `useManifest()`, selects q15/h1/d1 via `pickTier(windowDaysFor(filters.window))`, filters manifest paths to the active window, then calls `useBuckets(bucketTier, paths)` once. Single-tier mode extracts the selected subscription tier. Compare mode extracts pro/max5/max20 from the same loaded bucket envelopes and emits three overlay series.

## Empty-State Matrix

- Manifest error: `We can't reach the public data right now`.
- Loading >300ms: Skeleton with `Loading aggregates...` aria label.
- No tier and compare off: `Pick a tier`.
- No renderable chart data: `Not enough data yet`.
- Partial bucket failure with usable data: inline `One time slice didn't load` status, chart/table still render.
- `ingest_health=down` or `last_cron_success_ts` older than 24h: top-level `Public data is stale` alert plus chart annotation.
- `ingest_health=degraded`: inline `Ingest degraded` notice near the Chrome row, no top-level alert.

## Task Commits

1. **Task 1 RED: dashboard assembly tests** - `d45717a` (test)
2. **Task 1 GREEN: hook + dashboard route assembly** - `22a8166` (feat)
3. **Post-summary correction: frontend hook lint gate** - `19b9a38` (fix)

## Files Created/Modified

- `apps/frontend/src/lib/dashboard-data.ts` - R2-backed hook that converts manifest buckets into chart-ready data.
- `apps/frontend/src/routes/dashboard.tsx` - Full route assembly and dashboard state rendering.
- `apps/frontend/src/__tests__/dashboard.integration.test.tsx` - Route assembly states and Chart prop assertions.
- `apps/frontend/src/__tests__/useChartData.test.ts` - Hook behavior tests for bucket tiering, model drill-down, and compare tiers.
- `apps/frontend/src/__tests__/routes.test.tsx` - Route smoke test updated for assembled dashboard.
- `apps/frontend/src/__tests__/setup.ts` - jsdom shims for uPlot route imports.
- `apps/frontend/eslint.config.js` - Flat ESLint config enabling React hook rules for the frontend package.
- `apps/frontend/package.json` and `pnpm-lock.yaml` - Frontend lint script and ESLint dependencies.
- `apps/frontend/src/components/Chart.tsx` - Effect dependency alignment for the hook lint gate.

## Decisions Made

- Used one `useBuckets` call for variable bucket paths. No `useBucket` hook loop was introduced.
- Aggregated optional model/region wildcard matches with submission-count weighting because the public R2 schema stores per-region cells, not an all-region cell.
- Kept route-level status handling separate from `Chrome`; duplicate `useStatus` calls dedupe through TanStack Query.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Tightened URL enum validation**
- **Found during:** Task 1 GREEN threat-model check.
- **Issue:** Existing dashboard schema accepted arbitrary `model`, `tier`, and `region` strings, while T-04-15-03 required closed-enum URL validation before route render.
- **Fix:** Replaced string validators with zod enums for model, tier, and region.
- **Files modified:** `apps/frontend/src/routes/dashboard.tsx`
- **Verification:** `pnpm --filter ./apps/frontend test:run` and `pnpm --filter ./apps/frontend build` passed.
- **Committed in:** `22a8166`

**2. [Rule 3 - Blocking] Added jsdom browser shims for uPlot imports**
- **Found during:** Task 1 GREEN test run.
- **Issue:** Assembling the route imported `Chart.tsx`; uPlot reads `window.matchMedia` at import time, which jsdom did not provide.
- **Fix:** Added `matchMedia` and `scrollTo` shims in the frontend Vitest setup.
- **Files modified:** `apps/frontend/src/__tests__/setup.ts`
- **Verification:** `pnpm --filter ./apps/frontend test:run` passed.
- **Committed in:** `22a8166`

**3. [Rule 1 - Bug] Updated route smoke test for real dashboard hooks**
- **Found during:** Task 1 GREEN test run.
- **Issue:** The existing route smoke test expected `Dashboard placeholder` and rendered without dashboard data/status mocks after the real route started using query-backed hooks.
- **Fix:** Mocked dashboard data/status in the smoke test and asserted the new `Pick a tier` landing state.
- **Files modified:** `apps/frontend/src/__tests__/routes.test.tsx`
- **Verification:** `pnpm --filter ./apps/frontend test:run` passed.
- **Committed in:** `22a8166`

**4. [Rule 3 - Blocking] Added frontend hook lint gate**
- **Found during:** Post-summary gate verification.
- **Issue:** `pnpm --filter ./apps/frontend lint` could not run because the frontend package had no lint script or ESLint config.
- **Fix:** Added flat ESLint config with React hook rules, added the frontend `lint` script and dependencies, and aligned `Chart.tsx` effect dependencies.
- **Files modified:** `apps/frontend/eslint.config.js`, `apps/frontend/package.json`, `pnpm-lock.yaml`, `apps/frontend/src/components/Chart.tsx`
- **Verification:** `pnpm --filter ./apps/frontend lint`, `pnpm --filter ./apps/frontend test:run`, and `pnpm --filter ./apps/frontend build` passed.
- **Committed in:** `19b9a38`

---

**Total deviations:** 4 auto-fixed (1 missing critical validation, 1 blocking jsdom issue, 1 route-test bug, 1 missing lint gate).
**Impact on plan:** All fixes were necessary for the planned route behavior and did not expand production scope beyond `/dashboard` and `useChartData`.

## Issues Encountered

- Initial execution lacked a frontend lint script/config; fixed in `19b9a38`. The hook-loop constraint is now covered by `pnpm --filter ./apps/frontend lint`; `dashboard-data.ts` calls `useBuckets` once and does not call `useBucket`.
- Per runtime instruction, `.planning/STATE.md` and `.planning/ROADMAP.md` remained dirty, unstaged, and untouched.

## Known Stubs

None. Stub scan found only intentional empty arrays/nulls in tests and internal empty-series handling.

## Threat Flags

None. This plan added only the planned public R2 read path through existing hooks. No new network endpoint, auth path, server schema, file access path, or trust-boundary surface was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-16 can continue methodology/data route work without dashboard-content coupling. 04-22 SPA tests can rely on the `useChartData` return shape and the documented empty-state matrix.

## TDD Gate Compliance

- RED commit exists: `d45717a`.
- GREEN commit exists after RED: `22a8166`.
- Refactor commit: not needed.

## Verification

- `pnpm --filter ./apps/frontend test:run -- src/__tests__/useChartData.test.ts src/__tests__/dashboard.integration.test.tsx` - PASS; Vitest ran 15 files and 44 tests.
- `pnpm --filter ./apps/frontend test:run` - PASS; 15 files and 44 tests.
- `pnpm --filter ./apps/frontend build` - PASS; `tsc -b && vite build` completed.
- `pnpm --filter ./apps/frontend lint` - PASS; ESLint completed with React hook rules enabled.
- `rg -n "useBucket\\(|useBuckets\\(" apps/frontend/src/lib/dashboard-data.ts apps/frontend/src/routes/dashboard.tsx` - PASS; one `useBuckets` call, zero `useBucket` calls.

## Self-Check: PASSED

- Created files exist: summary, `dashboard-data.ts`, and both 04-15 test files.
- Task commits exist in git history: `d45717a`, `22a8166`.
- Working tree before summary commit contains only this summary plus orchestrator-owned `.planning/ROADMAP.md` and `.planning/STATE.md`.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
