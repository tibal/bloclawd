-- apps/worker/sql/0002_add_submission_group_id.sql
-- Add submission_group_id transport column.
-- Purpose: persist the per-invocation linkage id alongside each event so cron
-- can compute private-side per-rate-limit-hit metrics (e.g.,
-- models_per_hit_p50). The id is STRIPPED before any R2 emission.
--
-- Apply manually per branch:
--   psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0002_add_submission_group_id.sql
--   psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0002_add_submission_group_id.sql
--
-- NOT NULL safe for initial v1 rollout: no production rows exist on the main
-- branch. If rows DO exist on staging, the safe migration pattern is
-- ADD ... NULL, backfill, ALTER ... SET NOT NULL.

ALTER TABLE events ADD COLUMN submission_group_id UUID NOT NULL;
