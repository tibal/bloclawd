-- apps/worker/sql/0003_cron_state.sql
-- Cron work-queue state table.
-- Purpose: track per-(tier, bucket_ts) materialization state so cron ticks
-- can claim atomically via SELECT ... FOR UPDATE SKIP LOCKED, revert on
-- failure, and survive stale 'processing' rows via a sweeper at tick start.
--
-- Apply manually per branch:
--   psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0003_cron_state.sql
--   psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0003_cron_state.sql
--
-- DO NOT use a Postgres ENUM type for `state` — Hyperdrive's pooler has
-- historically tripped on per-OID lookups during prepared-statement setup.
-- TEXT + CHECK matches the existing model/tier/harness/region columns in
-- 0001_events.sql, which are also TEXT + serde-side closed-enum validation in
-- apps/worker/src/event.rs.
--
-- Strict CREATE TABLE / CREATE INDEX only: re-running this script must fail
-- loud, forcing the operator to think.

CREATE TABLE cron_state (
    tier         TEXT         NOT NULL,
    bucket_ts    TIMESTAMPTZ  NOT NULL,
    state        TEXT         NOT NULL DEFAULT 'not_processed'
                 CHECK (state IN ('not_processed', 'processing', 'processed')),
    claimed_at   TIMESTAMPTZ,
    worker_id    TEXT,
    finished_at  TIMESTAMPTZ,
    last_error   TEXT,
    PRIMARY KEY (tier, bucket_ts)
);

CREATE INDEX cron_state_unprocessed_idx
    ON cron_state (tier, bucket_ts)
    WHERE state = 'not_processed';
