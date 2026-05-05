import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";

import { Chart } from "@/components/Chart";
import { Chrome } from "@/components/Chrome";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TIER_COLOR_VAR, TIER_DASH } from "@/lib/chart-tokens";
import {
  LIMIT_TYPE_VALUES,
  TIER_VALUES,
  tierDisplayName,
  tierMonthlyCostUsd,
} from "@/lib/catalog";
import {
  useChartData,
  useDelayedLoading,
} from "@/lib/dashboard-data";
import { isR2NotFound } from "@/lib/r2";
import { routeHead } from "@/lib/route-head";
import type { DashboardSearch } from "@/routes/dashboard";

const compareSearchSchema = z.object({
  limit_type: z.enum(LIMIT_TYPE_VALUES).default("5h"),
  window: z.enum(["24h", "7d", "30d", "90d"]).default("30d"),
});

type CompareSearch = z.infer<typeof compareSearchSchema>;

export const Route = createFileRoute("/compare")({
  validateSearch: (search) => compareSearchSchema.parse(search),
  component: ComparePage,
  head: () => routeHead("/compare"),
});

const TIER_BLURB = {
  pro: "Entry-tier individual plan. The most-bonked tier in the dataset — small 5-hour budget, frequent walls.",
  max5: "5× the Pro budget. Power users typically land here when Pro starts firing daily limits during pair-programming sessions.",
  max20:
    "20× the Pro budget. Still bonkable on long agentic runs — and the tier where users most often suspect silent throttling.",
} as const;

const TIERS = TIER_VALUES.map((id) => ({
  id,
  name: tierDisplayName(id),
  price: `$${tierMonthlyCostUsd(id)} / mo`,
  blurb: TIER_BLURB[id],
}));

const FAQ = [
  {
    q: "Does $200/mo Max20 really give you 20× the headroom of Pro?",
    a: "Compare the p50 envelope side-by-side over a 30-day window above. The relationship between sticker-price ratio and observed headroom is rarely linear — and it shifts week to week.",
  },
  {
    q: "Why does my tier look tighter than the cohort?",
    a: "Either you've hit a heavier model mix, or you may be in a cohort the provider is silently A/B testing. The drift chart shows shifts before any official changelog mentions them.",
  },
  {
    q: "How is API-equivalent cost defined across tiers?",
    a: "Each submission is priced with the published API price for its model and token type. The chart shows p10 through p90 after trimming submissions outside plus or minus 2σ of that cohort's mean.",
  },
  {
    q: "Why are some cells suppressed?",
    a: "Any cell with fewer than 5 distinct contributors is suppressed for anonymity. Widen the window or relax a filter if you see gaps.",
  },
];

function ComparePage() {
  const search = Route.useSearch();
  const dashboardFilters = useMemo<DashboardSearch>(
    () => ({
      harness: "claude-code",
      limit_type: search.limit_type,
      window: search.window,
      primary: "p50",
      envelope: "neighbors",
      brush_start: 0,
      brush_end: 1,
      compare: true,
    }),
    [search.limit_type, search.window],
  );
  const { compareData, loading, error } = useChartData(dashboardFilters);
  const delayedLoading = useDelayedLoading(loading);
  const compareModeProp = useMemo(
    () => (compareData ? { tiers: compareData } : undefined),
    [compareData],
  );
  const fallbackChartData = compareData?.[0]?.data ?? [[], [], [], [], [], []];

  return (
    <section className="space-y-12 py-4">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tag dot">tier comparison</span>
          <span className="tag">live · public dataset</span>
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          Pro vs Max5 vs Max20: where each tier's limits actually fire
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Side-by-side percentile envelope of API-equivalent cost before
          Claude Code and Codex rate limits trigger, broken down by
          subscription tier. Built from real bonks submitted by real users —
          anonymously, one CLI command at a time.
        </p>
        <Chrome />
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <article
            className="surface-card flex flex-col gap-2 p-5"
            key={tier.id}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {tier.name}
              </h2>
              <span className="font-mono text-sm text-muted-foreground">
                {tier.price}
              </span>
            </div>
            <span
              aria-hidden
              className="block h-[2px] w-10 rounded"
              style={{ background: `var(${TIER_COLOR_VAR[tier.id]})` }}
            />
            <p className="text-sm leading-6 text-muted-foreground">
              {tier.blurb}
            </p>
          </article>
        ))}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            <div className="text-sm font-medium text-foreground">
              API cost · {windowLabel(search.window)} ·{" "}
              {limitTypeLabel(search.limit_type)}
            </div>
            <div className="font-mono text-[11.5px] text-muted-foreground">
              p25–p75 envelope · k ≥ 5 cells only · all three tiers overlaid
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
            {TIER_VALUES.map((tier) => (
              <span className="inline-flex items-center gap-2" key={tier}>
                <svg height="6" width="22">
                  <line
                    stroke={`var(${TIER_COLOR_VAR[tier]})`}
                    strokeDasharray={TIER_DASH[tier]?.join(" ")}
                    strokeLinecap="round"
                    strokeWidth="2"
                    x1="0"
                    x2="22"
                    y1="3"
                    y2="3"
                  />
                </svg>
                <span className="font-mono">{tier}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="px-5 py-5">
          {error ? (
            isR2NotFound(error) ? (
              <EmptyState
                heading="No public data published yet"
                subhead="The first daily aggregation runs at 03:00 UTC. Check back tomorrow."
              />
            ) : (
              <EmptyState
                heading="We can't reach the public data right now"
                subhead="data.bloclawd.com may be having a hiccup. Refresh in a minute."
              />
            )
          ) : delayedLoading ? (
            <Skeleton
              aria-label="Loading tier comparison..."
              className="h-[360px] w-full"
            />
          ) : (
            <Chart
              ariaLabel="Compare Pro, Max5, and Max20 percentile envelopes"
              envelope="neighbors"
              compareMode={compareModeProp}
              data={fallbackChartData}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Want to filter by harness, region, or model? Drop a tier from the
            view? Open the full dashboard.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="/dashboard?compare=true">Open with full controls</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/install">Add your own bonk</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          How to read this
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="surface-card p-5">
            <h3 className="mb-1.5 text-base font-semibold text-foreground">
              The line is the median
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Each tier's solid line is the p50 API-equivalent cost before a
              rate-limit hit. The shaded band is the p25–p75 spread.
            </p>
          </article>
          <article className="surface-card p-5">
            <h3 className="mb-1.5 text-base font-semibold text-foreground">
              Drift is the story
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              A 30-day window surfaces tightening or loosening over time.
              When one tier's envelope shifts faster than its peers, that's
              a signal worth investigating — even if no changelog admits it.
            </p>
          </article>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          FAQ
        </h2>
        <div className="space-y-3">
          {FAQ.map((entry) => (
            <details
              className="group surface-card overflow-hidden"
              key={entry.q}
            >
              <summary className="cursor-pointer list-none px-5 py-4 text-base font-medium text-foreground">
                {entry.q}
              </summary>
              <div className="border-t border-border/60 px-5 py-4 text-sm leading-6 text-muted-foreground">
                {entry.a}
              </div>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}

function limitTypeLabel(limitType: CompareSearch["limit_type"]): string {
  return limitType === "5h" ? "5-hour limit" : "weekly limit";
}

function windowLabel(window: CompareSearch["window"]): string {
  return ({
    "24h": "last 24h",
    "7d": "last 7d",
    "30d": "last 30d",
    "90d": "last 90d",
  } as const)[window];
}
