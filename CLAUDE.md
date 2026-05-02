<!-- GSD:project-start source:PROJECT.md -->
## Project

bloclawd — anonymous community analytics for AI-subscription rate-limit data.

**What it is:** A Rust CLI (`bloclawd`) reads local Claude Code / Codex session artifacts when a user has hit a rate limit, computes a per-window token-usage breakdown, and submits the snapshot anonymously through a PoW-gated Cloudflare Worker. A Vite + React SPA at `bloclawd.com/dashboard` renders aggregated timeseries (median + spread bands) lazy-loaded from R2.

**Core value:** A trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits."

**Key invariants:**
- PoW input format is locked by `spec/pow-v1.md` + `spec/pow-fixtures.json` and verified by a single shared `crates/pow` consumed by both the Rust CLI (solver) and the Rust Worker (verifier). The bilingual CI gate from Phase 1 collapses to a Rust-only gate after Phase 1.5 (Worker Rust Migration).
- Anonymity is combinatorial: k-anonymity (k≥5), log-binned token counts, no `tz_offset` in public R2, no `submission_group_id`/`event_id`/`nonce` in public files, no per-event timing logs.
- Outlier policy: 2σ trim on unified per-submission cost (per Phase 4 D-82). Cohort = `(tier, harness, region)`. Per-model dimensions live inside each cell's `models[]` array. Old double-MAD policy retired in Phase 4 (CONTEXT D-80).

See `.planning/PROJECT.md` for full project context.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **CLI:** Rust 1.86+ (2024 edition), `clap` (derive), `reqwest` (blocking + rustls-tls), `sha2`, `serde_json::Value` (defensive parsing), `uuid` v4 only, `sys-locale`, `chrono`, `zstd`. Distributed via cargo-dist 0.31+ → cargo / Homebrew tap / install.sh.
- **Workers:** Rust on Cloudflare Workers via `workers-rs` (`worker = "0.8.1"`) compiled to WASM with `worker-build = "0.8.1"`. Single Worker exports both `fetch` (`/challenge`, `/event`) and `scheduled` (15-min cron) handlers using the `#[event(fetch)]` / `#[event(scheduled)]` macros. Routing via `worker::Router`.
- **Database:** PlanetScale Postgres via Cloudflare Hyperdrive + upstream `tokio-postgres` over a workers-rs `Socket`. Hyperdrive access uses the workers-rs 0.8.1 first-class `Hyperdrive` binding (`env.get_binding::<Hyperdrive>("DB")`), with a per-request client opened from `connect_raw`, driven via `wasm-bindgen-futures::spawn_local`, and dropped before the response future resolves. Postgres `UUID`, `JSONB`, `TIMESTAMPTZ`. Plan 01.5-03 proved repeated `/db-ping` smoke requests pass through Hyperdrive when using `query_typed_one`.
- **Shared types:** `crates/event-schema` holds the canonical `EventPayload` struct, `TokenCounts`, the model/tier/harness/region enums in `crates/event-schema/src/enums.rs`, and the `serde_jcs = "0.2"` canonical-form helper. `ts-rs = "12"` emits TypeScript bindings into `apps/web/src/generated/`; `crates/cli`, `apps/worker/`, and the SPA consume the generated or Rust-native surface instead of parallel schemas.
- **PoW verifier:** `crates/pow` is the single shared verifier/solver library. The Rust Worker calls it directly; CI gates it with `cargo test -p pow` and `cargo xtask gen-fixtures --check`.
- **Storage:** Cloudflare R2 (`bloclawd-reports`, custom domain `data.bloclawd.com`, tiered q15/h1/d1 layout). PoW issuance is stateless HMAC-signed (single `WORKER_SECRET`, 60s expiry — no key-value store; see `spec/pow-v1.md`).
- **Rate limiting:** Cloudflare native `[[ratelimit]]` binding (declared in `wrangler.toml`, accessed from Rust via workers-rs 0.8.1 first-class `RateLimiter`). No IP persisted by us. Two bindings: `RL_CHALLENGE` (10 / 60s) and `RL_EVENT` (3 / 60s), per-IP via `cf-connecting-ip`.
- **Frontend:** Vite 6 + `@cloudflare/vite-plugin` 1.x + React 19 + TanStack Query v5 + uPlot 1.6 (TypeScript — frontend stays TS).
- **`compatibility_date`** pinned with rationale comment in `wrangler.toml`. Worker placement `smart`. (The `nodejs_compat` flag is no longer needed for the Rust→WASM build path.)

See `.planning/research/STACK.md` for the full stack rationale.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- **PoW invariant:** Touching the 72-byte PoW input format (`challenge_id || payload_hash || nonce`) or the canonical payload form (RFC 8785 JCS) requires updating `spec/pow-v1.md` / `spec/payload-canonical.md`, regenerating `spec/pow-fixtures.json` via `cargo xtask gen-fixtures`, and verifying `cargo test -p pow` + `cargo xtask gen-fixtures --check` pass before merge. The current CI gate at `.github/workflows/pow.yml` is Rust-only plus ts-rs binding drift, log-boundary grep, and WASM-size checks. Pre-Phase-1.5 used a bilingual Rust/TypeScript bridge gate; Phase 1.5 retired that bridge when the Rust Worker cut over.
- **Anonymity boundary:** Anything written to R2 is public. Strip `tz_offset`, `submission_group_id`, `event_id`, `nonce`, sub-minute timestamps, and raw token counts (use log-spaced bins) at the cron-materialization step. Never at ingest, never afterwards.
- **Server-assigned timestamps:** `bucket_ts` is computed server-side with Postgres 15-minute bucketing, e.g. `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)`. Never trust client-provided timestamps for the bucket key.
- **Defensive parsing:** CC and Codex JSONL files are parsed line-by-line with `serde_json::Value` + `.get()` walks. Never strict serde structs. Surface a per-line parse-failure counter.
- **Idempotency:** `INSERT ... ON CONFLICT (event_id) DO NOTHING` on `event_id` PK. Cryptographic `payload_hash` binding into the 72-byte PoW input is the primary replay defense (see `spec/pow-v1.md`); the `event_id` PK is the second; the 60s challenge expiry is the third.
- **Logging boundary:** No `worker::console_log!` (or any log emitter) of `event_id`, `nonce`, IP, or per-event timing — anywhere in the Worker.
- **Dry-run identity:** The CLI's `--dry-run` output and the bytes actually submitted on `--yes` MUST come from the same canonical formatter. The `/data` page on the website renders the same payload schema.
- **License:** MIT or Apache-2.0 from day 1. Public data: CC BY 4.0.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

CQRS at the edge. Write path is rare, gated, validated, durable; read path is static, edge-cached.

**Components:**
1. **Rust CLI `bloclawd`** → `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl{,.zst}` → defensive parse → per-window token aggregate → `sys-locale` country → PoW solve → `POST https://api.bloclawd.com/event`.
2. **Ingest+Cron Worker (`api.bloclawd.com`)** → Rust Worker (workers-rs 0.8.1, WASM via worker-build) with `worker::Router` routes for `GET /challenge` and `POST /event` plus a `#[event(scheduled)]` handler every 15 min. Hyperdrive uses the first-class workers-rs typed binding (`env.get_binding::<Hyperdrive>("DB")`); Plan 01.5-03 proved this Worker + Hyperdrive + upstream `tokio-postgres` triplet on staging via repeated `/db-ping` smoke requests.
3. **PlanetScale Postgres `events` table** → `event_id UUID PK`, `bucket_ts TIMESTAMPTZ` server-assigned, `payload JSONB`, idx on `(bucket_ts, model, tier, harness, region)`.
4. **R2 `bloclawd-reports` (`data.bloclawd.com`)** → tiered `reports/v1/{q15,h1,d1}/...` with manifest + status. Past buckets `Cache-Control: immutable`; manifest `max-age=60, must-revalidate`. Manifest is written LAST after all bucket writes. Frontend filter enum sets come from `apps/web/src/generated/`, not an R2 enum manifest.
5. **Frontend Worker (`bloclawd.com`)** → Vite 6 + React 19 SPA. Marketing `/`, `/dashboard` (uPlot, URL-synced filters, spread bands, tier overlay), `/methodology`, `/data`, `/methodology/changelog`. `bloclawd.org` → Cloudflare Bulk Redirect 301.

See `.planning/research/ARCHITECTURE.md` for full diagrams, schemas, and DNS plan.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` — do not edit manually.
<!-- GSD:profile-end -->
