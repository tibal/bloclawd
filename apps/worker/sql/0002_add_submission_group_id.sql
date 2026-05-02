-- apps/worker/sql/0002_add_submission_group_id.sql
-- Phase 3 D-55 amendment: add submission_group_id transport column.
-- Purpose: persist the per-invocation linkage id (D-51) alongside each event
-- so Phase 4 cron can compute private-side per-rate-limit-hit metrics
-- (e.g., models_per_hit_p50). The id is STRIPPED before any R2 emission (D-56).
--
-- Apply manually per branch (per Phase 2 D-39 per-env split):
--   psql "$PLANETSCALE_STAGING_URL" < apps/worker/sql/0002_add_submission_group_id.sql
--   psql "$PLANETSCALE_MAIN_URL"    < apps/worker/sql/0002_add_submission_group_id.sql
--
-- NOT NULL safe at v1: Phase 2 only proved staging via the D-46 e2e test;
-- no production rows exist on the main branch. If rows DO exist on staging,
-- the safe migration pattern is ADD ... NULL, backfill, ALTER ... SET NOT NULL.

ALTER TABLE events ADD COLUMN submission_group_id UUID NOT NULL;
