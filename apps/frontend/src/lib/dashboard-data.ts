import { useEffect, useMemo, useState } from "react";

import { resolveRow, type ResolvedRow } from "@/lib/catalog";
import {
  EMPTY_ALIGNED_DATA,
  type AlignedData,
  type ChartMeta,
  type Series,
} from "@/lib/chart-data";
import {
  primaryRowFromSearch,
  rangeWindow,
  type DashboardSearch,
  type FilterRow,
} from "@/lib/dashboard-search";
import {
  cellMatchesRow,
  percentilesForCells,
} from "@/lib/cohort";
import {
  useBuckets,
  useManifest,
  type BucketEnvelope,
  type Percentiles,
} from "@/lib/r2";
import { pickTier, type Tier as BucketTier } from "@/lib/tier-picker";

export type CurveResult = {
  // Stable key for React lists; primary row uses `primary`.
  key: string;
  label: string;
  filters: ResolvedRow;
  data: AlignedData;
};

export type ChartDataResult = {
  curves: CurveResult[];
  buckets: BucketEnvelope[];
  meta: ChartMeta | null;
  loading: boolean;
  error: Error | null;
  bucketsLoaded: number;
  bucketsTotal: number;
  resolution: BucketTier;
};

const EMPTY_PATHS: string[] = [];

export function useChartData(search: DashboardSearch): ChartDataResult {
  const nowMs = Date.now();
  const { startMs, endMs, days } = rangeWindow(search, nowMs);
  const resolution = pickTier(days);
  const manifest = useManifest();
  const manifestPaths = manifest.data?.tiers[resolution] ?? EMPTY_PATHS;
  const paths = useMemo(
    () => pathsForRange(manifestPaths, resolution, startMs, endMs),
    [manifestPaths, resolution, startMs, endMs],
  );
  const bucketResults = useBuckets(resolution, paths);
  const buckets = bucketResults.flatMap((result) =>
    result.data ? [result.data] : [],
  );
  const bucketLoading = bucketResults.some((result) => result.isLoading);
  const loading = manifest.isLoading || bucketLoading;
  const error = toError(manifest.error);

  const primaryRow = primaryRowFromSearch(search);
  const rows: FilterRow[] = search.compare
    ? [primaryRow, ...search.rows]
    : [primaryRow];

  if (error) {
    return {
      curves: [],
      buckets: [],
      meta: null,
      loading: false,
      error,
      bucketsLoaded: 0,
      bucketsTotal: paths.length,
      resolution,
    };
  }

  const curves = rows.map((row, idx) => {
    const resolved = resolveRow(row);
    return {
      key: idx === 0 ? "primary" : `row-${idx - 1}`,
      label: rowLabel(resolved),
      filters: resolved,
      data: buildAlignedData(buckets, resolved) ?? EMPTY_ALIGNED_DATA,
    };
  });

  const primary = curves[0];
  const meta = primary ? buildMeta(buckets, primary.filters, resolution) : null;

  return {
    curves,
    buckets,
    meta,
    loading,
    error: null,
    bucketsLoaded: buckets.length,
    bucketsTotal: paths.length,
    resolution,
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

export function rowLabel(row: ResolvedRow): string {
  // Compact label suited for the chart legend / cohort row badges.
  // Aggregable fields appear only when narrowed.
  const provider = row.provider === "anthropic" ? "Anthropic" : "OpenAI";
  const parts: string[] = [`${provider} · ${row.harness}`];
  if (row.tier) parts.push(row.tier);
  parts.push(row.limit_type);
  if (row.region) parts.push(row.region);
  if (row.model) parts.push(row.model);
  if (row.plan) parts.push(row.plan);
  return parts.join(" · ");
}

function buildMeta(
  buckets: BucketEnvelope[],
  row: ResolvedRow,
  resolution: BucketTier,
): ChartMeta {
  const timestamps = sortedUniqueTimestamps(buckets);
  const counts = new Map<number, number>();
  for (const bucket of buckets) {
    let total = 0;
    for (const cell of bucket.cells) {
      if (!cellMatchesRow(cell, row)) continue;
      total += cell.n_retained;
    }
    counts.set(bucketTimestampSeconds(bucket), total);
  }
  return {
    resolution,
    submissions: timestamps.map((ts) => counts.get(ts) ?? null),
  };
}

function buildAlignedData(
  buckets: BucketEnvelope[],
  row: ResolvedRow,
): AlignedData | null {
  const points = new Map<number, Percentiles>();
  for (const bucket of buckets) {
    const values = extractPercentiles(bucket, row);
    if (values) {
      points.set(bucketTimestampSeconds(bucket), values);
    }
  }
  if (points.size === 0) return null;
  const xs = Array.from(points.keys()).sort((a, b) => a - b);
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
  row: ResolvedRow,
): Percentiles | null {
  return percentilesForCells(
    bucket.cells.filter((cell) => cellMatchesRow(cell, row)),
  );
}

function pathsForRange(
  paths: string[],
  tier: BucketTier,
  startMs: number,
  endMs: number,
): string[] {
  return paths
    .map((path) => ({ path, ts: pathTimestampMs(path, tier) }))
    .filter(({ ts }) => ts !== null && ts >= startMs && ts <= endMs)
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

  if (!parsedYear || !parsedMonth || !parsedDay) return null;
  if (tier === "d1") return Date.UTC(parsedYear, parsedMonth - 1, parsedDay);

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
  if (!error) return null;
  return error instanceof Error ? error : new Error(String(error));
}

export function alignedHasValues(data: AlignedData | null): boolean {
  if (!data) return false;
  const p50 = data[3] ?? [];
  for (let i = 0; i < p50.length; i++) {
    const v = p50[i];
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

// Helper retained for tests; prefer rangeWindow + pickTier in new code.
export function windowDaysFor(_unused: unknown): number {
  void _unused;
  return 7;
}

export type { Series };
