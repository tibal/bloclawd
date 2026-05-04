import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { z } from "zod";

import { Chart } from "@/components/Chart";
import { Chrome } from "@/components/Chrome";
import { DataTable, type DataTableRow } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { EnvelopeToggle } from "@/components/EnvelopeToggle";
import { Filters } from "@/components/Filters";
import { neighborBand, PercentilePicker } from "@/components/PercentilePicker";
import { TierToggle } from "@/components/TierToggle";
import { BreakdownTable } from "@/components/BreakdownTable";
import { TokenMixPanel } from "@/components/TokenMixPanel";
import { CostEquivalentPanel } from "@/components/CostEquivalentPanel";
import { Brush } from "@/components/Brush";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartData, useDelayedLoading } from "@/lib/dashboard-data";
import {
  isR2NotFound,
  useBucket,
  useManifest,
  useStatus,
  type BucketCell,
  type BucketEnvelope,
  type StatusJson,
} from "@/lib/r2";
import {
  PERCENTILE_INDEX,
  TIER_COLOR_VAR,
  TIER_DASH,
  type TierName,
} from "@/lib/chart-tokens";
import {
  EMPTY_ALIGNED_DATA,
  alignedDataHasValues,
  sliceByBrush,
  sliceMetaByBrush,
  type AlignedData,
  type ChartMeta,
  type Series,
} from "@/lib/chart-data";
import { formatTokens } from "@/lib/format";
import { routeHead } from "@/lib/route-head";

const MODEL_VALUES = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "gpt-5",
  "gpt-5.5",
  "gpt-5-codex",
] as const;
const HARNESS_VALUES = ["cc", "claude-code", "codex"] as const;
const REGION_VALUES = ["NA", "EU", "AS", "SA", "OC", "AF", "AN"] as const;
const TIER_VALUES = ["pro", "max5", "max20"] as const;
// Provider / Plan literal tuples must mirror `crates/event-schema/src/catalog.rs`.
// `Filters.test` asserts that the catalog JSON matches these values.
const PROVIDER_VALUES = ["anthropic", "openai"] as const;
const PLAN_VALUES = [
  "anthropic-pro",
  "anthropic-max5",
  "anthropic-max20",
  "openai-plus",
  "openai-pro",
] as const;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const dashboardSearchSchema = z.object({
  model: z.enum(MODEL_VALUES).optional(),
  region: z.enum(REGION_VALUES).optional(),
  harness: z
    .enum(HARNESS_VALUES)
    .default("claude-code")
    .transform((value) => (value === "cc" ? "claude-code" : value)),
  tier: z.enum(TIER_VALUES).optional(),
  provider: z.enum(PROVIDER_VALUES).optional(),
  plan: z.enum(PLAN_VALUES).optional(),
  limit_type: z.enum(["5h", "weekly"]).default("5h"),
  window: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  primary: z.enum(["p10", "p25", "p50", "p75", "p90"]).default("p50"),
  envelope: z.enum(["off", "neighbors", "wide"]).default("neighbors"),
  brush_start: z.number().min(0).max(1).default(0),
  brush_end: z.number().min(0).max(1).default(1),
  compare: z.boolean().default(false),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: DashboardPage,
  head: () => routeHead("/dashboard"),
});

function DashboardPage() {
  const search = Route.useSearch();
  const status = useStatus();
  const {
    data,
    compareData,
    meta,
    loading,
    error,
    bucketsLoaded,
    bucketsTotal,
  } = useChartData(search);
  const delayedLoading = useDelayedLoading(loading);
  const statusNotice = status.data ? statusNoticeFor(status.data) : null;
  const chartData = primaryChartData(data, compareData);
  const hasChartData = search.compare
    ? compareDataHasValues(compareData)
    : alignedDataHasValues(data);
  const bucketPartial =
    !loading && bucketsLoaded > 0 && bucketsLoaded < bucketsTotal;
  const brush = useMemo(
    () => ({ start: search.brush_start, end: search.brush_end }),
    [search.brush_start, search.brush_end],
  );
  const brushedData = useMemo(
    () => sliceByBrush(chartData, brush),
    [chartData, brush],
  );
  const brushedMeta = useMemo(
    () => sliceMetaByBrush(meta ?? undefined, chartData[0]?.length ?? 0, brush),
    [meta, chartData, brush],
  );
  const kpis = useMemo(
    () => computeKpis(brushedData, brushedMeta),
    [brushedData, brushedMeta],
  );
  const compareModeProp = useMemo(
    () =>
      search.compare && compareData ? { tiers: compareData } : undefined,
    [search.compare, compareData],
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
            Tokens to rate limit · {limitTypeLabel(search.limit_type)}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Where your tier's limits actually fire. Pick Pro, Max5, or Max20
            for the live percentile envelope, or toggle Compare for
            tier-to-tier drift. Cells with fewer than 5 contributors are
            suppressed for anonymity.
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
        <div className="border-b border-border/60 px-5 py-4">
          <Filters />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              Token burn · {windowLabel(search.window)}
            </div>
            <div className="font-mono text-[11.5px] text-muted-foreground">
              {resolutionLabel(search.window)} bins · k ≥ 5 cells only ·{" "}
              {kpis.submissionsLabel} submissions
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PercentilePicker />
            <EnvelopeToggle />
            <TierToggle />
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
            brush={brush}
            bucketPartial={bucketPartial}
            chartData={chartData}
            compareMode={compareModeProp}
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

// Cohort panels are pinned to the latest h1 bucket — they answer "what does
// the typical user look like right now", not "what did this slice of the
// timeline look like". The brush only shapes the chart and KPIs; cohort
// composition stays globally current so panels still mean something when
// the user zooms into a sparse window.
function CohortPanels({ search }: { search: DashboardSearch }) {
  const manifest = useManifest();
  const latestPath = manifest.data?.tiers.h1.at(-1);
  const bucketQuery = useBucket("h1", latestPath ?? "");
  const bucket = latestPath ? bucketQuery.data : undefined;

  const cell = useMemo(
    () =>
      bucket
        ? pickCellFromBucket(bucket, {
            tier: search.tier ?? "max20",
            harness: search.harness,
            region: search.region ?? "NA",
            limit_type: search.limit_type,
          })
        : null,
    [bucket, search.tier, search.harness, search.region, search.limit_type],
  );
  const filterCell = useMemo(
    () => ({
      harness: search.harness,
      limit_type: search.limit_type,
      region: search.region,
    }),
    [search.harness, search.limit_type, search.region],
  );

  if (!bucket || !cell) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
      <BreakdownTable cell={cell} primary={search.primary} />
      <TokenMixPanel cell={cell} primary={search.primary} />
      <CostEquivalentPanel
        bucket={bucket}
        primary={search.primary}
        filterCell={filterCell}
      />
    </div>
  );
}

function pickCellFromBucket(
  bucket: BucketEnvelope,
  match: Partial<Pick<BucketCell, "tier" | "harness" | "region" | "limit_type">>,
): BucketCell | null {
  return (
    bucket.cells.find(
      (cell) =>
        (match.tier == null || cell.tier === match.tier) &&
        (match.harness == null || cell.harness === match.harness) &&
        (match.region == null || cell.region === match.region) &&
        (match.limit_type == null || cell.limit_type === match.limit_type) &&
        !cell.insufficient_data,
    ) ??
    bucket.cells.find((cell) => !cell.insufficient_data) ??
    null
  );
}

interface ChartAreaProps {
  brush: { start: number; end: number };
  bucketPartial: boolean;
  chartData: AlignedData;
  compareMode: { tiers: { tier: TierName; data: AlignedData }[] } | undefined;
  delayedLoading: boolean;
  error: Error | null;
  hasChartData: boolean;
  meta: ChartMeta | null;
  search: DashboardSearch;
}

function ChartArea({
  brush,
  bucketPartial,
  chartData,
  compareMode,
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
      <Skeleton aria-label="Loading aggregates..." className="h-[360px] w-full" />
    );
  }

  if (!search.tier && !search.compare) {
    return (
      <EmptyState
        heading="Pick a tier"
        subhead="Start with your own — Pro, Max5, or Max20. Or toggle Compare to see all three side-by-side and spot tier-to-tier drift."
      />
    );
  }

  if (!hasChartData) {
    return (
      <EmptyState
        heading="Not enough data yet"
        subhead="Fewer than 5 contributors in this slice, so percentiles are suppressed for anonymity. Widen the window, drop a filter, or check back tomorrow — the next aggregate runs at 03:00 UTC."
      />
    );
  }

  return (
    <div className="space-y-4">
      {bucketPartial ? (
        <div
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-semibold">One time slice didn't load</p>
          <p className="text-muted-foreground">
            Refreshing usually fixes this. The rest of the chart is up to date.
          </p>
        </div>
      ) : null}

      <Chart
        ariaLabel={chartAriaLabel(search)}
        primary={search.primary}
        envelope={search.envelope}
        compareMode={compareMode}
        data={chartData}
        brush={brush}
        meta={meta ?? undefined}
      />

      <Brush
        data={chartData}
        start={search.brush_start}
        end={search.brush_end}
      />

      <ChartLegend
        primary={search.primary}
        envelope={search.envelope}
        compare={search.compare}
      />

      <details className="group rounded-xl border border-border bg-[var(--bg-1)]/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--bg-1)]">
          Show percentile values per timestamp
        </summary>
        <div className="border-t border-border px-4 py-3">
          <DataTable
            ariaLabel="Percentile values per timestamp"
            rows={alignedDataToRows(chartData)}
          />
        </div>
      </details>
    </div>
  );
}

function KpiRow({ kpis, hasData }: { kpis: ComputedKpis; hasData: boolean }) {
  const items = [
    {
      label: "Median p50",
      value: hasData ? formatTokens(kpis.medianP50) : "—",
      sub: hasData
        ? `peak ${formatTokens(kpis.peak)} at slot ${kpis.peakIdx}`
        : "no contributors",
    },
    {
      label: "p50 change",
      value: hasData ? formatDriftPct(kpis.driftPct) : "—",
      sub:
        hasData && kpis.driftPct !== null
          ? "second half vs first half of window"
          : "needs ≥ 4 buckets",
    },
    {
      label: "p25 — p75 spread",
      value: hasData ? formatTokens(kpis.iqr) : "—",
      sub: hasData ? "interquartile range" : "—",
    },
    {
      label: "p10 — p90 spread",
      value: hasData ? formatTokens(kpis.outerSpread) : "—",
      sub: hasData ? "outer envelope" : "—",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
  primary,
  envelope,
  compare,
}: {
  primary: DashboardSearch["primary"];
  envelope: DashboardSearch["envelope"];
  compare: boolean;
}) {
  if (compare) {
    return (
      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
        {(["pro", "max5", "max20"] as const).map((tier) => (
          <LegendDot
            color={TIER_COLOR_VAR[tier]}
            dash={TIER_DASH[tier]?.join(" ")}
            key={tier}
            label={tier}
          />
        ))}
      </div>
    );
  }

  const [lo, hi] = neighborBand(primary);

  return (
    <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <span
          className="block h-[2px] w-4 rounded"
          style={{ background: "var(--chart-1)" }}
        />
        {primary} line
      </span>
      {envelope === "neighbors" ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="block h-2 w-3.5 rounded-sm"
            style={{ background: "color-mix(in oklch, var(--chart-1) 32%, transparent)" }}
          />
          {lo} — {hi}
        </span>
      ) : null}
      {envelope === "wide" ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="block h-2 w-3.5 rounded-sm"
            style={{ background: "color-mix(in oklch, var(--chart-1) 14%, transparent)" }}
          />
          p10 — p90
        </span>
      ) : null}
    </div>
  );
}

function LegendDot({
  color,
  dash,
  label,
}: {
  color: string;
  dash?: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg height="6" width="22">
        <line
          stroke={color}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeWidth="2"
          x1="0"
          x2="22"
          y1="3"
          y2="3"
        />
      </svg>
      <span className="font-mono">{label}</span>
    </span>
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
  if (p50.length < 4) return null;

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

export function limitTypeLabel(limitType: DashboardSearch["limit_type"]): string {
  return limitType === "5h" ? "5-hour limit" : "Weekly limit";
}

function windowLabel(window: DashboardSearch["window"]): string {
  return ({
    "24h": "last 24h",
    "7d": "last 7d",
    "30d": "last 30d",
    "90d": "last 90d",
  } as const)[window];
}

function resolutionLabel(window: DashboardSearch["window"]): string {
  return ({
    "24h": "15 min",
    "7d": "1 hour",
    "30d": "1 day",
    "90d": "1 week",
  } as const)[window];
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

function primaryChartData(
  data: AlignedData | null,
  compareData: { data: AlignedData }[] | null,
): AlignedData {
  if (data) {
    return data;
  }

  return (
    compareData?.find(({ data: tierData }) => alignedDataHasValues(tierData))
      ?.data ??
    compareData?.[0]?.data ??
    EMPTY_ALIGNED_DATA
  );
}

function compareDataHasValues(
  compareData: { data: AlignedData }[] | null,
): boolean {
  return compareData?.some(({ data }) => alignedDataHasValues(data)) ?? false;
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
  if (search.compare) {
    return `Compare tiers for ${limitTypeLabel(search.limit_type)}`;
  }

  return `${search.tier ?? "selected tier"} ${limitTypeLabel(
    search.limit_type,
  )} percentiles`;
}

function formatRelative(timestamp: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}
