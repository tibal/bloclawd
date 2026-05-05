// Dashboard URL search shape, lifted out of `routes/dashboard.tsx` so
// components can import the schema without pulling in the route module.
//
// The schema covers three concerns: a "primary" filter row (an unprefixed
// CatalogFilters), the active time range, and a stack of additional filter
// rows that drive compare-mode curves.

import { z } from "zod";

import {
  HARNESS_VALUES,
  LIMIT_TYPE_VALUES,
  MODEL_VALUES,
  PLAN_VALUES,
  PROVIDER_VALUES,
  REGION_VALUES,
  TIER_VALUES,
} from "@/lib/catalog";

export const RANGE_VALUES = ["1w", "1m", "3m", "custom"] as const;
export type RangeKey = (typeof RANGE_VALUES)[number];

export const DIST_VALUES = ["p10-p90", "p25-p75"] as const;
export type DistKey = (typeof DIST_VALUES)[number];

export const PERCENTILE_PARAM_VALUES = [
  "p10",
  "p25",
  "p50",
  "p75",
  "p90",
] as const;

const baseRow = {
  provider: z.enum(PROVIDER_VALUES).optional(),
  plan: z.enum(PLAN_VALUES).optional(),
  model: z.enum(MODEL_VALUES).optional(),
  tier: z.enum(TIER_VALUES).optional(),
  harness: z.enum(HARNESS_VALUES).optional(),
  region: z.enum(REGION_VALUES).optional(),
  limit_type: z.enum(LIMIT_TYPE_VALUES).optional(),
};

export const filterRowSchema = z.object(baseRow);

export type FilterRow = z.infer<typeof filterRowSchema>;

export const dashboardSearchSchema = z.object({
  ...baseRow,
  range: z.enum(RANGE_VALUES).default("1w"),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  primary: z.enum(PERCENTILE_PARAM_VALUES).default("p50"),
  dist: z.array(z.enum(DIST_VALUES)).default(["p10-p90", "p25-p75"]),
  compare: z.boolean().default(false),
  rows: z.array(filterRowSchema).default([]),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

export function primaryRowFromSearch(search: DashboardSearch): FilterRow {
  return {
    provider: search.provider,
    plan: search.plan,
    model: search.model,
    tier: search.tier,
    harness: search.harness,
    region: search.region,
    limit_type: search.limit_type,
  };
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function rangeWindow(
  search: DashboardSearch,
  nowMs: number,
): { startMs: number; endMs: number; days: number } {
  if (search.range === "1w") {
    return { startMs: nowMs - 7 * MS_PER_DAY, endMs: nowMs, days: 7 };
  }
  if (search.range === "1m") {
    return { startMs: nowMs - 30 * MS_PER_DAY, endMs: nowMs, days: 30 };
  }
  if (search.range === "3m") {
    return { startMs: nowMs - 90 * MS_PER_DAY, endMs: nowMs, days: 90 };
  }
  // custom — store epoch seconds in URL, fall back to a 1w window if missing.
  const endSec =
    typeof search.end === "number" ? search.end : Math.floor(nowMs / 1000);
  const startSec =
    typeof search.start === "number"
      ? search.start
      : endSec - 7 * 24 * 3600;
  const startMs = Math.min(startSec, endSec) * 1000;
  const endMs = Math.max(startSec, endSec) * 1000;
  const days = Math.max(1, (endMs - startMs) / MS_PER_DAY);
  return { startMs, endMs, days };
}
