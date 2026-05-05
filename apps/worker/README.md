# bloclawd-worker

Cloudflare Worker (Rust -> WASM via workers-rs 0.8.1) implementing the bloclawd ingest endpoints (`GET /challenge`, `POST /event`). Backed by PlanetScale Postgres via Cloudflare Hyperdrive. Built with `worker-build 0.8.1`.

See `spec/pow-v1.md` and `spec/event-schema.md` for the wire contract.

## Environments

| Env | Worker name | PlanetScale branch | Worker URL |
|-----|-------------|-------------------|------------|
| staging | `bloclawd-worker-staging` | `staging` | `bloclawd-worker-staging.<account>.workers.dev` |
| production | `bloclawd-worker` | `main` | `bloclawd-worker.<account>.workers.dev` (custom domain `api.bloclawd.com`) |

Both envs share one PlanetScale Postgres database with separate staging and production branches. Branch isolation is the staging-vs-production boundary; do not move events across branches.

## One-time setup

### 1. Apply schema to each branch

The SQL files in `sql/` are strict: re-running fails loud. Apply each migration once per branch, in order. To re-apply after a schema change, use the next numbered migration script.

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

### 0002 - Add submission_group_id

The CLI submits events with a per-invocation `submission_group_id`. Apply this migration before the first CLI submission lands on either branch.

```bash
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0002_add_submission_group_id.sql
psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0002_add_submission_group_id.sql
```

The migration is `NOT NULL` safe for initial v1 rollout because production has no rows. If rows exist on staging at apply time, follow the safe ADD ... NULL -> backfill -> SET NOT NULL pattern instead.

### Aggregation migrations

Apply per-branch in order:

```bash
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0003_cron_state.sql
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0004_add_limit_type.sql

# Production (no rows yet at v1):
psql "$PLANETSCALE_MAIN_URL" < apps/worker/sql/0003_cron_state.sql
psql "$PLANETSCALE_MAIN_URL" < apps/worker/sql/0004_add_limit_type.sql
```

Operator notes:
- `0004` is `NOT NULL` without `DEFAULT`. On staging, run `TRUNCATE TABLE events;` immediately before applying 0004 if smoke-test rows exist. Production has no rows before initial rollout.
- `0003_cron_state.sql` uses `TEXT + CHECK` for `state`, NOT a Postgres ENUM type - see file header for rationale (Hyperdrive prepared-statement pitfall avoidance).

### 0005 - Postgres schema cleanup

Apply per-branch after `0004_add_limit_type.sql`:

```bash
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0005_postgres_schema_cleanup.sql
psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0005_postgres_schema_cleanup.sql
```

This migration drops unused denormalized event columns (`event_type`, `model`, `tier`, `harness`, `region`), replaces `events_dim_idx` with indexes matching cron/status query shapes, and adds DB-side checks for `events.limit_type` and `cron_state.tier`.

### R2 bucket provisioning (one-time, before first cron deploy)

The cron handler writes to R2 via the `BUCKET` binding declared per-env in `wrangler.toml`. Buckets must exist before deploy:

```bash
wrangler r2 bucket create bloclawd-reports-staging
wrangler r2 bucket create bloclawd-reports
```

The `bloclawd-reports` production bucket is served from `data.bloclawd.com`. Staging reads files through the enabled R2 dev URL (`https://pub-<r2-dev-url-hash>.r2.dev` from `wrangler r2 bucket dev-url get bloclawd-reports-staging`).

### Cloudflare Workers Paid subscription requirement

The `#[event(scheduled)]` cron handler requires the Workers Paid subscription ($5/mo). The free tier caps cron at 10ms CPU per invocation, which is insufficient for cohort aggregation and R2 writes. Confirm the Cloudflare account has the paid subscription before deploying cron triggers; otherwise deploy fails with a quota error.

### 2. Set the per-env WORKER_SECRET

`WORKER_SECRET` is the HMAC key used to sign and verify `GET /challenge` outputs. The staging and production secrets MUST be distinct >=256-bit values; a leaked staging secret cannot forge production challenges.

```bash
# Generate a 64-byte (512-bit) hex secret per env. openssl rand is acceptable; any
# CSPRNG that produces >=256 bits is fine. Pipe via stdin so the value never touches disk.
openssl rand -hex 64 | wrangler secret put WORKER_SECRET --env staging
openssl rand -hex 64 | wrangler secret put WORKER_SECRET --env production
```

`wrangler secret put WORKER_SECRET` without `--env` sets the unscoped top-level secret only; it is NOT inherited into `[env.*]` deployments. Always pass `--env`.

Rotation is manual: repeat the per-env command above when rotating; old challenges issued with the previous secret will fail HMAC verify within 60s and clients will get fresh ones.

### 3. Hyperdrive configs (one-time per env)

Each PlanetScale branch needs its own Hyperdrive config. Both ids are pinned in `apps/worker/wrangler.toml`:

- staging Hyperdrive id `4d7287b7f8194d96a0a95163a29c0134` -> PlanetScale `staging` branch
- production Hyperdrive id `9e97e64d73c945cab3548a0dceb05c4b` -> PlanetScale `main` branch

To add a new env (or rotate after a credential change):

1. In the Cloudflare dashboard: Workers & Pages -> Hyperdrive -> "Create configuration" pointing at the matching PlanetScale branch URL.
2. Copy the resulting `id` (UUID-shape) into the corresponding `[[env.<name>.hyperdrive]] id` in `apps/worker/wrangler.toml`.
3. Commit the wrangler.toml change.

If the PlanetScale branch URL changes during credential rotation, update the matching Hyperdrive config in the dashboard and redeploy the Worker.

## Deploy

```bash
wrangler deploy --env staging       # Always do this first.
wrangler deploy --env production    # After staging smoke-tests pass.
```

## End-to-end smoke test

A native Rust integration test exercises the full PoW flow against a deployed staging Worker. It is gated behind a cargo feature and `#[ignore]`, so regular `cargo test` does NOT run it.

```bash
BLOCLAWD_STAGING_URL='https://bloclawd-worker-staging.<account>.workers.dev' \
PLANETSCALE_STAGING_URL='postgres://...staging-branch-direct-url...' \
  cargo test --release -p bloclawd-worker --features staging-smoke -- --ignored happy_path
```

The test:
- `GET /challenge` to fetch a fresh HMAC-signed challenge.
- Builds a sample EventPayload, canonicalizes via `event_schema::canonical_bytes`, computes payload_hash via SHA-256.
- Solves PoW (K=22, ~1s on dev hardware) via `pow::solve`.
- `POST /event` with the solved nonce, UUIDv4 `event_id`, UUIDv4 `submission_group_id`, and `limit_type`.
- Asserts `200 {"ok": true, "bucket_ts": "<rfc3339>"}`.
- SELECTs the row from PlanetScale staging via direct `tokio-postgres` (NOT Hyperdrive; Hyperdrive is Worker-only) to confirm persistence.
- Re-POSTs the same `event_id` to verify idempotency: the duplicate must return `200 {"ok": true, "bucket_ts": "<same as first POST>"}` (no 409, no new row, no shape change). This validates the `ON CONFLICT DO UPDATE SET event_id = events.event_id RETURNING bucket_ts` idiom.

## Logging boundary

No log emitter may include `event_id`, `nonce`, `submission_group_id`, `cf-connecting-ip`, `payload_hash`, `sig`, `WORKER_SECRET`, the Hyperdrive `connection_string`, or per-event timing.
The CI grep gate at `.github/workflows/pow.yml` enforces this.
The only allowed Worker log shape is the connection-task lifecycle message without request context.

## Staging proof: cron to R2 to dashboard

Run this after aggregation migrations, R2 bucket provisioning, and a staging Worker deploy. It proves the scheduled cron path can materialize public R2 files and the staging frontend can render them.

Staging URL placeholders:

- Worker: `https://bloclawd-worker-staging.<account-hash>.workers.dev/`
- Frontend: `https://bloclawd-frontend-staging.<account-hash>.workers.dev/`
- R2 manifest: `https://pub-<r2-dev-url-hash>.r2.dev/reports/v1/manifest.json`

Operator commands:

```bash
export PLANETSCALE_STAGING_URL='postgres://...staging-branch-direct-url...'
export STAGING_R2_BASE_URL='https://pub-<r2-dev-url-hash>.r2.dev'

psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0003_cron_state.sql
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0004_add_limit_type.sql
psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0005_postgres_schema_cleanup.sql

cd apps/worker
wrangler deploy --env staging
cd ../..

pnpm --filter ./apps/frontend build --mode staging
cd apps/frontend
wrangler deploy --env staging
cd ../..

PLANETSCALE_STAGING_URL="$PLANETSCALE_STAGING_URL" \
STAGING_R2_BASE_URL="$STAGING_R2_BASE_URL" \
  cargo test -p bloclawd-worker --features staging-smoke --locked --test cron_e2e_staging -- --ignored --nocapture
```

When the ignored test pauses, run this in a second terminal:

```bash
# Wrangler 4 has no `wrangler triggers cron` manual invoke command.
# Wait for the deployed staging cron trigger instead.
# Staging runs every 15 minutes: */15 * * * * UTC.
date -u
```

After the next quarter-hour tick has passed, return to the test terminal and press Enter.

Manual browser checklist:

1. Open `https://bloclawd-frontend-staging.<account-hash>.workers.dev/dashboard?tier=max20&harness=cc&region=EU&limit_type=5h&window=7d`.
2. Confirm the chrome row shows recent public data, event count, approximate contributor count, and a `Healthy` chip.
3. Confirm the chart renders an API-cost timeseries and the table shows p10/p25/p50/p75/p90 values.
4. Toggle `Compare tiers`; max20 should have data and missing tiers should not invent values.
5. Open `/methodology`; confirm all methodology sections render.
6. Open `/data`; confirm canonical JSON bytes and field annotations render.
7. Open `/methodology/changelog`; confirm the v1 empty state renders.
8. In DevTools Network, reload `/dashboard`; confirm `manifest.json`, `_status.json`, and bucket file requests hit the staging R2 hostname over HTTPS.
9. Inspect the bucket response body; confirm no `submission_group_id`, `event_id`, `nonce`, or `tz_offset` substrings appear.
