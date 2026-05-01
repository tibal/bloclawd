-- apps/worker/sql/0001_events.sql
-- BACK-02 events table.
-- Apply manually per branch:
--   psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0001_events.sql
--   psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0001_events.sql
--
-- DO NOT add BEFORE triggers — apps/worker/src/event.rs uses an
-- ON CONFLICT DO UPDATE no-op idiom that would fire them on every duplicate.
-- See .planning/phases/02-ingest-backbone/02-RESEARCH.md §Pitfall 6.
--
-- Strict CREATE TABLE / CREATE INDEX only per D-34: re-running the bootstrap
-- script must fail loud, forcing the operator to think.

CREATE TABLE events (
    event_id     UUID         PRIMARY KEY,
    event_type   TEXT,
    bucket_ts    TIMESTAMPTZ  NOT NULL,
    payload      JSONB        NOT NULL,
    received_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    model        TEXT,
    tier         TEXT,
    harness      TEXT,
    region       TEXT
);

CREATE INDEX events_dim_idx
    ON events (bucket_ts, model, tier, harness, region);
