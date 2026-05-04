import type { Model } from "@web/Model";

import { MODEL_COLOR } from "@/lib/model-catalog";
import { formatTokens } from "@/lib/format";
import type { BucketCell, Percentiles } from "@/lib/r2";

interface BreakdownTableProps {
  cell: BucketCell;
  primary: keyof Percentiles;
}

export function BreakdownTable({ cell, primary }: BreakdownTableProps) {
  const totalSubs = Math.max(
    1,
    cell.models.reduce((sum, m) => sum + m.n_with_model, 0),
  );
  const rows = [...cell.models]
    .sort((a, b) => b.n_with_model - a.n_with_model)
    .map((m) => {
      const enc = m.tokens_to_limit_if_only;
      const pcts: Percentiles | null = enc
        ? "Mean" in enc
          ? enc.Mean
          : enc.Bin
        : null;
      return {
        model: m.model as Model,
        share: m.n_with_model / totalSubs,
        primaryValue: pcts?.[primary] ?? null,
        p90: pcts?.p90 ?? null,
      };
    });

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">By model · current filters</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            share of submissions · {primary} tokens-to-limit-if-only · contribution-estimated
          </div>
        </div>
      </div>
      <div className="px-2 pb-3">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border w-[36%]">Model</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">Share</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">{primary} if-only</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">p90</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model}>
                <td className="px-3 py-3 text-foreground border-b border-border/60">
                  <span className="inline-flex items-center gap-2">
                    <ColorDot tone={MODEL_COLOR[row.model]} />
                    <span>{row.model}</span>
                  </span>
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-foreground/80 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <Bar value={row.share} />
                    <span>{Math.round(row.share * 100)}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-foreground/80 border-b border-border/60">
                  {row.primaryValue == null ? "—" : formatTokens(row.primaryValue)}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-muted-foreground border-b border-border/60">
                  {row.p90 == null ? "—" : formatTokens(row.p90)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColorDot({ tone }: { tone: "primary" | "teal" | "amber" | "violet" | "coral" }) {
  const map: Record<string, string> = {
    primary: "var(--brand)",
    teal: "var(--teal)",
    amber: "var(--amber)",
    violet: "var(--violet)",
    coral: "var(--coral)",
  };
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: map[tone] }}
    />
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="relative inline-block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-1)]">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.min(100, value * 100)}%`,
          background: "linear-gradient(90deg, var(--brand-2), var(--brand))",
        }}
      />
    </span>
  );
}
