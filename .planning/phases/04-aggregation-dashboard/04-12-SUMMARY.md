---
phase: 04-aggregation-dashboard
plan: 12
subsystem: frontend
tags: [react, vite, tanstack-router, tanstack-query, tailwind, shadcn, zod, vitest]

requires:
  - phase: 04-11
    provides: Vite React frontend scaffold with TanStack Router plugin, Query, Tailwind v4, shadcn primitives, and Vitest
provides:
  - UI-SPEC OKLCH light/dark design tokens in tokens.css
  - Shared RouteShell header/footer and EmptyState component
  - TanStack Router barrel, root shell route, and five file routes
  - dashboardSearchSchema and DashboardSearch export for downstream dashboard/filter plans
affects: [frontend-r2-canonical, frontend-chart-components, frontend-dashboard-assembly, methodology-data]

tech-stack:
  added: [zod 3.25.76]
  patterns: [prefers-color-scheme-tokens, route-shell-layout, file-based-routes, zod-search-schema]

key-files:
  created:
    - apps/frontend/src/styles/tokens.css
    - apps/frontend/src/router.tsx
    - apps/frontend/src/components/RouteShell.tsx
    - apps/frontend/src/components/EmptyState.tsx
    - apps/frontend/src/routes/index.tsx
    - apps/frontend/src/routes/dashboard.tsx
    - apps/frontend/src/routes/methodology.tsx
    - apps/frontend/src/routes/methodology.changelog.tsx
    - apps/frontend/src/routes/data.tsx
    - apps/frontend/src/__tests__/tokens.test.ts
    - apps/frontend/src/__tests__/route_shell.test.tsx
    - apps/frontend/src/__tests__/routes.test.tsx
    - apps/frontend/src/__tests__/home_page_ctas.test.tsx
  modified:
    - apps/frontend/src/styles/globals.css
    - apps/frontend/src/main.tsx
    - apps/frontend/src/routes/__root.tsx
    - apps/frontend/src/routeTree.gen.ts
    - apps/frontend/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Kept dark mode CSS-only via @media (prefers-color-scheme: dark); no .dark class or toggle."
  - "Committed TanStack routeTree.gen.ts after adding file routes so tsc passes before Vite plugin regeneration."
  - "Exported dashboardSearchSchema from /dashboard as the downstream URL-search contract."

patterns-established:
  - "Route components are module-level functions; static header/footer data is hoisted outside React renders."
  - "RouteShell uses plain anchors for static navigation so shell tests do not require router context."
  - "Dashboard search defaults live in a zod schema colocated with the dashboard route."

requirements-completed: [WEB-02, WEB-12, WEB-13, WEB-16, WEB-17]

duration: 13min
completed: 2026-05-02
---

# Phase 04 Plan 12: Frontend Tokens + Routes Summary

**CSS-only light/dark tokens plus TanStack route shells for the public SPA**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-02T20:25:02Z
- **Completed:** 2026-05-02T20:37:31Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- Moved UI-SPEC light/dark OKLCH variables into `tokens.css`, including chart palette variables for downstream uPlot work.
- Added shared `RouteShell` with wordmark, responsive shell, footer tagline, CC BY 4.0 copy, and middle-dot footer links.
- Replaced the frontend stub with TanStack Router provider and a generated five-route file tree.
- Added route pages for `/`, `/dashboard`, `/methodology`, `/methodology/changelog`, and `/data`.
- Exported `dashboardSearchSchema` and `DashboardSearch` from `/dashboard` for 04-13/04-15/04-16 consumers.

## Task Commits

1. **Task 1 RED: design token tests** - `63da775` (test)
2. **Task 1 GREEN: design tokens** - `4d53c22` (feat)
3. **Task 2 RED: route shell test** - `0c66739` (test)
4. **Task 2 GREEN: route shell and router provider** - `267c561` (feat)
5. **Task 3 RED: route scaffold tests** - `48cb24b` (test)
6. **Task 3 GREEN: route shells** - `d44eb86` (feat)

## Files Created/Modified

- `apps/frontend/src/styles/tokens.css` - UI-SPEC surface and chart variables for light and OS dark mode.
- `apps/frontend/src/styles/globals.css` - Imports Tailwind then tokens, keeps shadcn theme mappings, no `.dark` block.
- `apps/frontend/src/components/RouteShell.tsx` - Shared header, main wrapper, footer tagline, and footer links.
- `apps/frontend/src/components/EmptyState.tsx` - Reusable shadcn Card empty-state component.
- `apps/frontend/src/router.tsx`, `apps/frontend/src/main.tsx`, `apps/frontend/src/routes/__root.tsx` - Router instance, provider wiring, and root shell.
- `apps/frontend/src/routes/*.tsx` - Five route shells and `/dashboard` search schema export.
- `apps/frontend/src/routeTree.gen.ts` - Generated TanStack route tree including all five routes.
- `apps/frontend/src/__tests__/*` - Vitest coverage for tokens, shell, routes, and home CTAs.
- `apps/frontend/package.json`, `pnpm-lock.yaml` - Direct `zod` dependency for route search validation.

## Dashboard Search Contract

`apps/frontend/src/routes/dashboard.tsx` exports:

- `dashboardSearchSchema`
- `DashboardSearch`

Defaults: `harness=cc`, `limit_type=5h`, `window=7d`, `bands=p25-p75`, `compare=false`. Optional fields: `model`, `region`, `tier`.

## Decisions Made

- Used a dedicated `tokens.css` file and kept Tailwind/shadcn utility mappings in `globals.css`.
- Used `@media (prefers-color-scheme: dark)` only, matching WEB-12.
- Kept route page components module-level and hoisted static nav/footer data to avoid inline component churn.
- Added `zod` directly because the route schema is a load-bearing exported contract, not a test-only helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing direct zod dependency**
- **Found during:** Task 3 (route shells)
- **Issue:** `/dashboard` must export a zod schema, but `apps/frontend` did not declare `zod` as a direct dependency.
- **Fix:** Added `zod@3.25.76` to `apps/frontend/package.json` with lockfile update.
- **Files modified:** `apps/frontend/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter ./apps/frontend build` and `pnpm --filter ./apps/frontend test:run` passed.
- **Committed in:** `d44eb86`

**2. [Rule 1 - Bug] Fixed nested changelog route rendering**
- **Found during:** Task 3 route tests
- **Issue:** TanStack dot-file routing nests `methodology.changelog.tsx` under `/methodology`; without an outlet, `/methodology/changelog` rendered only the parent page.
- **Fix:** Added an `Outlet` path branch in `methodology.tsx` so the changelog route renders its own empty-state copy.
- **Files modified:** `apps/frontend/src/routes/methodology.tsx`, `apps/frontend/src/routeTree.gen.ts`
- **Verification:** Route tests passed for `/methodology/changelog`.
- **Committed in:** `d44eb86`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** Both fixes were required for the specified route/schema contract to build and render. No data libraries or chart components were implemented.

## Issues Encountered

- `pnpm --filter ./apps/frontend build` runs `tsc -b` before Vite can regenerate TanStack routes, so the first build after adding route files failed against stale `routeTree.gen.ts`. Running Vite generation produced the route tree; the generated file is committed and subsequent build runs pass.
- Vitest route renders print jsdom `window.scrollTo` not-implemented warnings from TanStack Router scroll restoration, but all tests pass.

## Known Stubs

- `apps/frontend/src/routes/index.tsx:5` - GitHub URL points at `https://github.com/tibal/bloclawd`.
- `apps/frontend/src/routes/dashboard.tsx:27` - Dashboard placeholder copy is intentional; dashboard assembly lands in 04-15.
- `apps/frontend/src/routes/methodology.tsx:25` - Methodology body placeholder is intentional; full methodology content lands in 04-16.
- `apps/frontend/src/routes/data.tsx:19` - Canonical bytes pane placeholder is intentional; `/data` implementation lands in 04-16.

## Threat Flags

None. This plan adds static frontend routes, CSS tokens, tests, and a client-side search schema. No network endpoint, auth path, database access, file access pattern, or server-side trust boundary changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-13 can import the router/search surface and add R2/canonical helpers. 04-14 can rely on `--chart-1`, `--chart-2`, `--chart-3`, `--chart-grid`, and `--chart-crosshair`. 04-15 can import `DashboardSearch` from `apps/frontend/src/routes/dashboard.tsx`.

## TDD Gate Compliance

- RED commits exist for all three TDD tasks: `63da775`, `0c66739`, `48cb24b`.
- GREEN commits exist after each RED commit: `4d53c22`, `267c561`, `d44eb86`.

## Verification

- `pnpm --filter ./apps/frontend build` - passed.
- `pnpm --filter ./apps/frontend test:run` - passed; 5 files, 11 tests. jsdom emitted `window.scrollTo` warnings only.
- Route file gate - passed; `router.tsx`, `__root.tsx`, and all five route files exist.
- Footer gate - passed; exact `Anonymous. PoW-gated. Open data (CC BY 4.0).` copy found.
- Dark-mode gate - passed; no `.dark {` block in `globals.css`.
- Dashboard schema gate - passed; `export const dashboardSearchSchema` found in `dashboard.tsx`.

## Self-Check: PASSED

- Created files exist: summary, tokens, router, shell components, and five route files.
- Task commits exist in git history: `63da775`, `4d53c22`, `0c66739`, `267c561`, `48cb24b`, `d44eb86`.
- Working tree has only orchestrator edits to `.planning/ROADMAP.md` and `.planning/STATE.md` plus this ignored summary before metadata commit.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
