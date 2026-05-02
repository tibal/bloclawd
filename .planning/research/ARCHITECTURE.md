# Architecture Research

**Domain:** Anonymous edge-hosted community analytics service
**Researched:** 2026-04-30
**Updated:** 2026-04-30 - Phase 1.5 Rust Worker migration complete
**Confidence:** HIGH for the Rust Worker base and shared type source; MEDIUM for Phase 2 ingest SQL until the deployed `/event` path proves it.

## System Overview

```
CLIENT TIER
  Rust CLI `bloclawd`
    - parses Claude Code and Codex session artifacts defensively
    - derives harness, tier, model, coarse region, token windows
    - canonicalizes payload through crates/event-schema
    - solves PoW with crates/pow
    - POSTs to api.bloclawd.com/event

EDGE TIER (Cloudflare)
  api.bloclawd.com
    Rust Worker (workers-rs 0.8.1, WASM via worker-build)
      - worker::Router for GET /challenge and POST /event
      - #[event(scheduled)] for 15-minute cron
      - crates/pow verifies PoW
      - crates/event-schema validates payload and canonical bytes
      - workers-rs Hyperdrive binding opens per-request Postgres clients
      - workers-rs RateLimiter binding throttles abuse at the edge

  data.bloclawd.com
    R2 public bucket
      - reports/v1/q15/...
      - reports/v1/h1/...
      - reports/v1/d1/...
      - manifest.json
      - _status.json

  bloclawd.com
    Frontend Worker
      - Vite + React SPA
      - imports enum/type bindings from apps/web/src/generated/
      - fetches public R2 JSON

STORAGE TIER
  PlanetScale Postgres
    - events table
    - UUID primary key
    - JSONB payload
    - TIMESTAMPTZ bucket fields
```

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Rust CLI | Parse local artifacts, compute token windows, solve PoW, submit payload | Future `crates/cli`; uses `crates/event-schema` and `crates/pow`. |
| Shared type crate | Canonical payload, enum sets, validation, canonical bytes | `crates/event-schema`: `EventPayload`, `TokenCounts`, `Model`, `Tier`, `Harness`, `Region`, `canonical_bytes`. |
| PoW crate | Solver/verifier and fixture contract | `crates/pow`, shared by CLI and Worker. |
| Ingest+Cron Worker | HTTP ingest and scheduled materialization | `apps/worker` Rust crate using `worker::Router` and `#[event(scheduled)]`. |
| Hyperdrive binding | Per-request Postgres socket | workers-rs 0.8.1 first-class `Hyperdrive`; `connect()` returns the bridged `Socket`. |
| Rate limit binding | Edge throttling by IP without app persistence | workers-rs 0.8.1 first-class `RateLimiter`; keys derived from `cf-connecting-ip`, never logged. |
| PlanetScale Postgres | Private source of truth | `events` table with `event_id UUID PRIMARY KEY`, `payload JSONB`, `bucket_ts TIMESTAMPTZ`, dimension columns. |
| R2 | Public materialized read model | Tiered immutable bucket files plus manifest and status. |
| Frontend Worker | Marketing and dashboard SPA | Vite/React static assets on Cloudflare Workers. |

## Worker Boundary

The Worker is Rust-only after Phase 1.5. It owns:

- `GET /challenge`: stateless HMAC challenge issuance.
- `POST /event`: Phase 2 ingest path using `crates/pow::verify`, `crates/event-schema::EventPayload`, and Postgres insert through Hyperdrive.
- `GET /db-ping`: staging smoke endpoint retained until Phase 2 replaces or protects it.
- `scheduled`: 15-minute cron for materializing R2 files in Phase 4.

Hyperdrive binding access uses workers-rs 0.8.1's first-class typed binding:

```rust
ctx.env.get_binding::<Hyperdrive>("DB")?.connect()?
```

That returns the bridged `Socket`. The older manual binding-cast technique is obsolete for new code, but the socket bridging idiom remains: `Config::connect_raw(socket, NoTls)` and `spawn_local` the connection future before using the client.

Plan 01.5-03 proved the triplet in staging:

- workers-rs 0.8.1 Worker
- first-class `Hyperdrive` typed binding
- upstream `tokio-postgres` rev `35a85bdbfeeac465e092950f65a10d9192418175`
- `query_typed_one` instead of prepared-statement-style query helpers

## Shared Types Boundary

`crates/event-schema` is the only canonical payload source:

- `crates/event-schema/src/payload.rs` defines `EventPayload` and `TokenCounts`.
- `crates/event-schema/src/enums.rs` defines `Model`, `Tier`, `Harness`, and `Region`.
- `crates/event-schema/src/jcs.rs` exposes `canonical_bytes`.
- `apps/web/src/generated/` holds ts-rs generated TypeScript bindings for the SPA.

Downstream phases must not create a second enum manifest or a hand-written browser schema. If a public third-party enum manifest becomes necessary in v2, generate it from the Rust enum source through an xtask.

## R2 Layout

```
reports/v1/
  manifest.json
  _status.json
  q15/YYYY/MM/DD/HH-mm.json
  h1/YYYY/MM/DD/HH.json
  d1/YYYY/MM/DD.json
```

No enum manifest is published to R2 in v1. The SPA imports filter options from `apps/web/src/generated/`.

Write order:

1. Query closed buckets from Postgres.
2. Write bucket files.
3. Write `_status.json`.
4. Write `manifest.json` last.

Cache policy:

- Rolled-over buckets: `public, max-age=31536000, immutable`
- `manifest.json`: `public, max-age=60, must-revalidate`
- `_status.json`: short TTL, exact value decided in Phase 4

## Phase Dependencies

| Phase | Architecture Dependency |
|-------|-------------------------|
| Phase 2 Ingest | Uses `apps/worker`, `crates/pow`, `crates/event-schema`, workers-rs `Hyperdrive`, and `RateLimiter`. |
| Phase 3 CLI | Uses `crates/event-schema::canonical_bytes`, `EventPayload`, enum types, and `crates/pow` solver. |
| Phase 4 Dashboard | Uses `apps/web/src/generated/` enum/type bindings and R2 layout above. |
| Phase 5 Launch | Promotes the Worker, R2 custom domain, frontend Worker, and CLI distribution. |

## Security Boundaries

- The public R2 boundary must never expose `event_id`, `nonce`, IP, precise timestamps, raw token counts, or suppressed small cohorts.
- The Worker logging boundary must never emit `event_id`, `nonce`, IP, per-event timing, `WORKER_SECRET`, or Hyperdrive credentials.
- The CLI boundary is untrusted by design. Server-side validation, PoW, rate limiting, outlier trimming, and k-anonymity are the actual defenses.

---
*Architecture research for: bloclawd*
*Updated: 2026-04-30*
