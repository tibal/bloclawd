import { createFileRoute } from "@tanstack/react-router";
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

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="space-y-2">
        <Chrome />
        {statusNotice?.kind === "degraded" ? (
          <p className="text-sm text-warning">
            Ingest degraded. Latest completed public data is still shown.
          </p>
        ) : null}
      </section>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold leading-tight">
          Tokens to rate limit · {limitTypeLabel(search.limit_type)}
        </h1>
      </header>

      <Filters />

      <div className="flex flex-wrap items-center gap-3">
        <BandToggle />
        <TierToggle />
      </div>

      {statusNotice?.kind === "stale" ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">Public data is stale</p>
          <p className="text-muted-foreground">
            Last update: {statusNotice.relative}.
          </p>
        </div>
      ) : null}

      {error ? (
        isR2NotFound(error) ? (
          <EmptyState
            heading="No public data published yet"
            subhead="The first daily aggregation runs at 03:00 UTC. Check the methodology page to see what will be published."
          />
        ) : (
          <EmptyState
            heading="We can't reach the public data right now"
            subhead="data.bloclawd.com may be having a hiccup. Refresh in a minute, or check the methodology page for what to expect."
          />
        )
      ) : delayedLoading ? (
        <Skeleton
          aria-label="Loading aggregates..."
          className="h-[360px] w-full"
        />
      ) : !search.tier && !search.compare ? (
        <EmptyState
          heading="Pick a tier"
          subhead="Choose Pro / Max5 / Max20 above, or toggle Compare tiers to see all three."
        />
      ) : !hasChartData ? (
        <EmptyState
          heading="Not enough data yet"
          subhead="Every cell in this view has fewer than 5 contributors, so percentiles are suppressed for anonymity. Try widening the window or relaxing a filter - or check back after the next daily aggregation."
        />
      ) : (
        <section className="space-y-4">
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

          <div className="relative">
            {statusNotice?.kind === "stale" ? (
              <div className="absolute right-3 top-3 z-10 rounded-md border bg-background/90 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                Stale public data
              </div>
            ) : null}
            <Chart
              ariaLabel={chartAriaLabel(search)}
              bands={{ mode: search.bands }}
              compareMode={
                search.compare && compareData
                  ? { tiers: compareData }
                  : undefined
              }
              data={chartData}
            />
          </div>

          <DataTable
            ariaLabel="Percentile values per timestamp"
            rows={alignedDataToRows(chartData)}
          />
        </section>
      )}
    </main>
  );
}

export function limitTypeLabel(limitType: DashboardSearch["limit_type"]): string {
  return limitType === "5h" ? "5-hour limit" : "Weekly limit";
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

  return Array.from(data[3] ?? []).some(
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
