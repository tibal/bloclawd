# bloclawd

## What This Is

bloclawd is an anonymous, community analytics service that tracks **when AI coding subscriptions hit their rate limits** — broken down by model, subscription tier, harness (Claude Code / Codex), and coarse region. A Rust CLI reads local Claude Code and Codex session artifacts when a user runs out of tokens, computes a per-window token-usage breakdown, and submits the snapshot anonymously. A web dashboard at bloclawd.com renders timeseries with spread bands so users can compare their experience to the aggregate.

## Core Value

**A trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits."** If aggregation/trust/anonymity holds, every other feature is optional. If users can't trust the data or the privacy story, nothing else matters.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Rust CLI `bloclawd` reads local Claude Code session artifacts (`~/.claude/projects/.../*.jsonl`) and Codex session artifacts on demand
- [ ] CLI supports `--5h`, `--week`, `--end <local-time>`, `--cc`, `--codex` flags to compute a per-window token-usage breakdown
- [ ] CLI computes per-model token counts: input, output, cached read, cached write, 5min and 1h windows
- [ ] CLI captures harness (`claude-code` | `codex`), subscription tier (Anthropic: `pro`/`max5`/`max20`; OpenAI provider naming), TZ offset, country (coarse)
- [ ] CLI fetches PoW challenge from ingest worker and solves it (~1s on dev laptop hardware)
- [ ] CLI submits the event payload via `POST /event` with `{ challenge_id, nonce, event_id (UUIDv4), payload }`
- [ ] CLI runs only when user has hit a limit (no tokens left); explicitly not background telemetry
- [ ] CLI distributed via `cargo install bloclawd`, Homebrew tap, and `curl … | sh` install script (prebuilt release binaries: darwin-arm64, darwin-x64, linux-x64)
- [ ] Repository is open source under MIT or Apache-2.0 from day 1
- [ ] Ingest Cloudflare Worker exposes `GET /challenge` and `POST /event`
- [ ] Ingest Worker issues stateless HMAC-signed PoW challenges (single WORKER_SECRET, 60s expiry, no KV) — see spec/pow-v1.md
- [ ] Ingest Worker validates payload against enum sets (model, harness, tier, region) before insert
- [ ] Ingest Worker writes events to PlanetScale Postgres via Hyperdrive with `event_id UUID PRIMARY KEY` idempotency
- [ ] Cron Worker runs every 15 min, queries PlanetScale, materializes JSON files to R2
- [ ] Cron applies per-cohort double-MAD outlier trim (`3 × MAD` threshold, separate upper/lower MAD for skew, cohort = `(model, tier, harness, region)`) before aggregating; trim rate exposed as a metric
- [ ] R2 layout is per-15-min-bucket JSON files (immutable once rolled over) plus an index file the dashboard uses to discover available buckets — enables CDN-friendly lazy loading
- [ ] R2 bucket served at `data.bloclawd.com` via custom domain, edge cached
- [ ] Web frontend is a Vite + React SPA deployed on Cloudflare Workers
- [ ] Marketing/landing page at `bloclawd.com/` explaining what bloclawd is and the privacy model
- [ ] Dashboard at `bloclawd.com/dashboard` renders timeseries of median tokens-per-window with vertical spread (e.g., p25–p75 / p10–p90) and filters for model, subscription tier, harness, region
- [ ] Dashboard lazy-loads only the JSON buckets needed for the selected time window
- [ ] `bloclawd.org` redirects to `bloclawd.com`
- [ ] PoW invariant enforced by spec/pow-v1.md (72-byte byte-exact input: challenge_id || payload_hash || nonce) + spec/payload-canonical.md (RFC 8785 JCS) + spec/pow-fixtures.json (>=10 cross-language test vectors); CI runs cargo test -p pow + vitest run pow + xtask gen-fixtures --check (any failure blocks merge)
- [ ] Anonymity defenses applied combinatorially at materialization (cron, not ingest): k-anonymity suppression of public-R2 cells with n<5; token counts binned to log-spaced buckets before public emission; `tz_offset` dropped from public R2; `event_id` and `nonce` never written to public R2; per-event timing never persisted

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- User accounts / sign-in — anonymity is core to the trust model
- Real-time / sub-15min freshness — 15min cron is enough for a community-trends dashboard, costs less, simpler
- Background daemon / always-on telemetry — only runs when user explicitly hits a limit; reduces noise and keeps trust
- IP-based geo lookup — CLI provides TZ + country from system locale; no IP geo to keep deanonymization risk low
- Workers Queues for batched ingest — at ≤1 event/user/5h volume, direct write is fine
- Workers Analytics Engine as primary store — PlanetScale chosen; revisit only if event volume becomes pure time-series at huge scale
- Turnstile or CAPTCHA — PoW + payload validation + outlier trim should suffice; layer in only if attacks materialize
- Difficulty auto-tuning — `K=22` static, env-config tunable; revisit under attack
- Schema migrations workflow tooling — use PlanetScale branches when this matters; not v1
- Production observability tooling (Logs, Workers Analytics) — ship without; add when there's traffic to look at
- Tracking providers / harnesses beyond Claude Code and Codex in v1 — start narrow, expand once schema is proven
- Per-user history view — anonymity precludes correlating events back to a user
- Mobile apps — web dashboard only

## Context

- **Why this exists:** AI subscription users (Pro / Max5 / Max20 on Anthropic, equivalent OpenAI tiers) repeatedly hit rate limits in their dev workflows but have no aggregate visibility into when others hit them, on what models, in what regions. bloclawd makes that aggregate visible without requiring accounts.
- **Trust model:** Anonymity is the product. The PoW gate, payload validation, outlier trimming, and the absence of accounts/IDs are all in service of "we can't deanonymize you and the data is still useful."
- **Architecture lineage:** Lightweight CQRS — write path is rare, gated, validated, durable; read path is static, cached at edge, serves arbitrary traffic without touching the DB.
- **Data sources:** CC and Codex both write structured session artifacts to disk locally (CC: `~/.claude/projects/<project>/sessions/*.jsonl`, Codex: equivalent). The CLI parses these to compute usage windows; no network access is required to derive the payload.
- **Critical invariant:** PoW input format is locked by `spec/pow-v1.md` + `spec/pow-fixtures.json`. After Phase 1.5 the Rust CLI (solver) and the Rust Worker (verifier) share a single implementation in `crates/pow`, so there is no cross-language gap — the spec + fixtures still anchor the wire contract for any future re-implementation, but the in-process verifier is one library.
- **Cloudflare-native stack:** Workers (ingest, cron, frontend), R2 (materialized JSON), Hyperdrive (PlanetScale Postgres connection pool). Single vendor for the whole edge story; PlanetScale Postgres for source of truth.
- **Domain assets:** User owns `bloclawd.com` and `bloclawd.org`. `.org` redirects to `.com`. Subdomains: `api.bloclawd.com` (ingest worker), `data.bloclawd.com` (R2 reports).

## Constraints

- **Tech stack — CLI**: Rust. Reason: small static binaries, easy distribution via cargo + brew + curl-script; no Node runtime requirement for end users.
- **Tech stack — Workers**: Rust on Cloudflare Workers via `workers-rs 0.8.1` (the `worker` crate), compiled to WASM with `worker-build 0.8.1`. Reason: the entire backend (CLI + Worker) is Rust so canonical event/enum/PoW types live in shared workspace crates consumed by both sides — no cross-language drift, no parallel TS schema, single source of truth for the wire contract.
- **Shared type source**: `crates/event-schema` is the canonical Rust source for `EventPayload`, `TokenCounts`, model/tier/harness/region enums, and `canonical_bytes`; TypeScript bindings are generated via `ts-rs` into `apps/web/src/generated/`. Reason: frontend gets compile-time-checked types without maintaining a runtime enum JSON file.
- **Tech stack — Frontend**: TypeScript + Vite 6 + React 19 SPA on Cloudflare Workers. Reason: browser bundle ergonomics, ecosystem (TanStack Query, uPlot), and `@cloudflare/vite-plugin` 1.x dev-server parity.
- **Tech stack — Database**: PlanetScale Postgres via Hyperdrive. Reason: durability, standard PostgreSQL driver compatibility, branch-based dev, integrates cleanly with Cloudflare.
- **Privacy**: No long-lived identifiers, no IP-based geo, no accounts. Reason: anonymity is the trust contract with users.
- **Volume budget**: ≤ 1 event per user per 5 hours. Reason: correlates with the lowest Anthropic limit window; defines write-path sizing.
- **PoW difficulty**: `K = 22` bits initial target (~1s on a mid-range dev laptop). Reason: targets dev-laptop audience; tune via Worker env var.
- **Aggregation cadence**: 15 minutes. Reason: dashboard freshness vs cron cost balance; user explicitly chose this.
- **License**: MIT or Apache-2.0 from day 1. Reason: open-source community trust signal; aligns with "we can't be evil" positioning.
- **CLI runtime use only**: Tool runs on demand when user hits a limit, never as a background service. Reason: noise reduction; reinforces "user-initiated, anonymous" model.
- **Aggregation outlier policy**: Per-cohort double-MAD trim at `3 × MAD` (cohort = `(model, tier, harness, region)`), separate upper/lower MAD for skew. Reason: σ-based trim is internally inconsistent and degrades on right-skewed token data; double-MAD is the textbook robust replacement (Leys et al.; Akinshin). Trim-rate is surfaced as a metric.
- **Anonymity is combinatorial**: (a) k-anonymity (k=5) suppression of public R2 cells; (b) token counts binned to log-spaced buckets before public emission; (c) `tz_offset` dropped from public R2 output; (d) `event_id` / `nonce` never written to public R2 files; (e) per-event timing (solve duration, sub-minute submit time) never persisted. Reason: "we don't store IP" alone is a fingerprintable schema (Sweeney-style re-identification).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI in Rust (not Node) | Small static binaries, easier distribution to non-Node users, faster PoW solver | — Pending |
| Backend Worker in Rust via `workers-rs` (not TypeScript) | Single language across CLI + Worker; `crates/event-schema` supplies canonical event/enum/JCS types; PoW verifier collapses to one `crates/pow`. Phase 01.5-03 deployed staging `/db-ping` and proved workers-rs 0.8.1 first-class `Hyperdrive` binding + upstream `tokio-postgres` rev `35a85bdbfeeac465e092950f65a10d9192418175` works through Hyperdrive when queries use `query_typed_one`; the earlier devsnek-fork assumption is no longer current for this smoke path. | — Pending |
| Deleted enum JSON manifest as source of truth (D-27/D-28) | `crates/event-schema/src/enums.rs` is the canonical enum list. `ts-rs` emits SPA bindings into `apps/web/src/generated/`; no `enums.json` is published to R2 in v1 unless a third-party non-SPA consumer appears later. | — Pending |
| Cloudflare-native stack (Workers + R2 + Hyperdrive + PlanetScale Postgres) | Single-vendor edge story, smart placement available, free egress on R2 custom domain, standard Postgres semantics | — Pending |
| PoW gate via stateless HMAC-signed challenges (no KV); 72-byte input binds challenge_id, payload_hash, and nonce; 60s expiry | Removes KV consistency-race + state surface; payload_hash binding is the primary replay defense; event_id PK and 60s expiry are layered defenses | — Pending |
| 15-min bucket JSON files in R2 (lazy loading) | CDN-friendly: old buckets are immutable so cache hits forever; dashboard fetches only what it needs | — Pending |
| Per-cohort double-MAD outlier trim at 3 × MAD (cohort = (model, tier, harness, region)) before percentile aggregation | σ inflates with outliers and is wrong for right-skewed token data; double-MAD is robust per Leys et al. / Akinshin | — Pending |
| Anonymous, no accounts | Anonymity is the product's core trust contract | — Pending |
| Open source from day 1 (MIT/Apache) | Community trust signal; aligns with privacy-first positioning | — Pending |
| `bloclawd.com` root, `data.` for R2, `api.` for ingest, `.org` redirects | Single canonical domain, predictable subdomain layout | — Pending |
| 15-min cron cadence | Good freshness for community-trends dashboard at low cost | — Pending |
| Track Claude Code + Codex only in v1 | Narrow scope to prove the schema before expanding | — Pending |

## Open Questions

These are deliberately deferred — capture during planning, resolve during execution:

- Exact JSON-bucket layout in R2 (e.g., `reports/<model>/<tier>/<region>/2026/04/30/14-15.json` vs flatter; what does the index look like?)
- Spread-band selection in dashboard (p10–p90 vs p25–p75 vs SD bands; user-toggleable?)
- Codex session artifact path / format (need to confirm path and parsing approach during CLI phase)
- Country derivation in Rust without IP lookup (locale-based heuristic; how robust across OSes?)
- Reverse-engineering safeguards in the CLI: how do we make it hard for someone to fork the CLI and pump bogus events while staying open source? (Likely: payload validation + outlier trim are the real defenses; CLI can't be the gate.)

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-30 — Phase 1 doc-conflict resolution: HMAC PoW (no KV), 72-byte input, double-MAD trim*
*2026-04-30 — Phase 1.5 inserted: backend Worker stack pivots from TypeScript to Rust (workers-rs); shared workspace crate for canonical event/enum/JCS types; bilingual PoW CI gate collapses to single-language Rust gate.*
*2026-04-30 — Phase 1.5 Plan 05 doc sweep: Rust Worker is workers-rs 0.8.1 + worker-build; `crates/event-schema` is canonical shared type source; `apps/web/src/generated/` is the frontend enum/type source; R2 enum JSON dropped per D-27/D-28.*
