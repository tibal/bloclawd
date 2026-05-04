import type { Tier } from "@web/Tier";

import { TIER_PRICE_USD } from "@/lib/model-catalog";
import type { BucketCell, BucketEnvelope, Percentiles } from "@/lib/r2";

interface CostEquivalentPanelProps {
  bucket: BucketEnvelope;
  primary: keyof Percentiles;
  // Filters used to scope which cell variant we read from for each tier.
  filterCell: Pick<BucketCell, "harness" | "limit_type"> & {
    region?: string;
  };
}

const TIERS: readonly Tier[] = ["pro", "max5", "max20"];

// Anchor model price (Opus 4.7 output). Used to convert anchor-token-equivalent
// "unified cost" back into USD.
const ANCHOR_USD_PER_TOKEN = 25e-6;

// Each tier window count per month (5h windows = roughly 6/day x 30; weekly
// limit = 4/month). The dollar figure shown is the per-window slice of the
// monthly tier price.
const WINDOWS_PER_MONTH: Record<"5h" | "weekly", number> = {
  "5h": 30 * 24 / 5, // 144 windows/mo
  weekly: 4,
};

export function CostEquivalentPanel({
  bucket,
  primary,
  filterCell,
}: CostEquivalentPanelProps) {
  const limitType = filterCell.limit_type;
  const subscriptionPerWindow = (tier: Tier) =>
    TIER_PRICE_USD[tier] / WINDOWS_PER_MONTH[limitType];

  const rows = TIERS.map((tier) => {
    const cell = bucket.cells.find(
      (c) =>
        c.tier === tier &&
        c.harness === filterCell.harness &&
        c.limit_type === filterCell.limit_type &&
        (filterCell.region == null || c.region === filterCell.region),
    );
    const enc = cell?.unified_cost ?? null;
    const pcts: Percentiles | null = enc
      ? "Mean" in enc
        ? enc.Mean
        : enc.Bin
      : null;
    const apiUsd = pcts ? pcts[primary] * ANCHOR_USD_PER_TOKEN : null;
    const subUsd = subscriptionPerWindow(tier);
    return {
      tier,
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
            {primary} unified cost · API list-price vs subscription slice
          </div>
        </div>
        <span className="tag">USD</span>
      </div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.tier}>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-foreground">{tierLabel(r.tier)}</span>
              <span className="font-mono tabular-nums text-foreground">
                {r.apiUsd == null ? "—" : `$${r.apiUsd.toFixed(2)}`}
                <span className="ml-2 text-muted-foreground text-[11px]">
                  vs ${r.subUsd.toFixed(2)} / window
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
          A {primary} user with the typical token mix would burn the API list-price equivalent of the {primary} window above.
          {" "}
          <span className="text-muted-foreground">
            Use your own pricing for a real comparison.
          </span>
        </div>
      </div>
    </div>
  );
}

function tierLabel(tier: Tier): string {
  return ({
    pro: "Pro · $20/mo",
    max5: "Max 5x · $100/mo",
    max20: "Max 20x · $200/mo",
  } as const)[tier];
}
