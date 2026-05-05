import type { Model } from "@web/Model";

import { MODEL_COLOR, TONE_VAR, type Tone } from "@/lib/model-catalog";
import { formatTokens } from "@/lib/format";
import type { BucketCell } from "@/lib/r2";

interface BreakdownTableProps {
  cell: BucketCell;
}

export function BreakdownTable({ cell }: BreakdownTableProps) {
  const totalTokens = Math.max(
    1,
    cell.typical_mix.reduce((sum, m) => sum + tokenTotal(m.tokens), 0),
  );
  const rows = [...cell.typical_mix]
    .sort((a, b) => tokenTotal(b.tokens) - tokenTotal(a.tokens))
    .map((m) => {
      const total = tokenTotal(m.tokens);
      return {
        model: m.model as Model,
        share: total / totalTokens,
        total,
        cached: m.tokens.cached_read + m.tokens.cached_write,
      };
    });

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">By model · current filters</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            average retained submission · model share by token volume
          </div>
        </div>
      </div>
      <div className="px-2 pb-3">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border w-[36%]">Model</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">Share</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">Avg tokens</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">Cached</th>
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
                  {formatTokens(row.total)}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-muted-foreground border-b border-border/60">
                  {formatTokens(row.cached)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tokenTotal(tokens: BucketCell["typical_mix"][number]["tokens"]): number {
  return tokens.input + tokens.output + tokens.cached_read + tokens.cached_write;
}

function ColorDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: TONE_VAR[tone] }}
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
