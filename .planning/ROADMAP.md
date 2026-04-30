# Roadmap: bloclawd

## Overview

bloclawd ships a trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits." The roadmap walks the build-order critical path identified in research: a foundations gate (pricing + cross-language PoW invariant) before any implementation, then the ingest backbone, then the Rust CLI that produces real events against the deployed endpoint, then the aggregation cron + public dashboard that turn those events into a public data API and visualization, and finally distribution + DNS to take it live. Phases respect strict ordering — Phase 2 needs the PoW spec from Phase 1, Phase 3 needs a real ingest endpoint from Phase 2, Phase 4 needs real events flowing from Phase 3, and Phase 5 promotes the whole stack to a public, signed, notarized launch.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Pricing-confirmation gate, repo skeleton, cross-language PoW spec + fixtures + bilingual CI gate
- [ ] **Phase 2: Ingest Backbone** - PlanetScale Postgres schema, Hyperdrive bindings + WORKER_SECRET, Hono ingest Worker (`/challenge`, `/event`) with stateless HMAC challenges, payload validation, idempotency, server-assigned bucket_ts
- [ ] **Phase 3: Rust CLI** - `crates/cli` with defensive CC + Codex JSONL parsers, per-window aggregation, PoW solve, dry-run/yes/json submit path
- [ ] **Phase 4: Aggregation + Dashboard** - Cron worker (double-MAD trim, k-anonymity, log-binning, tiered R2 layout) + Vite/React/uPlot SPA (marketing, dashboard, methodology, data)
- [ ] **Phase 5: Launch** - cargo-dist (cargo + brew + install.sh), notarization, DNS for `.com`/`api.`/`data.`/`.org`, HSTS, public repo with license + threat-model README

## Phase Details

### Phase 1: Foundations
**Goal**: The byte-exact PoW invariant is frozen as a checked-in artifact tested in both Rust and TypeScript on every PR, and the database tier is confirmed and budgeted before any DB write — so all downstream phases inherit a stable contract.
**Depends on**: Nothing (first phase)
**Requirements**: SPEC-01, SPEC-02, SPEC-03, SPEC-04, BACK-01
**Success Criteria** (what must be TRUE):
  1. `spec/pow-v1.md` documents the byte-exact PoW input format (32-byte challenge_id || 32-byte payload_hash || 8-byte big-endian nonce, no separators), the leading-zero-bits-over-SHA-256 difficulty algorithm, and the HMAC-SHA256 stateless challenge model with a 60-second expiry; `spec/payload-canonical.md` documents RFC 8785 JCS as the canonical payload form for `payload_hash`; `spec/event-schema.md` documents the canonical `POST /event` payload referencing `spec/enums.json` as the machine-readable enum source of truth, with `tz_offset` marked never-persisted (client-only, dropped before submission).
  2. `spec/pow-fixtures.json` contains at least 10 cross-language vectors covering edge cases (k=0, k=1, k=22, k=23, all-zero challenge, all-FF challenge), and the same fixture file is consumed by both languages.
  3. A CI workflow runs `cargo test -p pow` and `vitest run pow` against the same fixtures on every PR; either failure blocks merge.
  4. A monorepo skeleton exists with `crates/pow` (Rust solver + verifier passing fixtures), `xtask/` (deterministic fixture generator with `gen-fixtures --check` drift mode), an `apps/worker/src/pow.ts` verifier (passing fixtures), and `spec/payload-canonical.md` (RFC 8785 JCS reference deliverable).
  5. PlanetScale tier is confirmed in writing in the planning trail and a billing alert is configured before any production DB write is attempted.
**Plans**: 6 plans
Plans:
- [x] 01-01-PLAN.md — Write spec/pow-v1.md (72-byte HMAC PoW), spec/payload-canonical.md (RFC 8785 JCS), spec/event-schema.md, spec/enums.json
- [x] 01-02-PLAN.md — ADR-001 PlanetScale tier (Phase 2 gate), LICENSE Apache-2.0, monorepo skeleton (Cargo + pnpm workspaces)
- [x] 01-03-PLAN.md — crates/pow Rust solver+verifier + xtask gen-fixtures + commit spec/pow-fixtures.json (≥10 vectors)
- [x] 01-04-PLAN.md — apps/worker/src/pow.ts TS verifier + vitest round-trip suite (workers-pool runtime)
- [ ] 01-05-PLAN.md — .github/workflows/pow.yml bilingual CI gate (rust-test + ts-test + fixture-drift) + branch protection
- [x] 01-06-PLAN.md — Edit PROJECT.md / REQUIREMENTS.md / CLAUDE.md (remove KV; reflect 72-byte HMAC + JCS; add SPEC-05)

### Phase 2: Ingest Backbone
**Goal**: A deployed Hono ingest Worker accepts validated, PoW-gated, idempotent events into a PlanetScale Postgres `events` table via Hyperdrive — without ever logging IPs, nonces, or per-event timing — so the CLI in the next phase has a real endpoint to submit against.
**Depends on**: Phase 1 (PoW spec + TS verifier)
**Requirements**: BACK-02, BACK-03, BACK-04, INGE-01, INGE-02, INGE-03, INGE-04, INGE-05, INGE-06, INGE-07, INGE-08, INGE-09, INGE-10, INGE-11
**Success Criteria** (what must be TRUE):
  1. `GET /challenge` issues a stateless HMAC-signed challenge `{challenge_id_b64, sig_b64, difficulty, expires_in}` where `challenge_id (32B) = unix_ms_be (8B) || crypto_random (24B)` and `sig = HMAC-SHA256(WORKER_SECRET, challenge_id)` with a 60-second expiry; `POST /event` verifies HMAC + expiry + payload_hash binding via the Phase 1 verifier (no KV lookup), validates the payload against `spec/enums.json` with zod, and inserts into PlanetScale Postgres via Hyperdrive.
  2. The `events` table exists with `event_id UUID PRIMARY KEY`, `bucket_ts TIMESTAMPTZ` server-assigned and floored to 15 minutes, `payload JSONB`, `received_at TIMESTAMPTZ DEFAULT now()`, split-out `model`/`tier`/`harness`/`region` columns, and an index on `(bucket_ts, model, tier, harness, region)`; duplicate `event_id` submissions are silently idempotent.
  3. PoW input binds the payload hash so a solved challenge cannot be reused with a different payload; the per-request `pg`/node-postgres client is closed via `ctx.waitUntil(client.end())`; `compatibility_date` is pinned with a comment, `nodejs_compat` is explicit, and Worker placement is `smart`.
  4. Edge rate-limiting throttles abusive callers per IP via an in-memory token bucket without ever persisting an IP, and no log line anywhere contains `event_id`, `nonce`, or per-event timing.
  5. An end-to-end happy-path test (`GET /challenge` → PoW solve in test harness → `POST /event` → PlanetScale Postgres row visible) passes against a deployed staging Worker.
**Plans**: TBD

### Phase 3: Rust CLI
**Goal**: A user who just hit a rate limit on Claude Code or Codex can run `bloclawd --5h --cc` (or `--codex`), see exactly what would be submitted, confirm with `[y/N]`, and have an anonymous, PoW-gated event accepted by the live ingest Worker — with defensive parsers that survive CC/Codex format drift.
**Depends on**: Phase 2 (live ingest endpoint)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09, CLI-10, CLI-11, CLI-12, CLI-13, CLI-14, CLI-15, CLI-16, CLI-17, CLI-18
**Success Criteria** (what must be TRUE):
  1. `bloclawd --5h --cc` (and `--codex`, `--week`, `--end <local-time>`) walks the local session artifacts, parses JSONL line-by-line via `serde_json::Value` + tolerant `.get()` walks, surfaces a per-line parse-failure counter, and never aborts on a single bad line.
  2. The CLI computes per-model, per-window (5-min and 1-hour) token counts (input, output, cached read, cached write), captures harness/tier/`tz_offset`/country (via `sys-locale`, `BLOCLAWD_COUNTRY=` override accepted), and produces a UUIDv4 `event_id` (never v7).
  3. `--dry-run` prints the payload byte-identically to what `--yes` would submit (single canonical formatter); a `[y/N]` confirmation is shown by default; `--yes` skips the prompt; `--json` emits machine-readable status; `NO_COLOR`/TTY auto-detect and `--no-color` are honored; documented exit codes (0/1/2/3/4) are followed.
  4. The PoW solver uses `sha2`, reports progress, hard-times-out at 30 seconds, then submits via `reqwest` blocking + `rustls-tls` to `https://api.bloclawd.com/event`; an end-to-end run from a real CC or Codex session lands a row in PlanetScale.
  5. Anonymized fixture session files for both CC and Codex are committed to the repo and a CI test asserts known token totals against them; minimum supported CC and Codex versions are documented in the README and asserted at startup with a helpful error if older.
**Plans**: TBD

### Phase 4: Aggregation + Dashboard
**Goal**: Every 15 minutes the cron worker turns raw events into a tiered, k-anonymous, log-binned public dataset on R2, and a Vite + React SPA at `bloclawd.com/dashboard` lets anyone explore that dataset with URL-synced filters, spread bands, and tier comparison overlays — without ever exposing raw counts, `event_id`, `nonce`, or `tz_offset`.
**Depends on**: Phase 3 (real events flowing into PlanetScale)
**Requirements**: AGGR-01, AGGR-02, AGGR-03, AGGR-04, AGGR-05, AGGR-06, AGGR-07, AGGR-08, AGGR-09, AGGR-10, AGGR-11, AGGR-12, AGGR-13, AGGR-14, WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, WEB-07, WEB-08, WEB-09, WEB-10, WEB-11, WEB-12, WEB-13, WEB-14, WEB-15, WEB-16, WEB-17
**Success Criteria** (what must be TRUE):
  1. The Worker `scheduled` handler runs every 15 minutes, applies per-cohort double-MAD trim at 3 × MAD (separate upper/lower MAD; cohort = `(model, tier, harness, region)`) before computing p10/p25/p50/p75/p90 via `PERCENT_RANK()` over trimmed rows, suppresses any cell with n<5, log-bins token counts before emission, drops `tz_offset`, and never writes `event_id` or `nonce` to any R2 file; trim-rate is surfaced as a metric (>5% warns, >10% escalates).
  2. R2 holds a tiered layout (`reports/v1/q15/...` past 24h, `reports/v1/h1/...` past 7d, `reports/v1/d1/...` indefinite), each bucket file contains dimension-pre-aggregated `cells[]`, rolled-over buckets are written with `Cache-Control: public, max-age=31536000, immutable`, and `manifest.json` (max-age=60, must-revalidate) is updated last after all bucket writes succeed; `enums.json` and `_status.json` are published.
  3. `/` (marketing), `/dashboard`, `/methodology` (with PoW spec link, double-MAD policy, k-anonymity policy, log-binning policy, source-repo link), `/methodology/changelog`, and `/data` (literal payload schema byte-identical to CLI dry-run via the shared canonical formatter) are reachable on a Vite 6 + React 19 SPA deployed via `@cloudflare/vite-plugin` with SPA fallback; CC BY 4.0 is declared as the public-data license.
  4. The dashboard renders a uPlot timeseries with toggleable spread bands (default p25/p75; toggle to p10/p90; persisted in URL), filters for model/tier/harness/region/time-window all URL-synced from day 1, side-by-side tier comparison overlay (Pro/Max5/Max20), TanStack Query v5 with `staleTime: Infinity` for past q15/h1/d1 buckets and concurrency cap 8, lazy bucket loading that picks the coarsest tier fitting the window (q15 ≤24h, h1 ≤7d, d1 beyond), hover tooltips with numeric values, last-updated + total events + approximate contributor count, and an ingest health indicator sourced from `_status.json`.
  5. The dashboard is mobile-responsive, supports dark mode via `prefers-color-scheme` (no toggle in v1), uses color-independent line styling (different stroke patterns + color), and renders an accessible HTML `<table>` data fallback below each chart.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Launch
**Goal**: `bloclawd` is publicly installable via `cargo install bloclawd`, `brew install <tap>/bloclawd`, and `curl bloclawd.com/install.sh | sh` (with notarized macOS binaries); the four canonical domains route correctly with HSTS; and the public repo declares its license and threat-model so first users can trust what they're running.
**Depends on**: Phase 4 (stable public R2 contract + dashboard demo-able)
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07, DIST-08, DIST-09, DIST-10
**Success Criteria** (what must be TRUE):
  1. `cargo dist init` is configured with targets `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-musl` and installers `["shell", "homebrew"]`; a tag push triggers a GitHub Release that uploads prebuilt binaries and auto-PRs the `homebrew-bloclawd` tap formula.
  2. macOS binaries are signed and notarized via `notarytool` (Apple Developer account active); `cargo install bloclawd` works against `crates.io`; `install.sh` is served from `bloclawd.com/install.sh` as a frontend Worker static asset.
  3. `bloclawd.com` apex + `www` route to the frontend Worker, `api.bloclawd.com` is attached as a Worker custom domain to the ingest Worker, `data.bloclawd.com` is attached as an R2 custom domain, and `bloclawd.org` 301-redirects to `bloclawd.com` via Cloudflare Bulk Redirect (no Worker in path).
  4. "Always Use HTTPS" + HSTS are enabled on the zone; the public repo carries an MIT or Apache-2.0 LICENSE file and a README that documents install paths (cargo / brew / curl), supported CC and Codex versions, links to `/methodology` and `/data`, and includes the threat-model section ("we don't trust your CLI either").
  5. A first-user smoke test (fresh laptop, no prior install) succeeds end-to-end: install via one of the three channels, run `bloclawd --5h --cc` against a real session, confirm submission, and observe the event surface in the public dashboard within the next 15-minute cron tick.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 5/6 | Executing — awaiting GitHub branch-protection checkpoint | - |
| 2. Ingest Backbone | 0/TBD | Not started | - |
| 3. Rust CLI | 0/TBD | Not started | - |
| 4. Aggregation + Dashboard | 0/TBD | Not started | - |
| 5. Launch | 0/TBD | Not started | - |

## Research Flags

Phases that should run `/gsd-research-phase` before `/gsd-plan-phase`:

- **Phase 3 (Rust CLI):** NEEDS PHASE RESEARCH — CC/Codex session JSONL formats are the least-stable upstream contract; pin current field shapes against checked-in fixtures, identify minimum supported versions per harness, and document graceful-degradation behavior before planning.

Phases with standard / well-documented patterns (skip research-phase):

- Phase 1 (Foundations) — STANDARD
- Phase 2 (Ingest Backbone) — STANDARD
- Phase 4 (Aggregation + Dashboard) — STANDARD
- Phase 5 (Launch) — STANDARD

---
*Roadmap created: 2026-04-30*
