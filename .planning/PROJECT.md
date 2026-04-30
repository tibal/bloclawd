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
- [ ] Ingest Worker stores PoW challenges in KV with 90s TTL and consumes them on use (one-shot)
- [ ] Ingest Worker validates payload against enum sets (model, harness, tier, region) before insert
- [ ] Ingest Worker writes events to PlanetScale MySQL via Hyperdrive with `PRIMARY KEY (id)` idempotency
- [ ] Cron Worker runs every 15 min, queries PlanetScale, materializes JSON files to R2
- [ ] Cron drops outliers >2σ from median before computing aggregates (preserves distribution shape)
- [ ] R2 layout is per-15-min-bucket JSON files (immutable once rolled over) plus an index file the dashboard uses to discover available buckets — enables CDN-friendly lazy loading
- [ ] R2 bucket served at `data.bloclawd.com` via custom domain, edge cached
- [ ] Web frontend is a Vite + React SPA deployed on Cloudflare Workers
- [ ] Marketing/landing page at `bloclawd.com/` explaining what bloclawd is and the privacy model
- [ ] Dashboard at `bloclawd.com/dashboard` renders timeseries of median tokens-per-window with vertical spread (e.g., p25–p75 / p10–p90) and filters for model, subscription tier, harness, region
- [ ] Dashboard lazy-loads only the JSON buckets needed for the selected time window
- [ ] `bloclawd.org` redirects to `bloclawd.com`
- [ ] PoW input format spec lives in a single source-of-truth document and matches between Rust CLI (solver) and TypeScript Worker (verifier)

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
- Stateless HMAC-signed PoW challenges — KV-backed consume-on-use is simpler at this volume
- Tracking providers / harnesses beyond Claude Code and Codex in v1 — start narrow, expand once schema is proven
- Per-user history view — anonymity precludes correlating events back to a user
- Mobile apps — web dashboard only

## Context

- **Why this exists:** AI subscription users (Pro / Max5 / Max20 on Anthropic, equivalent OpenAI tiers) repeatedly hit rate limits in their dev workflows but have no aggregate visibility into when others hit them, on what models, in what regions. bloclawd makes that aggregate visible without requiring accounts.
- **Trust model:** Anonymity is the product. The PoW gate, payload validation, outlier trimming, and the absence of accounts/IDs are all in service of "we can't deanonymize you and the data is still useful."
- **Architecture lineage:** Lightweight CQRS — write path is rare, gated, validated, durable; read path is static, cached at edge, serves arbitrary traffic without touching the DB.
- **Data sources:** CC and Codex both write structured session artifacts to disk locally (CC: `~/.claude/projects/<project>/sessions/*.jsonl`, Codex: equivalent). The CLI parses these to compute usage windows; no network access is required to derive the payload.
- **Critical invariant:** PoW input format must match exactly between the Rust CLI and the TypeScript ingest Worker. They are written in different languages — they cannot share a library — so the format must be specified independently and tested with cross-language fixtures.
- **Cloudflare-native stack:** Workers (ingest, cron, frontend), KV (challenges), R2 (materialized JSON), Hyperdrive (PlanetScale connection pool). Single vendor for the whole edge story; PlanetScale for source of truth.
- **Domain assets:** User owns `bloclawd.com` and `bloclawd.org`. `.org` redirects to `.com`. Subdomains: `api.bloclawd.com` (ingest worker), `data.bloclawd.com` (R2 reports).

## Constraints

- **Tech stack — CLI**: Rust. Reason: small static binaries, easy distribution via cargo + brew + curl-script; no Node runtime requirement for end users.
- **Tech stack — Workers/Frontend**: TypeScript on Cloudflare Workers; Vite + React SPA. Reason: official Cloudflare DX path, smart placement near PlanetScale for ingest worker.
- **Tech stack — Database**: PlanetScale (MySQL/Vitess) via Hyperdrive. Reason: durability, branch-based dev, integrates cleanly with Cloudflare.
- **Privacy**: No long-lived identifiers, no IP-based geo, no accounts. Reason: anonymity is the trust contract with users.
- **Volume budget**: ≤ 1 event per user per 5 hours. Reason: correlates with the lowest Anthropic limit window; defines write-path sizing.
- **PoW difficulty**: `K = 22` bits initial target (~1s on a mid-range dev laptop). Reason: targets dev-laptop audience; tune via Worker env var.
- **Aggregation cadence**: 15 minutes. Reason: dashboard freshness vs cron cost balance; user explicitly chose this.
- **License**: MIT or Apache-2.0 from day 1. Reason: open-source community trust signal; aligns with "we can't be evil" positioning.
- **CLI runtime use only**: Tool runs on demand when user hits a limit, never as a background service. Reason: noise reduction; reinforces "user-initiated, anonymous" model.
- **Aggregation outlier policy**: Trim points >2σ from median per bucket before computing summary stats. Reason: removes spammers/bogus payloads while preserving distribution shape.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI in Rust (not Node) | Small static binaries, easier distribution to non-Node users, faster PoW solver | — Pending |
| Cloudflare-native stack (Workers + KV + R2 + Hyperdrive + PlanetScale) | Single-vendor edge story, smart placement available, free egress on R2 custom domain | — Pending |
| PoW gate with KV-backed one-shot challenges | Anonymous, replay-proof, no long-lived secret, expires automatically | — Pending |
| 15-min bucket JSON files in R2 (lazy loading) | CDN-friendly: old buckets are immutable so cache hits forever; dashboard fetches only what it needs | — Pending |
| Outlier trim at >2σ from median during aggregation | Removes adversarial / bogus payloads without distorting distribution shape | — Pending |
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
*Last updated: 2026-04-30 after initialization*
