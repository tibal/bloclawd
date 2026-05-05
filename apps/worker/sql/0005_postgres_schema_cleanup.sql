-- apps/worker/sql/0005_postgres_schema_cleanup.sql
-- Remove unused event-table columns and replace the old dimension index with
-- indexes that match current cron and status query shapes.
--
-- Apply manually per branch after 0004_add_limit_type.sql:
--   psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0005_postgres_schema_cleanup.sql
--   psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0005_postgres_schema_cleanup.sql
--
-- Strict DDL only: re-running this script must fail loud, forcing the
-- operator to verify branch state.

DROP INDEX events_dim_idx;

ALTER TABLE events
    DROP COLUMN event_type,
    DROP COLUMN model,
    DROP COLUMN tier,
    DROP COLUMN harness,
    DROP COLUMN region;

CREATE INDEX events_bucket_ts_idx
    ON events (bucket_ts);

CREATE INDEX events_received_at_submission_group_idx
    ON events (received_at, submission_group_id);

ALTER TABLE events
    ADD CONSTRAINT events_limit_type_check
    CHECK (limit_type IN ('5h', 'weekly'));

ALTER TABLE cron_state
    ADD CONSTRAINT cron_state_tier_check
    CHECK (tier IN ('q15', 'h1', 'd1'));

CREATE INDEX cron_state_processing_claimed_idx
    ON cron_state (claimed_at)
    WHERE state = 'processing';
