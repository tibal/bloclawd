import { useEffect, useMemo, useState } from "react";
import type uPlot from "uplot";

import type { DashboardSearch } from "@/routes/dashboard";
import {
  decodePercentiles,
  useBuckets,
  useManifest,
  type BucketCell,
  type BucketEnvelope,
  type Percentiles,
} from "@/lib/r2";
import { pickTier, type Tier as BucketTier } from "@/lib/tier-picker";

type SubscriptionTier = "pro" | "max5" | "max20";
type WindowParam = DashboardSearch["window"];

export type ChartDataResult = {
  data: uPlot.AlignedData | null;
  compareData: { tier: SubscriptionTier; data: uPlot.AlignedData }[] | null;
  loading: boolean;
  error: Error | null;
  bucketsLoaded: number;
  bucketsTotal: number;
};

const COMPARE_TIERS = ["pro", "max5", "max20"] as const;
const EMPTY_PATHS: string[] = [];
const EMPTY_ALIGNED_DATA: uPlot.AlignedData = [[], [], [], [], [], []];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS: Record<WindowParam, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function useChartData(filters: DashboardSearch): ChartDataResult {
  const windowDays = windowDaysFor(filters.window);
  const bucketTier = pickTier(windowDays);
  const manifest = useManifest();
  const manifestPaths = manifest.data?.tiers[bucketTier] ?? EMPTY_PATHS;
  const nowMs = Date.now();
  const paths = useMemo(
    () => pathsForWindow(manifestPaths, bucketTier, windowDays, nowMs),
    [bucketTier, manifestPaths, nowMs, windowDays],
  );
  const bucketResults = useBuckets(bucketTier, paths);
  const buckets = bucketResults.flatMap((result) =>
    result.data ? [result.data] : [],
  );
  const bucketLoading = bucketResults.some((result) => result.isLoading);
  const loading = manifest.isLoading || bucketLoading;
  const error = toError(manifest.error);

  if (error) {
    return {
      data: null,
      compareData: null,
      loading: false,
      error,
      bucketsLoaded: 0,
      bucketsTotal: paths.length,
    };
  }

  if (filters.compare) {
    return {
      data: null,
      compareData: buildCompareData(buckets, filters),
      loading,
      error: null,
      bucketsLoaded: buckets.length,
      bucketsTotal: paths.length,
    };
  }

  return {
    data: filters.tier
      ? buildAlignedData(buckets, filters, filters.tier) ?? null
      : null,
    compareData: null,
    loading,
    error: null,
    bucketsLoaded: buckets.length,
    bucketsTotal: paths.length,
  };
}

export function useDelayedLoading(loading: boolean, delayMs = 300): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDelayed(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, loading]);

  return delayed;
}

export function windowDaysFor(window: WindowParam): number {
  return WINDOW_DAYS[window];
}

function buildCompareData(
  buckets: BucketEnvelope[],
  filters: DashboardSearch,
): { tier: SubscriptionTier; data: uPlot.AlignedData }[] {
  const timestamps = sortedUniqueTimestamps(buckets);

  return COMPARE_TIERS.map((tier) => ({
    tier,
    data: buildAlignedData(buckets, filters, tier, timestamps) ?? [
      timestamps,
      [],
      [],
      [],
      [],
      [],
    ],
  }));
}

function buildAlignedData(
  buckets: BucketEnvelope[],
  filters: DashboardSearch,
  tier: SubscriptionTier,
  timestamps?: number[],
): uPlot.AlignedData | null {
  const points = new Map<number, Percentiles>();

  for (const bucket of buckets) {
    const values = extractPercentiles(bucket, filters, tier);
    if (values) {
      points.set(bucketTimestampSeconds(bucket), values);
    }
  }

  if (points.size === 0 && !timestamps) {
    return null;
  }

  const xs = timestamps ?? Array.from(points.keys()).sort((a, b) => a - b);
  if (xs.length === 0) {
    return EMPTY_ALIGNED_DATA;
  }

  return [
    xs,
    xs.map((ts) => points.get(ts)?.p10 ?? null),
    xs.map((ts) => points.get(ts)?.p25 ?? null),
    xs.map((ts) => points.get(ts)?.p50 ?? null),
    xs.map((ts) => points.get(ts)?.p75 ?? null),
    xs.map((ts) => points.get(ts)?.p90 ?? null),
  ];
}

function extractPercentiles(
  bucket: BucketEnvelope,
  filters: DashboardSearch,
  tier: SubscriptionTier,
): Percentiles | null {
  const values: Array<{ weight: number; percentiles: Percentiles }> = [];

  for (const cell of bucket.cells) {
    if (!matchesCell(cell, filters, tier)) {
      continue;
    }

    const extracted = extractCellPercentiles(cell, filters);
    if (extracted) {
      values.push(extracted);
    }
  }

  return weightedAverage(values);
}

function matchesCell(
  cell: BucketCell,
  filters: DashboardSearch,
  tier: SubscriptionTier,
): boolean {
  return (
    cell.tier === tier &&
    cell.harness === filters.harness &&
    cell.limit_type === filters.limit_type &&
    !cell.insufficient_data &&
    (!filters.region || cell.region === filters.region)
  );
}

function extractCellPercentiles(
  cell: BucketCell,
  filters: DashboardSearch,
): { weight: number; percentiles: Percentiles } | null {
  if (!filters.model) {
    const percentiles = decodePercentiles(cell.unified_cost);
    return percentiles
      ? { weight: Math.max(1, cell.n_submissions), percentiles }
      : null;
  }

  const model = cell.models.find((entry) => entry.model === filters.model);
  const percentiles = decodePercentiles(
    model?.tokens_to_limit_if_only ?? null,
  );

  return percentiles && model
    ? { weight: Math.max(1, model.n_with_model), percentiles }
    : null;
}

function weightedAverage(
  values: Array<{ weight: number; percentiles: Percentiles }>,
): Percentiles | null {
  if (values.length === 0) {
    return null;
  }

  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  const weighted = (key: keyof Percentiles) =>
    values.reduce(
      (sum, item) => sum + item.percentiles[key] * item.weight,
      0,
    ) / totalWeight;

  return {
    p10: weighted("p10"),
    p25: weighted("p25"),
    p50: weighted("p50"),
    p75: weighted("p75"),
    p90: weighted("p90"),
  };
}

function pathsForWindow(
  paths: string[],
  tier: BucketTier,
  windowDays: number,
  nowMs: number,
): string[] {
  const cutoffMs = nowMs - windowDays * MS_PER_DAY;

  return paths
    .map((path) => ({ path, ts: pathTimestampMs(path, tier) }))
    .filter(({ ts }) => ts !== null && ts >= cutoffMs && ts <= nowMs)
    .sort((a, b) => a.ts! - b.ts!)
    .map(({ path }) => path);
}

function pathTimestampMs(path: string, tier: BucketTier): number | null {
  const parts = path
    .replace(/\.json$/, "")
    .replace(/^\/+/, "")
    .split("/");
  const relative = parts[0] === tier ? parts.slice(1) : parts;
  const [year, month, day, time] = relative;
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);

  if (!parsedYear || !parsedMonth || !parsedDay) {
    return null;
  }

  if (tier === "d1") {
    return Date.UTC(parsedYear, parsedMonth - 1, parsedDay);
  }

  const [hourPart, minutePart = "0"] = (time ?? "").split("-");
  const parsedHour = Number(hourPart);
  const parsedMinute = Number(minutePart);

  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) {
    return null;
  }

  return Date.UTC(
    parsedYear,
    parsedMonth - 1,
    parsedDay,
    parsedHour,
    parsedMinute,
  );
}

function sortedUniqueTimestamps(buckets: BucketEnvelope[]): number[] {
  return Array.from(new Set(buckets.map(bucketTimestampSeconds))).sort(
    (a, b) => a - b,
  );
}

function bucketTimestampSeconds(bucket: BucketEnvelope): number {
  return Math.floor(new Date(bucket.bucket_ts).getTime() / 1000);
}

function toError(error: unknown): Error | null {
  if (!error) {
    return null;
  }

  return error instanceof Error ? error : new Error(String(error));
}
