<!-- GSD:project-start source:PROJECT.md -->
## Project

bloclawd — anonymous community analytics for AI-subscription rate-limit data.

**What it is:** A Rust CLI (`bloclawd`) reads local Claude Code / Codex session artifacts when a user has hit a rate limit, computes a per-window token-usage breakdown, and submits the snapshot anonymously through a PoW-gated Cloudflare Worker. A Vite + React SPA at `bloclawd.com/dashboard` renders aggregated timeseries (median + spread bands) lazy-loaded from R2.

**Core value:** A trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits."

**Key invariants:**
- PoW input format must match byte-for-byte between Rust CLI (solver) and TypeScript Worker (verifier). Enforced by `spec/pow-v1.md` + `spec/pow-fixtures.json` + bilingual CI.
- Anonymity is combinatorial: k-anonymity (k≥5), log-binned token counts, no `tz_offset` in public R2, no `event_id`/`nonce` in public files, no per-event timing logs.
- Outlier policy: per-cohort double-MAD at 3 × MAD (NOT >2σ from median). Cohort = `(model, tier, harness, region)`.

See `.planning/PROJECT.md` for full project context.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **CLI:** Rust 1.86+ (2024 edition), `clap` (derive), `reqwest` (blocking + rustls-tls), `sha2`, `serde_json::Value` (defensive parsing), `uuid` v4 only, `sys-locale`, `chrono`, `zstd`. Distributed via cargo-dist 0.31+ → cargo / Homebrew tap / install.sh.
- **Workers:** TypeScript on Cloudflare Workers + Hono 4.x. Single Worker exports both `fetch` (`/challenge`, `/event`) and `scheduled` (15-min cron) handlers.
- **Database:** PlanetScale (MySQL/Vitess) via Hyperdrive + `mysql2 ≥ 3.13`. Per-request client + `ctx.waitUntil(client.end())`. No FKs (Vitess constraint).
- **Storage:** Cloudflare R2 (`bloclawd-reports`, custom domain `data.bloclawd.com`, tiered q15/h1/d1 layout). PoW issuance is stateless HMAC-signed (single `WORKER_SECRET`, 60s expiry — no key-value store; see `spec/pow-v1.md`).
- **Frontend:** Vite 6 + `@cloudflare/vite-plugin` 1.x + React 19 + TanStack Query v5 + uPlot 1.6.
- **`compatibility_date`** pinned with rationale comment in `wrangler.toml`. `nodejs_compat` flag explicit. Worker placement `smart`.

See `.planning/research/STACK.md` for the full stack rationale.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- **PoW invariant:** Touching the 72-byte PoW input format (`challenge_id || payload_hash || nonce`) or the canonical payload form (RFC 8785 JCS) requires updating `spec/pow-v1.md` / `spec/payload-canonical.md`, regenerating `spec/pow-fixtures.json` via `cargo xtask gen-fixtures`, and verifying `cargo test -p pow` + `vitest run pow` + `cargo xtask gen-fixtures --check` all pass before merge. CI's bilingual gate at `.github/workflows/pow.yml` blocks merge on any failure.
- **Anonymity boundary:** Anything written to R2 is public. Strip `tz_offset`, `event_id`, `nonce`, sub-minute timestamps, and raw token counts (use log-spaced bins) at the cron-materialization step. Never at ingest, never afterwards.
- **Server-assigned timestamps:** `bucket_ts = FLOOR(NOW(), 15 min)` is computed server-side. Never trust client-provided timestamps for the bucket key.
- **Defensive parsing:** CC and Codex JSONL files are parsed line-by-line with `serde_json::Value` + `.get()` walks. Never strict serde structs. Surface a per-line parse-failure counter.
- **Idempotency:** `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE id=id` on `event_id` PK. Cryptographic `payload_hash` binding into the 72-byte PoW input is the primary replay defense (see `spec/pow-v1.md`); the `event_id` PK is the second; the 60s challenge expiry is the third.
- **Logging boundary:** No `console.log` of `event_id`, `nonce`, IP, or per-event timing — anywhere in the worker.
- **Dry-run identity:** The CLI's `--dry-run` output and the bytes actually submitted on `--yes` MUST come from the same canonical formatter. The `/data` page on the website renders the same payload schema.
- **License:** MIT or Apache-2.0 from day 1. Public data: CC BY 4.0.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

CQRS at the edge. Write path is rare, gated, validated, durable; read path is static, edge-cached.

**Components:**
1. **Rust CLI `bloclawd`** → `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl{,.zst}` → defensive parse → per-window token aggregate → `sys-locale` country → PoW solve → `POST https://api.bloclawd.com/event`.
2. **Ingest+Cron Worker (`api.bloclawd.com`)** → Hono routes for `GET /challenge` and `POST /event`; scheduled handler every 15 min.
3. **PlanetScale `events` table** → `event_id BINARY(16) PK`, `bucket_ts TIMESTAMP(3)` server-assigned, `payload JSON`, idx on `(bucket_ts, model, tier, harness, region)`.
4. **R2 `bloclawd-reports` (`data.bloclawd.com`)** → tiered `reports/v1/{q15,h1,d1}/...` with manifest + enums + status. Past buckets `Cache-Control: immutable`; manifest `max-age=60, must-revalidate`. Manifest is written LAST after all bucket writes.
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
