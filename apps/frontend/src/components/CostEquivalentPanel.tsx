import type { Tier } from "@web/Tier";

import {
  TIER_VALUES,
  limitWindowsPerMonth,
  plansForProvider,
  tierMonthlyCostUsd,
  tierLabel,
  type ResolvedRow,
} from "@/lib/catalog";
import { cellsMatching, percentilesForCells } from "@/lib/cohort";
import { formatUsd } from "@/lib/format";
import type {
  BucketCell,
  Percentiles,
} from "@/lib/r2";

interface CostEquivalentPanelProps {
  cells: readonly BucketCell[];
  filters: ResolvedRow;
  primary: keyof Percentiles;
}

const TIERS: readonly Tier[] = TIER_VALUES;

export function CostEquivalentPanel({
  cells,
  filters,
  primary,
}: CostEquivalentPanelProps) {
  const limitType = filters.limit_type;
  const subscriptionPerWindow = (tier: Tier) =>
    providerTierMonthlyCostUsd(filters, tier) / limitWindowsPerMonth(limitType);

  const rows = TIERS.map((tier) => {
    const pcts = percentilesForCells(
      cellsMatching(cells, { ...filters, tier }),
    );
    const apiUsd = pcts ? pcts[primary] : null;
    const subUsd = subscriptionPerWindow(tier);
    return {
      tier,
      label: providerTierLabel(filters, tier),
      apiUsd,
      subUsd,
      ratio: apiUsd ? apiUsd / Math.max(0.01, subUsd) : 0,
    };
  });

  const maxApi = Math.max(0.01, ...rows.map((r) => r.apiUsd ?? 0));

  return (
    <div className="surface-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">
            Cost-equivalent per window
          </div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {primary} API list-price · retained submissions
          </div>
        </div>
        <span className="tag">USD</span>
      </div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.tier}>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-foreground">{r.label}</span>
              <span className="font-mono tabular-nums text-foreground">
                {r.apiUsd == null ? "—" : formatUsd(r.apiUsd)}
                <span className="ml-2 text-muted-foreground text-[11px]">
                  vs {formatUsd(r.subUsd)} / window
                </span>
              </span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-[var(--bg-1)] overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, ((r.apiUsd ?? 0) / maxApi) * 100)}%`,
                  background: r.ratio > 1
                    ? "linear-gradient(90deg, oklch(0.74 0.16 145), oklch(0.78 0.14 175))"
                    : "linear-gradient(90deg, var(--brand-2), var(--brand))",
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {r.apiUsd == null
                ? "no data yet"
                : r.ratio > 1
                ? `~${(r.ratio).toFixed(1)}× API value vs subscription slice`
                : `~${Math.round(r.ratio * 100)}% of subscription slice spent`}
            </div>
          </div>
        ))}
        <div className="rounded-xl bg-[var(--bg-1)] px-3.5 py-2.5 text-[12px] leading-6 text-foreground/80">
          The {primary} cost is computed directly from model and token-type API
          prices, after outlier trimming.{" "}
          <span className="text-muted-foreground">
            Use your own pricing for a real comparison.
          </span>
        </div>
      </div>
    </div>
  );
}

function providerTierLabel(filters: ResolvedRow, tier: Tier): string {
  const plan = providerTierPlan(filters, tier);
  return plan?.display_name ?? tierLabel(tier);
}

function providerTierMonthlyCostUsd(filters: ResolvedRow, tier: Tier): number {
  const plan = providerTierPlan(filters, tier);
  return plan?.monthly_cost_usd ?? tierMonthlyCostUsd(tier);
}

function providerTierPlan(filters: ResolvedRow, tier: Tier) {
  const providerPlans = plansForProvider(filters.provider).filter(
    (plan) =>
      plan.harnesses.includes(filters.harness) &&
      plan.limit_types.includes(filters.limit_type),
  );
  const direct = providerPlans.find((plan) => plan.tier_alias === tier);
  if (direct) return direct;

  // `Tier` is a provider-neutral price bucket on the wire. Some providers do
  // not expose a catalog `tier_alias` yet, so pair their plans by the same
  // monthly price bucket before falling back to the primary tier label.
  const targetMonthlyCost = tierMonthlyCostUsd(tier);
  return providerPlans.find(
    (plan) => plan.monthly_cost_usd === targetMonthlyCost,
  );
}
