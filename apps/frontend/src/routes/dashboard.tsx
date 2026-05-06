import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";

import { BreakdownTable } from "@/components/BreakdownTable";
import { Chart } from "@/components/Chart";
import { Chrome } from "@/components/Chrome";
import { CompareRows } from "@/components/CompareRows";
import { CostEquivalentPanel } from "@/components/CostEquivalentPanel";
import { DataTable, type DataTableRow } from "@/components/DataTable";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DistributionPicker } from "@/components/DistributionPicker";
import { EmptyState } from "@/components/EmptyState";
import { Filters } from "@/components/Filters";
import { PercentilePicker } from "@/components/PercentilePicker";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { TokenMixPanel } from "@/components/TokenMixPanel";
import { resolveRow, type ResolvedRow } from "@/lib/catalog";
import {
  EMPTY_ALIGNED_DATA,
  alignedDataHasValues,
  type AlignedData,
  type ChartMeta,
  type Series,
} from "@/lib/chart-data";
import { PERCENTILE_INDEX } from "@/lib/chart-tokens";
import { aggregateCohortCell } from "@/lib/cohort";
import {
  alignedHasValues,
  rowLabel,
  useChartData,
  useDelayedLoading,
  type CurveResult,
} from "@/lib/dashboard-data";
import {
  dashboardSearchSchema,
  primaryRowFromSearch,
  rangeWindow,
  type DashboardSearch,
} from "@/lib/dashboard-search";
import { formatUsd } from "@/lib/format";
import {
  isR2NotFound,
  useBucket,
  useManifest,
  useStatus,
  type StatusJson,
} from "@/lib/r2";
import { routeHead } from "@/lib/route-head";
import { pickTier } from "@/lib/tier-picker";

export type { DashboardSearch };
export { dashboardSearchSchema };

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: DashboardPage,
  head: () => routeHead("/dashboard"),
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const status = useStatus();
  const {
    curves,
    meta,
    loading,
    error,
    bucketsLoaded,
    bucketsTotal,
  } = useChartData(search);
  const delayedLoading = useDelayedLoading(loading);
  const statusNotice = status.data ? statusNoticeFor(status.data) : null;
  const primaryCurve = curves[0];
  const hasChartData = curves.some((c) => alignedHasValues(c.data));
  const bucketPartial =
    !loading && bucketsLoaded > 0 && bucketsLoaded < bucketsTotal;
  const kpis = useMemo(
    () => computeKpis(primaryCurve?.data ?? EMPTY_ALIGNED_DATA, meta ?? undefined),
    [primaryCurve?.data, meta],
  );

  const { startMs, endMs } = useMemo(
    () => rangeWindow(search, Date.now()),
    [search],
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag dot">live · public dataset</span>
            <span className="tag">v1</span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            API-equivalent cost · {primaryCurve ? primaryCurve.filters.limit_type : ""}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Where your tier&apos;s limits actually fire. Pick a tier for the
            live API-cost envelope, or open Rank to turn a submitted rank block
            into a shareable cohort card.
            Cells with fewer than 5 contributors are suppressed for anonymity.
          </p>
          <Chrome />
          {statusNotice?.kind === "degraded" ? (
            <p className="text-sm text-warning">
              Ingest degraded. Latest completed public data is still shown.
            </p>
          ) : null}
        </div>
      </header>

      <KpiRow kpis={kpis} hasData={hasChartData} />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 grow">
            <Filters />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              aria-label="Toggle compare mode"
              pressed={search.compare}
              onPressedChange={(pressed) =>
                void navigate({
                  search: (prev) => ({ ...prev, compare: pressed }),
                })
              }
              variant="outline"
              className="h-11 rounded-full px-3.5 text-[12.5px] lg:h-9"
            >
              {search.compare ? "Comparing" : "Compare"}
            </Toggle>
            <DateRangePicker />
          </div>
        </div>

        <CompareRows />

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              API cost · {formatRangeLabel(startMs, endMs)}
            </div>
            <div className="font-mono text-[11.5px] text-muted-foreground">
              {meta?.resolution ? resolutionLabelFor(meta.resolution) : "—"}{" "}
              bins · k ≥ 5 cells only · {kpis.submissionsLabel} submissions
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PercentilePicker />
            {!search.compare ? <DistributionPicker /> : null}
          </div>
        </div>

        {statusNotice?.kind === "stale" ? (
          <div
            className="mx-5 mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">Public data is stale</p>
            <p className="text-muted-foreground">
              Last update: {statusNotice.relative}.
            </p>
          </div>
        ) : null}

        <div className="px-5 pb-5">
          <ChartArea
            bucketPartial={bucketPartial}
            curves={curves}
            delayedLoading={delayedLoading}
            error={error}
            hasChartData={hasChartData}
            meta={meta}
            search={search}
          />
        </div>
      </div>

      <CohortPanels search={search} />
    </section>
  );
}

function CohortPanels({ search }: { search: DashboardSearch }) {
  // Cohort cards mirror the primary filter row and pin to the latest bucket
  // inside the user's selected range, so changing range/filters refreshes
  // the panels alongside the chart.
  const manifest = useManifest();
  const nowMs = Date.now();
  const { startMs, endMs, days } = rangeWindow(search, nowMs);
  const resolution = pickTier(days);
  const tierPaths = manifest.data?.tiers ?? null;
  const latestPath = pickLatestPathInRange(
    tierPaths,
    resolution,
    startMs,
    endMs,
  );
  const bucketQuery = useBucket(latestPath?.tier ?? "h1", latestPath?.path ?? "");
  const bucket = latestPath ? bucketQuery.data : undefined;

  const resolved: ResolvedRow = useMemo(
    () => resolveRow(primaryRowFromSearch(search)),
    [search],
  );
  const cell = useMemo(
    () => (bucket ? aggregateCohortCell(bucket, resolved) : null),
    [bucket, resolved],
  );

  if (!bucket || !cell) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
      <BreakdownTable cell={cell} />
      <TokenMixPanel cell={cell} />
      <CostEquivalentPanel
        bucket={bucket}
        filters={resolved}
        primary={search.primary}
      />
    </div>
  );
}

function pickLatestPathInRange(
  tiers: { q15: string[]; h1: string[]; d1: string[] } | null,
  preferredTier: "q15" | "h1" | "d1",
  startMs: number,
  endMs: number,
): { tier: "q15" | "h1" | "d1"; path: string } | null {
  if (!tiers) return null;
  // Mirror the chart resolution first, then fall back if that tier has no
  // bucket in the selected range.
  const orderedTiers = [
    preferredTier,
    ...(["q15", "h1", "d1"] as const).filter((tier) => tier !== preferredTier),
  ];
  for (const tier of orderedTiers) {
    const candidates = tiers[tier];
    if (!candidates.length) continue;
    let best: { ts: number; path: string } | null = null;
    for (const path of candidates) {
      const ts = parsePathTimestampMs(path, tier);
      if (ts == null) continue;
      if (ts < startMs || ts > endMs) continue;
      if (!best || ts > best.ts) best = { ts, path };
    }
    if (best) return { tier, path: best.path };
  }
  // Fallback: most recent of any resolution.
  for (const tier of ["h1", "d1", "q15"] as const) {
    const last = tiers[tier].at(-1);
    if (last) return { tier, path: last };
  }
  return null;
}

function parsePathTimestampMs(
  path: string,
  tier: "q15" | "h1" | "d1",
): number | null {
  const parts = path.replace(/\.json$/, "").replace(/^\/+/, "").split("/");
  const relative = parts[0] === tier ? parts.slice(1) : parts;
  const [year, month, day, time] = relative;
  const y = Number(year), m = Number(month), d = Number(day);
  if (!y || !m || !d) return null;
  if (tier === "d1") return Date.UTC(y, m - 1, d);
  const [h = "0", mi = "0"] = (time ?? "").split("-");
  return Date.UTC(y, m - 1, d, Number(h), Number(mi));
}

interface ChartAreaProps {
  bucketPartial: boolean;
  curves: CurveResult[];
  delayedLoading: boolean;
  error: Error | null;
  hasChartData: boolean;
  meta: ChartMeta | null;
  search: DashboardSearch;
}

function ChartArea({
  bucketPartial,
  curves,
  delayedLoading,
  error,
  hasChartData,
  meta,
  search,
}: ChartAreaProps): ReactNode {
  if (error) {
    return isR2NotFound(error) ? (
      <EmptyState
        heading="No public data published yet"
        subhead="The first daily aggregation runs at 03:00 UTC. Check the methodology page to see what will be published."
      />
    ) : (
      <EmptyState
        heading="We can't reach the public data right now"
        subhead="data.bloclawd.com may be having a hiccup. Refresh in a minute, or check the methodology page for what to expect."
      />
    );
  }

  if (delayedLoading) {
    return (
      <Skeleton
        aria-label="Loading aggregates..."
        className="h-[360px] w-full"
      />
    );
  }

  if (!hasChartData) {
    return (
      <EmptyState
        heading="Not enough data yet"
        subhead="Fewer than 5 contributors in this slice, so percentiles are suppressed for anonymity. Widen the range, drop a filter, or check back tomorrow — the next aggregate runs at 03:00 UTC."
      />
    );
  }

  const primary = curves[0];

  return (
    <div className="space-y-4">
      {bucketPartial ? (
        <div
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-semibold">One time slice didn&apos;t load</p>
          <p className="text-muted-foreground">
            Refreshing usually fixes this. The rest of the chart is up to date.
          </p>
        </div>
      ) : null}

      <Chart
        ariaLabel={chartAriaLabel(search)}
        primary={search.primary}
        dist={search.dist}
        curves={curves}
        meta={meta ?? undefined}
      />

      <ChartLegend curves={curves} compare={search.compare} />

      {primary ? (
        <details className="group rounded-xl border border-border bg-[var(--bg-1)]/60">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--bg-1)]">
            Show percentile values per timestamp
          </summary>
          <div className="border-t border-border px-0 py-3 sm:px-4">
            <DataTable
              ariaLabel="Percentile values per timestamp"
              rows={alignedDataToRows(primary.data)}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function KpiRow({ kpis, hasData }: { kpis: ComputedKpis; hasData: boolean }) {
  const items = [
    {
      label: "Median p50",
      value: hasData ? formatUsd(kpis.medianP50) : "—",
      sub: hasData
        ? `peak ${formatUsd(kpis.peak)} at slot ${kpis.peakIdx}`
        : "no contributors",
    },
    {
      label: "p50 change",
      value: hasData ? formatDriftPct(kpis.driftPct) : "—",
      sub:
        hasData && kpis.driftPct !== null
          ? "during selected period"
          : "needs at least 2 chart points",
    },
    {
      label: "p25 — p75 spread",
      value: hasData ? formatUsd(kpis.iqr) : "—",
      sub: hasData ? "interquartile range" : "—",
    },
    {
      label: "p10 — p90 spread",
      value: hasData ? formatUsd(kpis.outerSpread) : "—",
      sub: hasData ? "outer envelope" : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="surface-card px-5 py-4">
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value mt-1 text-2xl">{item.value}</div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {item.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({
  curves,
  compare,
}: {
  curves: CurveResult[];
  compare: boolean;
}) {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--violet)", "var(--coral)", "var(--amber)"];
  if (compare && curves.length > 1) {
    return (
      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
        {curves.map((curve, i) => (
          <span key={curve.key} className="inline-flex items-center gap-2">
            <span
              className="block h-[2px] w-4 rounded"
              style={{ background: palette[i % palette.length] }}
            />
            <span className="font-mono">{curve.label}</span>
          </span>
        ))}
      </div>
    );
  }
  const c = curves[0];
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <span
          className="block h-[2px] w-4 rounded"
          style={{ background: "var(--chart-1)" }}
        />
        {c ? rowLabel(c.filters) : "primary"}
      </span>
    </div>
  );
}

interface ComputedKpis {
  medianP50: number;
  peak: number;
  peakIdx: number;
  iqr: number;
  outerSpread: number;
  submissionsLabel: string;
  driftPct: number | null;
}

function computeKpis(
  data: AlignedData,
  meta: ChartMeta | undefined,
): ComputedKpis {
  const p10 = numericArray(data[PERCENTILE_INDEX.p10]);
  const p25 = numericArray(data[PERCENTILE_INDEX.p25]);
  const p50 = numericArray(data[PERCENTILE_INDEX.p50]);
  const p75 = numericArray(data[PERCENTILE_INDEX.p75]);
  const p90 = numericArray(data[PERCENTILE_INDEX.p90]);

  const median = mean(p50);
  const peak = p50.length === 0 ? 0 : Math.max(...p50);
  const peakIdx = p50.indexOf(peak);
  const iqr = mean(p75.map((v, i) => v - (p25[i] ?? v)));
  const outerSpread = mean(p90.map((v, i) => v - (p10[i] ?? v)));

  let submissionTotal = 0;
  let submissionsKnown = false;
  if (meta?.submissions) {
    for (const v of meta.submissions) {
      if (typeof v === "number" && Number.isFinite(v)) {
        submissionTotal += v;
        submissionsKnown = true;
      }
    }
  }

  return {
    medianP50: median,
    peak,
    peakIdx: peakIdx === -1 ? 0 : peakIdx,
    iqr,
    outerSpread,
    submissionsLabel: submissionsKnown
      ? submissionTotal.toLocaleString()
      : p50.length > 0
        ? `${p50.length}`
        : "0",
    driftPct: computeDriftPct(p50),
  };
}

function computeDriftPct(p50: number[]): number | null {
  if (p50.length < 2) return null;
  const mid = Math.floor(p50.length / 2);
  const firstHalf = mean(p50.slice(0, mid));
  const secondHalf = mean(p50.slice(mid));
  if (firstHalf === 0) return null;
  return ((secondHalf - firstHalf) / firstHalf) * 100;
}

export function formatDriftPct(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) < 0.05) return "±0%";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function numericArray(values: Series | undefined): number[] {
  if (!values) return [];
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function limitTypeLabel(limitType: string): string {
  return limitType === "5h" ? "5-hour limit" : "Weekly limit";
}

function resolutionLabelFor(resolution: ChartMeta["resolution"]): string {
  return resolution === "q15"
    ? "15 min"
    : resolution === "h1"
      ? "1 hour"
      : "1 day";
}

function formatRangeLabel(startMs: number, endMs: number): string {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return `${fmt(startMs)} → ${fmt(endMs)}`;
}

function statusNoticeFor(
  status: StatusJson,
): { kind: "stale" | "degraded"; relative: string } | null {
  const ageMs = Date.now() - new Date(status.last_cron_success_ts).getTime();
  const relative = formatRelative(status.last_cron_success_ts);
  if (status.ingest_health === "down" || ageMs > STALE_AFTER_MS) {
    return { kind: "stale", relative };
  }
  if (status.ingest_health === "degraded") {
    return { kind: "degraded", relative };
  }
  return null;
}

function alignedDataToRows(data: AlignedData): DataTableRow[] {
  const [xs, p10, p25, p50, p75, p90] = data;
  return Array.from(xs).map((ts, index) => ({
    ts: new Date(ts * 1000).toISOString(),
    p10: numericValue(p10?.[index]),
    p25: numericValue(p25?.[index]),
    p50: numericValue(p50?.[index]),
    p75: numericValue(p75?.[index]),
    p90: numericValue(p90?.[index]),
  }));
}

function numericValue(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chartAriaLabel(search: DashboardSearch): string {
  if (search.compare) return "Compare cohorts API-cost percentiles";
  return `${search.tier ?? "selected tier"} ${limitTypeLabel(
    search.limit_type ?? "5h",
  )} percentiles`;
}

function formatRelative(timestamp: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// Keep export for callers that imported it from this module.
export { alignedDataHasValues };
