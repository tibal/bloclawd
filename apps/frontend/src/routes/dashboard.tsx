import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import type uPlot from "uplot";
import { z } from "zod";

import { BandToggle } from "@/components/BandToggle";
import { Chart } from "@/components/Chart";
import { Chrome } from "@/components/Chrome";
import { DataTable, type DataTableRow } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Filters } from "@/components/Filters";
import { TierToggle } from "@/components/TierToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartData, useDelayedLoading } from "@/lib/dashboard-data";
import { isR2NotFound, useStatus, type StatusJson } from "@/lib/r2";
import {
  PERCENTILE_INDEX,
  TIER_COLOR_VAR,
  TIER_DASH,
  type TierName,
} from "@/lib/chart-tokens";
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
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const EMPTY_DATA: uPlot.AlignedData = [[], [], [], [], [], []];

export const dashboardSearchSchema = z.object({
  model: z.enum(MODEL_VALUES).optional(),
  region: z.enum(REGION_VALUES).optional(),
  harness: z
    .enum(HARNESS_VALUES)
    .default("claude-code")
    .transform((value) => (value === "cc" ? "claude-code" : value)),
  tier: z.enum(TIER_VALUES).optional(),
  limit_type: z.enum(["5h", "weekly"]).default("5h"),
  window: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  bands: z.enum(["p25-p75", "p10-p90"]).default("p25-p75"),
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
  const { data, compareData, loading, error, bucketsLoaded, bucketsTotal } =
    useChartData(search);
  const delayedLoading = useDelayedLoading(loading);
  const statusNotice = status.data ? statusNoticeFor(status.data) : null;
  const chartData = primaryChartData(data, compareData);
  const hasChartData = search.compare
    ? compareDataHasValues(compareData)
    : alignedDataHasValues(data);
  const bucketPartial =
    !loading && bucketsLoaded > 0 && bucketsLoaded < bucketsTotal;
  const kpis = useMemo(() => computeKpis(chartData), [chartData]);
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
            <BandToggle />
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
            bucketPartial={bucketPartial}
            chartData={chartData}
            compareMode={compareModeProp}
            delayedLoading={delayedLoading}
            error={error}
            hasChartData={hasChartData}
            search={search}
          />
        </div>
      </div>
    </section>
  );
}

interface ChartAreaProps {
  bucketPartial: boolean;
  chartData: uPlot.AlignedData;
  compareMode: { tiers: { tier: TierName; data: uPlot.AlignedData }[] } | undefined;
  delayedLoading: boolean;
  error: Error | null;
  hasChartData: boolean;
  search: DashboardSearch;
}

function ChartArea({
  bucketPartial,
  chartData,
  compareMode,
  delayedLoading,
  error,
  hasChartData,
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
        bands={{ mode: search.bands }}
        compareMode={compareMode}
        data={chartData}
      />

      <ChartLegend mode={search.bands} compare={search.compare} />

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
      label: "p25 — p75 spread",
      value: hasData ? formatTokens(kpis.iqr) : "—",
      sub: hasData ? "interquartile range" : "—",
    },
    {
      label: "p10 — p90 spread",
      value: hasData ? formatTokens(kpis.outerSpread) : "—",
      sub: hasData ? "outer envelope" : "—",
    },
    {
      label: "Submissions",
      value: kpis.submissionsLabel,
      sub: "k-anonymized · n ≥ 5",
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
  mode,
  compare,
}: {
  mode: DashboardSearch["bands"];
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

  return (
    <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <span
          className="block h-[2px] w-4 rounded"
          style={{ background: "var(--chart-1)" }}
        />
        p50 median
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          className="block h-2 w-3.5 rounded-sm"
          style={{ background: "color-mix(in oklch, var(--chart-1) 32%, transparent)" }}
        />
        p25 — p75
      </span>
      {mode === "p10-p90" ? (
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
}

function computeKpis(data: uPlot.AlignedData): ComputedKpis {
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

  return {
    medianP50: median,
    peak,
    peakIdx: peakIdx === -1 ? 0 : peakIdx,
    iqr,
    outerSpread,
    submissionsLabel: p50.length > 0 ? `${p50.length}` : "0",
  };
}

function numericArray(values: uPlot.AlignedData[number] | undefined): number[] {
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
  data: uPlot.AlignedData | null,
  compareData: { data: uPlot.AlignedData }[] | null,
): uPlot.AlignedData {
  if (data) {
    return data;
  }

  return (
    compareData?.find(({ data: tierData }) => alignedDataHasValues(tierData))
      ?.data ??
    compareData?.[0]?.data ??
    EMPTY_DATA
  );
}

function compareDataHasValues(
  compareData: { data: uPlot.AlignedData }[] | null,
): boolean {
  return compareData?.some(({ data }) => alignedDataHasValues(data)) ?? false;
}

function alignedDataHasValues(data: uPlot.AlignedData | null): boolean {
  if (!data) {
    return false;
  }

  return Array.from(data[PERCENTILE_INDEX.p50] ?? []).some(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
}

function alignedDataToRows(data: uPlot.AlignedData): DataTableRow[] {
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
