---
phase: 04-aggregation-dashboard
plan: 11
subsystem: frontend
tags: [vite, react, cloudflare-workers, tanstack-router, tanstack-query, tailwind, shadcn, vitest]

requires:
  - phase: 04-01
    provides: ts-rs bindings in apps/web/src/generated consumed through @web/*
provides:
  - Vite 6.4.2 + React 19.2.5 frontend Worker scaffold
  - Cloudflare static-assets binding with SPA fallback
  - Tailwind v4.2.4 CSS-first shadcn theme setup
  - 11 official shadcn UI primitives and Vitest smoke coverage
affects: [frontend-routes, frontend-r2-canonical, frontend-chart-components, launch]

tech-stack:
  added: [vite 6.4.2, react 19.2.5, "@cloudflare/vite-plugin 1.35.0", "@tanstack/react-router 1.169.1", "@tanstack/react-query 5.100.8", "uplot 1.6.32", "tailwindcss 4.2.4", "shadcn 4.6.0 primitives", "vitest 4.1.5"]
  patterns: [standalone-static-frontend-worker, css-first-tailwind-v4, shadcn-official-primitives, cross-app-ts-rs-alias]

key-files:
  created:
    - apps/frontend/package.json
    - apps/frontend/vite.config.ts
    - apps/frontend/wrangler.toml
    - apps/frontend/components.json
    - apps/frontend/src/components/ui/
    - apps/frontend/vitest.config.ts
  modified:
    - .gitignore
    - pnpm-lock.yaml

key-decisions:
  - "Kept ts-rs output at apps/web/src/generated and exposed it to the frontend as @web/* per RESEARCH OQ A11."
  - "Pinned @vitejs/plugin-react to 5.2.0 because 6.0.1 imports Vite internals not exported by Vite 6.4.2."
  - "Created a minimal TanStack __root route so the router generator runs cleanly before real route shells land."
  - "Used official shadcn add output with a manually equivalent components.json because shadcn@4.6.0 no longer accepts preset id default."

patterns-established:
  - "Frontend Worker is static-assets only: no Hyperdrive, database, PoW, or server runtime dependencies."
  - "Tailwind v4 stays CSS-first; shadcn variables live in globals.css until 04-12 replaces them with tokens.css."
  - "Vitest config mirrors Vite path aliases for @ and @web."

requirements-completed: [WEB-01]

duration: 14min
completed: 2026-05-02
---

# Phase 04 Plan 11: Frontend Scaffold Summary

**Vite 6 + React 19 static frontend Worker scaffold with TanStack, Tailwind v4, shadcn primitives, and Vitest smoke coverage**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-02T20:06:53Z
- **Completed:** 2026-05-02T20:20:19Z
- **Tasks:** 2
- **Files modified:** 30

## Accomplishments

- Created `apps/frontend/` as a standalone Vite/React/TypeScript SPA with Cloudflare Workers static-assets config and SPA fallback.
- Added path aliases `@/*` and `@web/*`, preserving the `apps/web/src/generated/` ts-rs binding source.
- Added Tailwind v4 CSS-first setup, self-hosted Inter and JetBrains Mono, TanStack Query defaults, and TanStack Router generator scaffolding.
- Added official shadcn primitives: `button`, `select`, `label`, `popover`, `toggle`, `badge`, `card`, `table`, `hover-card`, `separator`, `skeleton`.
- Added Vitest config and a smoke test proving the Vite scaffold and shadcn primitive import path work.

## Task Commits

1. **Task 1: Initialize frontend scaffold** - `9cc4cef` (feat)
2. **Task 2: Add shadcn primitives and Vitest smoke** - `cca9b5a` (feat)

## Files Created/Modified

- `apps/frontend/package.json` - Frontend scripts and pinned SPA/tooling dependencies.
- `apps/frontend/vite.config.ts` - Cloudflare, React, TanStack Router, Tailwind, aliases, and build/test config.
- `apps/frontend/wrangler.toml` - Static assets binding with SPA fallback and staging/production env split.
- `apps/frontend/src/main.tsx` - React root with QueryClient provider and scaffold placeholder.
- `apps/frontend/src/routes/__root.tsx`, `apps/frontend/src/routeTree.gen.ts` - Minimal TanStack Router generator scaffold.
- `apps/frontend/src/styles/globals.css` - Tailwind v4 entry, shadcn OKLCH variables, and prefers-color-scheme dark variables.
- `apps/frontend/components.json`, `apps/frontend/src/lib/utils.ts`, `apps/frontend/src/components/ui/*.tsx` - shadcn config, `cn()` helper, and 11 primitives.
- `apps/frontend/vitest.config.ts`, `apps/frontend/src/__tests__/*` - Vitest smoke setup.
- `.gitignore` - Explicit frontend `dist/` and `node_modules/` ignores.
- `pnpm-lock.yaml` - Workspace dependency lock update.

## Pinned Frontend Versions

- `vite`: 6.4.2
- `react` / `react-dom`: 19.2.5
- `@cloudflare/vite-plugin`: 1.35.0
- `@tanstack/react-router`: 1.169.1
- `@tanstack/router-plugin`: 1.167.32
- `@tanstack/react-query`: 5.100.8
- `uplot`: 1.6.32
- `tailwindcss` / `@tailwindcss/vite`: 4.2.4
- `vitest`: 4.1.5
- `@fontsource-variable/inter` / `@fontsource-variable/jetbrains-mono`: 5.2.8

## Decisions Made

- Preserved `@web/* -> ../web/src/generated/*` instead of moving ts-rs output.
- Added `src/routes/__root.tsx` because TanStack Router generation requires a root route even before user-facing route shells exist.
- Kept frontend server/database-free; package guard confirms no `@planetscale/*`, `pow`, or `tokio-postgres` direct dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned a Vite-6-compatible React plugin**
- **Found during:** Task 1
- **Issue:** `@vitejs/plugin-react@6.0.1` imports a Vite internal subpath that Vite 6.4.2 does not export.
- **Fix:** Pinned `@vitejs/plugin-react` to 5.2.0, whose peer range includes Vite 6.
- **Files modified:** `apps/frontend/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter ./apps/frontend build` passed.
- **Committed in:** `9cc4cef`

**2. [Rule 3 - Blocking] Added minimal TanStack root route**
- **Found during:** Task 1
- **Issue:** The TanStack Router generator logged errors until `src/routes/__root.tsx` existed.
- **Fix:** Added a root route and committed generated `routeTree.gen.ts`; real route shells remain for 04-12/04-13.
- **Files modified:** `apps/frontend/src/routes/__root.tsx`, `apps/frontend/src/routeTree.gen.ts`
- **Verification:** `pnpm --filter ./apps/frontend build` passed without generator errors.
- **Committed in:** `9cc4cef`

**3. [Rule 3 - Blocking] Replaced invalid shadcn init preset flow**
- **Found during:** Task 2
- **Issue:** `shadcn@4.6.0 init --preset default` is invalid; the CLI lists only named presets (`nova`, `vega`, etc.).
- **Fix:** Created an equivalent official `components.json` with `style: "default"`, slate base, CSS variables, and Lucide, then ran `shadcn@4.6.0 add` for the prescribed official primitives.
- **Files modified:** `apps/frontend/components.json`, `apps/frontend/src/components/ui/*`
- **Verification:** All 11 primitive files exist and `pnpm --filter ./apps/frontend test:run` passed.
- **Committed in:** `cca9b5a`

**4. [Rule 3 - Blocking] Added missing shadcn helper deps and Vitest aliases**
- **Found during:** Task 2
- **Issue:** Manual shadcn config required direct helper deps (`clsx`, `tailwind-merge`, `class-variance-authority`) and separate Vitest config did not inherit `@` aliases.
- **Fix:** Added exact helper dependencies, shadcn theme/animation CSS, and mirrored aliases in `vitest.config.ts`.
- **Files modified:** `apps/frontend/package.json`, `apps/frontend/src/styles/globals.css`, `apps/frontend/vitest.config.ts`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter ./apps/frontend test:run` and `pnpm --filter ./apps/frontend build` passed.
- **Committed in:** `cca9b5a`

---

**Total deviations:** 4 auto-fixed (Rule 3).
**Impact on plan:** All fixes were required for the requested scaffold to build, test, and use generated router/shadcn assets cleanly. No scope outside `apps/frontend/*`, root `.gitignore`, and `pnpm-lock.yaml`.

## Issues Encountered

- `gsd-sdk` was not available on PATH and local `node_modules/@gsd-build/sdk` was absent, so commits were made with direct `git` commands.
- `.planning/ROADMAP.md` and `.planning/STATE.md` were already dirty from orchestration and were intentionally left unstaged and unmodified.

## Known Stubs

- `apps/frontend/src/main.tsx:19` - Temporary scaffold copy; route content lands in 04-12/04-13.
- `apps/frontend/src/styles/globals.css:99` - `tokens.css` import placeholder for 04-12 design-token override.
- `apps/frontend/src/__tests__/setup.ts:1` - Vitest setup placeholder for 04-22 matcher additions.

## Threat Flags

None. The new surface is the planned static-assets frontend Worker; no network endpoint, auth path, database dependency, or server-side secret access was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-12 can add token overrides and route shells without build setup. 04-13 can use `@web/*` and the installed TanStack/Query surface. 04-14 can import the shadcn primitives from `@/components/ui/*`.

## Verification

- `pnpm install` - passed.
- `pnpm --filter ./apps/frontend build` - passed; produced `apps/frontend/dist/index.html`.
- `pnpm --filter ./apps/frontend test:run` - passed; 1 file, 2 tests.
- `pnpm --filter ./apps/frontend dev --host 127.0.0.1 --port 4311` + fetch `/` - passed with HTTP 200.
- Component gate - passed; 11 `.tsx` primitives present in `apps/frontend/src/components/ui/`.
- Tailwind v4 gate - passed; no `apps/frontend/tailwind.config.js` or `.ts`.
- Frontend server-deps gate - passed; no forbidden `@planetscale/*`, `pow`, or `tokio-postgres` dependency.

## Self-Check: PASSED

- Created files exist: summary, frontend package/config files, shadcn primitives, and build output.
- Task commits exist in git history: `9cc4cef`, `cca9b5a`.
- Working tree only has pre-existing orchestrator edits to `.planning/ROADMAP.md` and `.planning/STATE.md`.

---
*Phase: 04-aggregation-dashboard*
*Completed: 2026-05-02*
