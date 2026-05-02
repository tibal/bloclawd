---
phase: 04-aggregation-dashboard
plan: 14
subsystem: frontend
tags: [react, uplot, shadcn, tanstack-router, vitest, accessibility]

requires:
  - phase: 04-12
    provides: Dashboard route search schema, shadcn primitives, route shell, tokens
  - phase: 04-13
    provides: R2 StatusJson/useStatus types and frontend data helpers
provides:
  - uPlot Chart wrapper with percentile bands, compare-tier stroke patterns, and chart accessibility
  - DataTable fallback for chart data
  - URL-synced dashboard filter controls and band/compare toggles
  - Status chrome row plus /data helper components
affects: [frontend-dashboard-assembly, frontend-methodology-data, frontend-tests]

tech-stack:
  added: []
  patterns:
    - hand-rolled-uplot-wrapper
    - route-useSearch-components
    - shadcn-radix-component-tests
    - chart-table-a11y-fallback

key-files:
  created:
    - apps/frontend/src/components/Chart.tsx
    - apps/frontend/src/components/DataTable.tsx
    - apps/frontend/src/components/Filters.tsx
    - apps/frontend/src/components/BandToggle.tsx
    - apps/frontend/src/components/TierToggle.tsx
    - apps/frontend/src/components/Chrome.tsx
    - apps/frontend/src/components/CodeBlock.tsx
    - apps/frontend/src/components/FieldAnnotation.tsx
    - apps/frontend/src/__tests__/Chart.test.tsx
    - apps/frontend/src/__tests__/DataTable.test.tsx
    - apps/frontend/src/__tests__/Filters.test.tsx
    - apps/frontend/src/__tests__/Chrome.test.tsx
  modified: []

key-decisions:
  - "Chart.tsx passes CSS OKLCH custom-property strings directly to uPlot/canvas; band fills use OKLCH alpha syntax and fall back only when CSS variables are absent."
  - "Filters preserve the existing dashboard route schema for URL values; generated Harness labels are displayed without mutating /dashboard schema in this component-only plan."
  - "Filter composition order for 04-15/16 is Model, Tier, Harness, Region, Window, Limit type."

patterns-established:
  - "React components stay module-level; static option arrays are hoisted outside render."
  - "Route-backed controls use Route.useSearch and Route.useNavigate with stable callbacks."
  - "uPlot lifecycle owns construction, ResizeObserver sizing, prefers-color-scheme refresh, setData updates, and destroy cleanup."

requirements-completed: [WEB-03, WEB-04, WEB-05, WEB-08, WEB-09, WEB-10, WEB-11, WEB-13]

duration: 19min
completed: 2026-05-02
---

# Phase 04 Plan 14: Frontend Chart Components Summary

**uPlot chart wrapper, accessible table fallback, URL-synced dashboard controls, and status chrome components**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-02T20:52:00Z
- **Completed:** 2026-05-02T21:10:57Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 12

## Accomplishments

- Added `Chart.tsx` with uPlot lifecycle management, p25/p75 and p10/p90 bands, compare-tier p50 overlays, color + dash encodings, cursor sync, and `role="img"` / `aria-label`.
- Added `DataTable.tsx` as the accessible percentile table fallback below charts.
- Added URL-synced `Filters`, `BandToggle`, and `TierToggle` using the existing TanStack Router `/dashboard` search contract.
- Added `Chrome.tsx` with one `useStatus()` call, fuzzy contributor copy, relative update time, and health badges.
- Added `CodeBlock` and `FieldAnnotation` helpers for the later `/data` page.

## Chart Contract

`Chart.tsx` exports:

```ts
export interface ChartProps {
  data: uPlot.AlignedData;
  bands: { mode: "p25-p75" | "p10-p90" };
  compareMode?: { tiers: Array<{ tier: "pro" | "max5" | "max20"; data: uPlot.AlignedData }> };
  ariaLabel: string;
}
```

Single-tier data shape is `[xs, p10, p25, p50, p75, p90]`. Compare mode derives `[xs, proP50, max5P50, max20P50]` from each tier's p50 series. Tier strokes are `pro` solid, `max5` dashed `[8, 4]`, and `max20` dotted `[2, 4]`.

## Filter Composition

04-15 should render controls in this order: `Filters` grid (`Model`, `Tier`, `Harness`, `Region`, `Window`, `Limit type`), then `BandToggle`, then `TierToggle` near chart controls.

## Task Commits

1. **Task 1 RED: Chart/DataTable tests** - `e0e7494` (test)
2. **Task 1 GREEN: Chart/DataTable components** - `55839fa` (feat)
3. **Task 2 RED: filter URL tests** - `2460305` (test)
4. **Task 2 GREEN: filter/toggle components** - `65ae654` (feat)
5. **Task 2 follow-up: harness label alignment** - `d3b9448` (fix)
6. **Task 3 RED: Chrome/helper tests** - `6936b82` (test)
7. **Task 3 GREEN: Chrome/helper components** - `1a5ab28` (feat)

## Files Created/Modified

- `apps/frontend/src/components/Chart.tsx` - uPlot wrapper with bands, compare-tier strokes, cursor sync, CSS-var theming, ResizeObserver, and cleanup.
- `apps/frontend/src/components/DataTable.tsx` - shadcn Table percentile fallback with tabular numeric cells and empty state.
- `apps/frontend/src/components/Filters.tsx` - URL-synced shadcn Select controls with hoisted option arrays and stable search update callbacks.
- `apps/frontend/src/components/BandToggle.tsx` - URL-backed p25/p75 vs p10/p90 toggle.
- `apps/frontend/src/components/TierToggle.tsx` - URL-backed single-tier vs compare-tiers toggle.
- `apps/frontend/src/components/Chrome.tsx` - `_status.json` chrome row with relative time and health badge.
- `apps/frontend/src/components/CodeBlock.tsx` - mono, tabular canonical JSON block helper.
- `apps/frontend/src/components/FieldAnnotation.tsx` - field annotation helper for `/data`.
- `apps/frontend/src/__tests__/Chart.test.tsx` - uPlot constructor/series contract tests.
- `apps/frontend/src/__tests__/DataTable.test.tsx` - table semantics and empty-state tests.
- `apps/frontend/src/__tests__/Filters.test.tsx` - memory-router URL state tests.
- `apps/frontend/src/__tests__/Chrome.test.tsx` - status row and helper render tests.

## Decisions Made

- Used direct OKLCH canvas color path. Modern browser canvas accepts OKLCH; JSDOM tests mock uPlot and verify option contracts. No OKLCH-to-sRGB converter was added.
- Preserved current `/dashboard` search schema values for harness/window because this plan is component-only. Harness select displays generated labels while emitting route-valid `cc`/`codex`.
- Kept chart data table separate from `Chart.tsx` so 04-15 can place it below chart surfaces without nesting UI cards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Radix Select jsdom scroll shim**
- **Found during:** Task 2 GREEN
- **Issue:** Radix Select calls `scrollIntoView`, which jsdom does not implement, blocking URL-interaction tests.
- **Fix:** Added a local `Element.prototype.scrollIntoView = vi.fn()` shim in `Filters.test.tsx`.
- **Files modified:** `apps/frontend/src/__tests__/Filters.test.tsx`
- **Verification:** `pnpm --filter ./apps/frontend test:run -- src/__tests__/Filters.test.tsx` passed.
- **Committed in:** `65ae654`

**2. [Rule 2 - Missing Critical] Preserved route-safe harness values while displaying generated labels**
- **Found during:** Plan-level acceptance review
- **Issue:** The plan asked filters to use generated enum values, but current `/dashboard` search schema accepts `harness=cc|codex`; emitting generated `claude-code` would break URL validation, and runtime rules forbid route-schema edits in this component plan.
- **Fix:** Kept URL values as `cc|codex`, displayed generated Harness labels (`claude-code`, `codex`), and left `/dashboard` untouched.
- **Files modified:** `apps/frontend/src/components/Filters.tsx`
- **Verification:** `pnpm --filter ./apps/frontend test:run -- src/__tests__/Filters.test.tsx` and `pnpm --filter ./apps/frontend build` passed.
- **Committed in:** `d3b9448`

---

**Total deviations:** 2 auto-fixed (1 blocking test-environment issue, 1 route-contract compatibility issue).
**Impact on plan:** Components meet the dashboard component contract without assembling or editing the dashboard route.

## Issues Encountered

- Vitest/jsdom continues to print existing TanStack Router `window.scrollTo` not-implemented warnings. Tests pass; this warning predates the plan.
- The local GSD SDK was not available under `node_modules`; per runtime instruction, no `STATE.md` or `ROADMAP.md` mutation was attempted.

## Known Stubs

None. Stub scan only found legitimate null handling for chart/table state cleanup, optional table cell values, and test harness state.

## Threat Flags

None. This plan adds client-side components/tests only. No network endpoint, auth path, file access path, server schema, or trust-boundary change was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-15 can compose these components into the dashboard route. The chart/table/filter/status contracts are available, tested, and route-safe against the current `/dashboard` search schema.

## TDD Gate Compliance

- RED commits exist for all three TDD tasks: `e0e7494`, `2460305`, `6936b82`.
- GREEN commits exist after RED commits: `55839fa`, `65ae654`, `1a5ab28`.
- One follow-up fix commit exists for Task 2 route compatibility: `d3b9448`.

## Verification

- `pnpm --filter ./apps/frontend test:run -- src/__tests__/Chart.test.tsx src/__tests__/DataTable.test.tsx src/__tests__/Filters.test.tsx src/__tests__/Chrome.test.tsx` - PASS; Vitest reported 13 files and 36 tests passed, with existing jsdom `window.scrollTo` warnings.
- `pnpm --filter ./apps/frontend test:run` - PASS; 13 files, 36 tests.
- `pnpm --filter ./apps/frontend build` - PASS; `tsc -b && vite build` completed.
- Artifact grep gates - PASS; `Chart.tsx` contains `uPlot`, `ResizeObserver`, `prefers-color-scheme`, `role="img"`, and tier dash patterns; `Filters.tsx` contains `useSearch`/`useNavigate`; `Chrome.tsx` contains `useStatus`; `DataTable.tsx` uses shadcn `Table`.

## Self-Check: PASSED

- Created files exist: all eight component files, four test files, and this summary.
- Task commits exist in git history: `e0e7494`, `55839fa`, `2460305`, `65ae654`, `d3b9448`, `6936b82`, `1a5ab28`.
- Working tree before summary commit contained only orchestrator-owned `.planning/ROADMAP.md` and `.planning/STATE.md`.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
