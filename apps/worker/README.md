# bloclawd-worker

Cloudflare Worker (Rust -> WASM via workers-rs 0.8.1) implementing the bloclawd ingest endpoints (`GET /challenge`, `POST /event`). Backed by PlanetScale Postgres via Cloudflare Hyperdrive. Built with `worker-build 0.8.1`.

See `.planning/phases/02-ingest-backbone/02-CONTEXT.md` for the locked phase decisions and `spec/pow-v1.md` / `spec/event-schema.md` for the wire contract.

## Environments

| Env | Worker name | PlanetScale branch | Worker URL |
|-----|-------------|-------------------|------------|
| staging | `bloclawd-worker-staging` | `staging` | `bloclawd-worker-staging.<account>.workers.dev` |
| production | `bloclawd-worker` | `main` | `bloclawd-worker.<account>.workers.dev` (custom domain `api.bloclawd.com` deferred to Phase 5 per D-39) |

Both envs share one PlanetScale Postgres database (PS-5 HA tier - see `.planning/decisions/ADR-001-planetscale-tier.md`) with two branches per D-37. Branch isolation is the staging-vs-prod boundary; do not move events across branches.

## One-time setup

### 1. Apply schema to each branch (D-33, D-34)

The schema in `sql/0001_events.sql` is strict: re-running fails loud. Apply once per branch when bootstrapping a new database. To re-apply after a schema change, drop the old table first via a separate migration script.

```bash
# Get branch URLs from PlanetScale dashboard:
#   https://app.planetscale.com/<org>/<db>/branches/<branch>/connect
export PLANETSCALE_STAGING_URL='postgres://...staging-branch...'
export PLANETSCALE_MAIN_URL='postgres://...main-branch...'

# Apply schema to staging branch FIRST, smoke-test, THEN to main.
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0001_events.sql
psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0001_events.sql
```

PlanetScale branching does NOT auto-replicate DDL. Each branch must be applied to manually.

### 2. Set the per-env WORKER_SECRET (D-38)

`WORKER_SECRET` is the HMAC key used to sign and verify `GET /challenge` outputs. Per D-38, the staging and production secrets MUST be distinct >=256-bit values; a leaked staging secret cannot forge production challenges.

```bash
# Generate a 64-byte (512-bit) hex secret per env. openssl rand is acceptable; any
# CSPRNG that produces >=256 bits is fine. Pipe via stdin so the value never touches disk.
openssl rand -hex 64 | wrangler secret put WORKER_SECRET --env staging
openssl rand -hex 64 | wrangler secret put WORKER_SECRET --env production
```

Per Pitfall 8 (RESEARCH.md): `wrangler secret put WORKER_SECRET` (no `--env`) sets the unscoped top-level secret only; it is NOT inherited into `[env.*]` deployments. Always pass `--env`.

Rotation (manual; v2 will introduce key id + 2-key overlap per CONTEXT.md `<deferred>`): repeat the per-env command above when rotating; old challenges issued with the previous secret will fail HMAC verify within 60s and clients will get fresh ones.

### 3. Production Hyperdrive setup (one-time)

`apps/worker/wrangler.toml`'s `[[env.production.hyperdrive]] id` is a placeholder `REPLACE_WITH_PROD_HYPERDRIVE_ID`; the prod Hyperdrive config does not yet exist.

1. In the Cloudflare dashboard: Workers & Pages -> Hyperdrive -> "Create configuration" pointing at `$PLANETSCALE_MAIN_URL`.
2. Copy the resulting `id` (UUID-shape).
3. Edit `apps/worker/wrangler.toml` and replace the placeholder with the real id.
4. Commit the wrangler.toml change.
5. A production dry-run deploy should now succeed.

The staging Hyperdrive id is `9e97e64d73c945cab3548a0dceb05c4b` (already in `wrangler.toml`).

Per Pitfall 7: if the PlanetScale branch URL changes (credential rotation), update the matching Hyperdrive config in the dashboard AND redeploy the Worker.

## Deploy

```bash
wrangler deploy --env staging       # Always do this first.
wrangler deploy --env production    # After staging smoke-tests pass.
```

## End-to-end smoke test (D-46)

A native Rust integration test exercises the full PoW flow against a deployed staging Worker. It is gated behind a cargo feature and `#[ignore]`, so regular `cargo test` does NOT run it.

```bash
BLOCLAWD_STAGING_URL='https://bloclawd-worker-staging.<account>.workers.dev' \
BLOCLAWD_STAGING_PG_URL='postgres://...staging-branch-direct-url...' \
  cargo test -p bloclawd-worker --features staging-smoke -- --ignored happy_path
```

The test:
- `GET /challenge` to fetch a fresh HMAC-signed challenge.
- Builds a sample EventPayload, canonicalizes via `event_schema::canonical_bytes`, computes payload_hash via SHA-256.
- Solves PoW (K=22, ~1s on dev hardware) via `pow::solve`.
- `POST /event` with the solved nonce + UUIDv4 event_id.
- Asserts `200 {"ok": true, "bucket_ts": "<rfc3339>"}` per D-47.
- SELECTs the row from PlanetScale staging via direct `tokio-postgres` (NOT Hyperdrive; Hyperdrive is Worker-only) to confirm persistence.
- Re-POSTs the same `event_id` to verify D-47 idempotency: the duplicate must return `200 {"ok": true, "bucket_ts": "<same as first POST>"}` (no 409, no new row, no shape change). This validates the `ON CONFLICT DO UPDATE SET event_id = events.event_id RETURNING bucket_ts` idiom.

## Logging boundary (INGE-11)

No `worker::console_log!` (or any log emitter) may include `event_id`, `nonce`, `cf-connecting-ip`, `payload_hash`, `sig`, `WORKER_SECRET`, the Hyperdrive `connection_string`, or per-event timing.
The CI grep gate at `.github/workflows/pow.yml` enforces this.
See `apps/worker/src/db.rs:43-44` for the only allowed log shape (`console_log!("pg connection task ended");` - no request context).
