# Roadmap: bloclawd

## Overview

bloclawd ships a trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits." The roadmap walks the build-order critical path identified in research: a foundations gate (pricing + cross-language PoW invariant) before any implementation, then the ingest backbone, then the Rust CLI that produces real events against the deployed endpoint, then the aggregation cron + public dashboard that turn those events into a public data API and visualization, and finally distribution + DNS to take it live. Phases respect strict ordering — Phase 2 needs the PoW spec from Phase 1, Phase 3 needs a real ingest endpoint from Phase 2, Phase 4 needs real events flowing from Phase 3, and Phase 5 promotes the whole stack to a public, signed, notarized launch.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Pricing-confirmation gate, repo skeleton, cross-language PoW spec + fixtures + bilingual CI gate
- [x] **Phase 1.5: Worker Rust Migration (INSERTED)** - Replace the legacy TypeScript Worker scaffold with a Rust Worker built on `workers-rs`; make Rust the single source of truth for event payload + enums + JCS helpers in `crates/event-schema`, with `ts-rs` generating TypeScript bindings into `apps/web/src/generated/`; delete the former enum JSON artifact and any other parallel JSON/TS schema sources; retire the TypeScript PoW verifier in favour of a shared `crates/pow` consumer; collapse the bilingual CI gate to single-language Rust plus ts-rs/log/size gates; rewrite all stack/spec references
- [ ] **Phase 2: Ingest Backbone** - PlanetScale Postgres schema, Hyperdrive bindings + WORKER_SECRET, Rust ingest Worker (`workers-rs`, `/challenge`, `/event`) with stateless HMAC challenges, payload validation, idempotency, server-assigned bucket_ts
- [ ] **Phase 3: Rust CLI** - `crates/cli` with defensive CC + Codex JSONL parsers, per-window aggregation, PoW solve, dry-run/yes/json submit path
- [ ] **Phase 4: Aggregation + Dashboard** - Cron worker (double-MAD trim, k-anonymity, log-binning, tiered R2 layout) + Vite/React/uPlot SPA (marketing, dashboard, methodology, data)
- [ ] **Phase 5: Launch** - cargo-dist (cargo + brew + install.sh), notarization, DNS for `.com`/`api.`/`data.`/`.org`, HSTS, public repo with license + threat-model README

## Phase Details

### Phase 1: Foundations
**Goal**: The byte-exact PoW invariant is frozen as a checked-in artifact tested in both Rust and TypeScript on every PR, and the database tier is confirmed and budgeted before any DB write — so all downstream phases inherit a stable contract.
**Depends on**: Nothing (first phase)
**Requirements**: SPEC-01, SPEC-02, SPEC-03, SPEC-04, BACK-01
**Success Criteria** (what must be TRUE):
  1. `spec/pow-v1.md` documents the byte-exact PoW input format (32-byte challenge_id || 32-byte payload_hash || 8-byte big-endian nonce, no separators), the leading-zero-bits-over-SHA-256 difficulty algorithm, and the HMAC-SHA256 stateless challenge model with a 60-second expiry; `spec/payload-canonical.md` documents RFC 8785 JCS as the canonical payload form for `payload_hash`; `spec/event-schema.md` documents the canonical `POST /event` payload and, after Phase 1.5, points at `crates/event-schema/src/enums.rs` plus `apps/web/src/generated/` for enum/type truth.
  2. `spec/pow-fixtures.json` contains at least 10 cross-language vectors covering edge cases (k=0, k=1, k=22, k=23, all-zero challenge, all-FF challenge), and the same fixture file is consumed by both languages.
  3. A CI workflow runs Rust and transitional TypeScript PoW fixture checks on every PR during Phase 1; after Phase 1.5, the gate is Rust-only plus ts-rs/log/size checks.
  4. A monorepo skeleton exists with `crates/pow` (Rust solver + verifier passing fixtures), `xtask/` (deterministic fixture generator with `gen-fixtures --check` drift mode), a transitional TypeScript verifier for the initial bridge, and `spec/payload-canonical.md` (RFC 8785 JCS reference deliverable).
  5. PlanetScale tier is confirmed in writing in the planning trail and a billing alert is configured before any production DB write is attempted.
**Plans**: 6 plans
Plans:
- [x] 01-01-PLAN.md — Write spec/pow-v1.md (72-byte HMAC PoW), spec/payload-canonical.md (RFC 8785 JCS), spec/event-schema.md, initial enum list
- [x] 01-02-PLAN.md — ADR-001 PlanetScale tier (Phase 2 gate), LICENSE Apache-2.0, monorepo skeleton (Cargo + pnpm workspaces)
- [x] 01-03-PLAN.md — crates/pow Rust solver+verifier + xtask gen-fixtures + commit spec/pow-fixtures.json (≥10 vectors)
- [x] 01-04-PLAN.md — Transitional TypeScript PoW verifier + Worker runtime round-trip suite
- [ ] 01-05-PLAN.md — .github/workflows/pow.yml bilingual CI gate (rust-test + ts-test + fixture-drift) + branch protection
- [x] 01-06-PLAN.md — Edit PROJECT.md / REQUIREMENTS.md / CLAUDE.md (remove KV; reflect 72-byte HMAC + JCS; add SPEC-05)

### Phase 1.5: Worker Rust Migration (INSERTED)
**Goal**: Flip the backend Worker stack from the legacy TypeScript scaffold to Rust before any ingest endpoint ships, AND make Rust the single source of truth for shared types — the Phase 1 TypeScript Worker bridge is replaced with a `workers-rs`-based Rust Worker; canonical event/enum/JCS types are defined natively in `crates/event-schema` (no parallel JSON schema), with `ts-rs` generating TypeScript bindings into `apps/web/src/generated/`; the former enum JSON artifact is deleted; the bilingual PoW CI gate collapses to a single-language Rust gate plus ts-rs/log/size gates; every stack reference (PROJECT, CLAUDE, REQUIREMENTS, STACK, ARCHITECTURE, spec/*) is rewritten so downstream phases inherit a Rust-only backend with Rust-as-source-of-truth shared types.
**Depends on**: Phase 1 (PoW spec + Rust solver/verifier in `crates/pow` + `spec/pow-fixtures.json`; the TS verifier and bilingual gate land first inside Phase 1, then are retired by this phase)
**Requirements**: BACK-05, BACK-06, BACK-07, BACK-08; rewrites of SPEC-04, SPEC-05, BACK-04, INGE-03, INGE-07, INGE-08, INGE-10, INGE-11
**Research**: COMPLETED — `workers-rs 0.8.1` provides first-class `Hyperdrive` and `RateLimiter` typed bindings; `tokio-postgres` over workers-rs `Socket` works in staging with upstream rev `35a85bdbfeeac465e092950f65a10d9192418175` and `query_typed_one`; `serde_jcs = "0.2"` remains the Rust JCS crate with RFC 8785 KAT coverage; payload validation is hand-rolled on top of serde and closed enums; `worker-build 0.8.1` is the Rust-to-WASM pipeline; `ts-rs = "12"` emits bindings into `apps/web/src/generated/`.
**Success Criteria** (what must be TRUE):
  1. `apps/worker/` is rebuilt as a Rust crate using the `worker` crate (workers-rs), with `wrangler.toml` configured for the Rust-to-WASM build (`worker-build`). The legacy TypeScript Worker scaffold, package manifest, config, and tests are deleted in this phase.
  2. A shared workspace crate (planner picks the name; e.g., `crates/event-schema` or `crates/types`) is the single source of truth for the canonical `EventPayload` struct, the model/tier/harness/region enums (defined natively in Rust — NOT loaded from a JSON file), and the JCS canonical-form helper. Both `crates/cli` (Phase 3) and `apps/worker/` consume it. Frontend TypeScript bindings are generated from this crate via `ts-rs` (`#[derive(TS)]` + `#[ts(export)]` or an `xtask gen-ts` wrapper) into a checked-in TS module the SPA imports; there is no hand-written TS schema or parallel JSON schema file.
  3. The former enum JSON artifact is deleted. Any remaining `spec/*.md` documents (e.g., `spec/event-schema.md`, `spec/pow-v1.md`, `spec/payload-canonical.md`) are rewritten to point at the Rust crate as the authoritative type source and reference the `ts-rs`-generated bindings for frontend consumers. `spec/pow-fixtures.json` remains (it is regenerated from Rust by `cargo xtask gen-fixtures` and stays as test vectors, not a schema source).
  4. The Worker calls `crates/pow::verify` directly and the parallel TypeScript verifier is deleted. CI's `.github/workflows/pow.yml` collapses to a single Rust gate (`cargo test -p pow` + `cargo xtask gen-fixtures --check`) plus ts-rs drift, log-boundary, and WASM-size checks.
  5. Documentation reflects the Rust Worker stack and Rust-as-source-of-truth with no TS-Worker / JSON-schema residue: `CLAUDE.md` Stack/PoW-invariant/Architecture/Conventions sections; `.planning/PROJECT.md` Constraints + Key Decisions; `.planning/REQUIREMENTS.md` (BACK-04, INGE-03, INGE-07, INGE-08, INGE-10, INGE-11, SPEC-04, SPEC-05 rewritten); `.planning/research/STACK.md` and `.planning/research/ARCHITECTURE.md` rewritten; `spec/event-schema.md`, `spec/pow-v1.md`, `spec/payload-canonical.md` neutralized of TS-library specifics and pointed at the Rust crate + `ts-rs` outputs.
  6. A staging Rust Worker deploys and a smoke test passes end-to-end: `GET /` returns a stub 200; `GET /db-ping` opens a `tokio-postgres` connection through the Hyperdrive binding to a PlanetScale staging branch, runs `SELECT 1`, returns `{ok: true}` and closes the client. This proves the workers-rs + tokio-postgres + Hyperdrive triplet works before Phase 2 builds ingest endpoints on top.
**Plans**: 5 plans (sequential per D-30/D-31 — each wave blocked on the previous)
Plans:
- [ ] **Wave 1**
  - [x] 01.5-01-PLAN.md — Shared workspace crate (`crates/event-schema`): EventPayload, enums, JCS helper, ts-rs derives, RFC 8785 conformance test
- [ ] **Wave 2** *(blocked on Wave 1)*
  - [x] 01.5-02-PLAN.md — Rust Worker scaffold (`apps/worker/` as Rust crate with workers-rs 0.8.1; bindings declared; TS scaffold untouched until 01.5-04)
- [ ] **Wave 3** *(blocked on Wave 2)*
  - [x] 01.5-03-PLAN.md — `GET /db-ping` smoke test (tokio-postgres over Hyperdrive against PlanetScale staging branch)
- [ ] **Wave 4** *(blocked on Wave 3 — atomic cut-over; checkpoint:human-verify)*
  - [x] 01.5-04-PLAN.md — Atomic cut-over: delete TS scaffold + former enum JSON artifact; collapse pow CI gate to Rust-only; add ts-rs drift + log-boundary + WASM-size gates
- [ ] **Wave 5** *(blocked on Wave 4)*
  - [x] 01.5-05-PLAN.md — Documentation rewrites (CLAUDE.md, PROJECT.md, REQUIREMENTS.md, STACK.md, ARCHITECTURE.md, ROADMAP.md Phase 4 SC#2 amendment, spec/*.md)

**Cross-cutting constraints** (truths shared across multiple plans):
- D-30/D-31: 5-atomic-plan sequence is locked; TS scaffold + bilingual PoW CI gate stay green between waves 1-3; only Wave 4 deletes TS files and collapses CI in a single atomic commit.
- PoW invariant: 72-byte input format + JCS canonical form + snake_case wire format inherited from Phase 1 (D-01..D-23) — no plan modifies these.
- Anonymity boundary: no `worker::console_log!` of `event_id`, `nonce`, IP (`cf-connecting-ip`), or per-event timing — Wave 4 adds CI grep gate enforcing this.
**UI hint**: no

### Phase 2: Ingest Backbone
**Goal**: A deployed Rust ingest Worker (built on `workers-rs` per Phase 1.5) accepts validated, PoW-gated, idempotent events into a PlanetScale Postgres `events` table via Hyperdrive — without ever logging IPs, nonces, or per-event timing — so the CLI in the next phase has a real endpoint to submit against.
**Depends on**: Phase 1.5 (Rust Worker base + shared event-schema crate + Hyperdrive smoke test)
**Requirements**: BACK-02, BACK-03, BACK-04, INGE-01, INGE-02, INGE-03, INGE-04, INGE-05, INGE-06, INGE-07, INGE-08, INGE-09, INGE-10, INGE-11
**Success Criteria** (what must be TRUE):
  1. `GET /challenge` issues a stateless HMAC-signed challenge `{challenge_id_b64, sig_b64, difficulty, expires_in}` where `challenge_id (32B) = unix_ms_be (8B) || crypto_random (24B)` and `sig = HMAC-SHA256(WORKER_SECRET, challenge_id)` with a 60-second expiry; `POST /event` verifies HMAC + expiry + payload_hash binding via the shared `crates/pow` verifier (no KV lookup), validates the payload against `crates/event-schema` enum and payload types, and inserts into PlanetScale Postgres via Hyperdrive.
  2. The `events` table exists with `event_id UUID PRIMARY KEY`, `bucket_ts TIMESTAMPTZ` server-assigned and floored to 15 minutes, `payload JSONB`, `received_at TIMESTAMPTZ DEFAULT now()`, split-out `model`/`tier`/`harness`/`region` columns, and an index on `(bucket_ts, model, tier, harness, region)`; duplicate `event_id` submissions are silently idempotent.
  3. PoW input binds the payload hash so a solved challenge cannot be reused with a different payload; per-request `tokio-postgres` clients are opened from the Hyperdrive connection string and closed before the response future resolves; `compatibility_date` is pinned with a comment, Worker placement is `smart`, and the Rust→WASM build pipeline is the one defined in Phase 1.5.
  4. Edge rate-limiting throttles abusive callers per IP via the Cloudflare Rate Limiting binding (no IP persisted by us), and no log line anywhere contains `event_id`, `nonce`, or per-event timing.
  5. An end-to-end happy-path test (`GET /challenge` → PoW solve in test harness → `POST /event` → PlanetScale Postgres row visible) passes against a deployed staging Worker.
**Plans**: 5 plans
Plans:
- [x] 02-01-PLAN.md — Schema bootstrap + per-env wrangler split (events DDL, [env.staging]/[env.production], README operator workflow)
- [x] 02-02-PLAN.md — Ingest plumbing (errors.rs 14-code envelope, ratelimit.rs, body.rs 8 KB cap, error_kinds.rs serde-prefix regression)
- [x] 02-03-PLAN.md — GET /challenge handler (HMAC-signed challenge, RL_CHALLENGE 10/60s, base64url no-pad)
- [x] 02-04-PLAN.md — POST /event handler (D-43 10-step chain, ON CONFLICT DO UPDATE RETURNING bucket_ts, pow::VerifyError::ClockSkew split)
- [x] 02-05-PLAN.md — End-to-end staging proof (#[ignore] + staging-smoke feature; manual cargo test only)

### Phase 3: Rust CLI
**Goal**: A user who just hit a rate limit on Claude Code or Codex can run `bloclawd --5h --cc` (or `--codex`), see exactly what would be submitted, confirm with `[y/N]`, and have an anonymous, PoW-gated event accepted by the live ingest Worker — with defensive parsers that survive CC/Codex format drift.
**Depends on**: Phase 2 (live ingest endpoint)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09, CLI-10, CLI-11, CLI-12, CLI-13, CLI-14, CLI-15, CLI-16, CLI-17, CLI-18, CLI-19
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
  2. R2 holds a tiered layout (`reports/v1/q15/...` past 24h, `reports/v1/h1/...` past 7d, `reports/v1/d1/...` indefinite), each bucket file contains dimension-pre-aggregated `cells[]`, rolled-over buckets are written with `Cache-Control: public, max-age=31536000, immutable`, and `manifest.json` (max-age=60, must-revalidate) is updated last after all bucket writes succeed; `_status.json` is published. Per D-27/D-28, no R2 enum manifest is published; the SPA imports enum sets from `apps/web/src/generated/`, emitted from `crates/event-schema`.
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
| 1.5. Worker Rust Migration (INSERTED) | 5/5 | Complete | 2026-05-01 |
| 2. Ingest Backbone | 4/5 | In Progress|  |
| 3. Rust CLI | 0/TBD | Not started | - |
| 4. Aggregation + Dashboard | 0/TBD | Not started | - |
| 5. Launch | 0/TBD | Not started | - |

## Research Flags

Phases that should run `/gsd-research-phase` before `/gsd-plan-phase`:

- **Phase 1.5 (Worker Rust Migration):** RESEARCH COMPLETE — current truth is workers-rs 0.8.1 first-class `Hyperdrive` and `RateLimiter` bindings, upstream `tokio-postgres` with `query_typed_one` for Hyperdrive smoke queries, `serde_jcs = "0.2"` with RFC 8785 KAT coverage, hand-rolled serde validation in `crates/event-schema`, `worker-build = "0.8.1"`, and `ts-rs = "12"` binding generation into `apps/web/src/generated/`.
- **Phase 3 (Rust CLI):** NEEDS PHASE RESEARCH — CC/Codex session JSONL formats are the least-stable upstream contract; pin current field shapes against checked-in fixtures, identify minimum supported versions per harness, and document graceful-degradation behavior before planning.

Phases with standard / well-documented patterns (skip research-phase):

- Phase 1 (Foundations) — STANDARD
- Phase 2 (Ingest Backbone) — STANDARD (after Phase 1.5 lands the workers-rs base)
- Phase 4 (Aggregation + Dashboard) — STANDARD
- Phase 5 (Launch) — STANDARD

---
*Roadmap created: 2026-04-30*
*Updated 2026-04-30 — Phase 1.5 (Worker Rust Migration) inserted; backend Worker stack pivoted from legacy TypeScript Worker to Rust (workers-rs).*
*Updated 2026-04-30 — Phase 1.5 scope amended: Rust is the single source of truth for shared types; `ts-rs` generates TypeScript bindings for the frontend; former enum JSON artifact deleted.*
*Updated 2026-04-30 — Phase 1.5 Plan 05 doc sweep: Phase 4 success criterion #2 amended to drop the R2 enum manifest and use `apps/web/src/generated/`.*
