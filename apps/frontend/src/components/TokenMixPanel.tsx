import type { TokenType } from "@web/TokenType";

import {
  TOKEN_TYPE_COLOR,
  TOKEN_TYPE_LABEL,
} from "@/lib/model-catalog";
import type { BucketCell, Percentiles } from "@/lib/r2";

const TOKEN_TYPES: readonly TokenType[] = [
  "output",
  "input",
  "cached_read",
  "cached_write",
];

interface TokenMixPanelProps {
  cell: BucketCell;
  primary: keyof Percentiles;
}

export function TokenMixPanel({ cell, primary }: TokenMixPanelProps) {
  const mix = cell.representative_mix ?? [];

  // Aggregate share by token type across models. We surface the picked
  // percentile as the headline number; p10–p90 spread shown as a track
  // beneath each row.
  const totals = TOKEN_TYPES.map((tt) => {
    let p10 = 0, pPrimary = 0, p90 = 0;
    for (const entry of mix) {
      if (entry.token_type !== tt) continue;
      const e = entry.share;
      const pcts: Percentiles = "Mean" in e ? e.Mean : e.Bin;
      p10 += pcts.p10;
      pPrimary += pcts[primary];
      p90 += pcts.p90;
    }
    return { tokenType: tt, p10, pPrimary, p90 };
  });

  const sumPrimary = Math.max(0.0001, totals.reduce((s, t) => s + t.pPrimary, 0));

  return (
    <div className="surface-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">Typical token mix</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {primary} · current filters · share of total spend
          </div>
        </div>
        <span className="tag">cohort</span>
      </div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <StackedBar entries={totals.map((t) => ({
          color: TOKEN_TYPE_COLOR[t.tokenType],
          weight: t.pPrimary / sumPrimary,
        }))} />

        <div className="flex flex-col gap-3">
          {totals.map((t) => {
            const sharePct = (t.pPrimary / sumPrimary) * 100;
            const lo = (t.p10 / sumPrimary) * 100;
            const hi = (t.p90 / sumPrimary) * 100;
            return (
              <div key={t.tokenType}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className={`tag dot ${TOKEN_TYPE_COLOR[t.tokenType]}`}>
                    {TOKEN_TYPE_LABEL[t.tokenType]}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    {sharePct.toFixed(0)}%
                    <span className="ml-2 text-muted-foreground text-[11px]">
                      p10 {lo.toFixed(0)}% · p90 {hi.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <SpreadTrack lo={lo} primary={sharePct} hi={hi} tone={TOKEN_TYPE_COLOR[t.tokenType]} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StackedBar({
  entries,
}: {
  entries: { color: keyof typeof TONE_GRADIENT; weight: number }[];
}) {
  return (
    <div className="flex h-7 overflow-hidden rounded-md">
      {entries.map((e, i) => (
        <span
          key={i}
          style={{ width: `${e.weight * 100}%`, background: TONE_GRADIENT[e.color] }}
        />
      ))}
    </div>
  );
}

function SpreadTrack({
  lo,
  primary,
  hi,
  tone,
}: {
  lo: number;
  primary: number;
  hi: number;
  tone: keyof typeof TONE_VAR;
}) {
  const max = Math.max(hi, primary, 1);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const color = TONE_VAR[tone];
  return (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-[var(--bg-1)]">
      <span
        className="absolute inset-y-0 rounded-full opacity-40"
        style={{
          left: pct(lo),
          width: `calc(${pct(hi)} - ${pct(lo)})`,
          background: color,
        }}
      />
      <span
        className="absolute inset-y-0 w-[2px] rounded"
        style={{ left: pct(primary), background: color }}
      />
    </div>
  );
}

const TONE_GRADIENT: Record<
  "primary" | "teal" | "amber" | "violet" | "coral",
  string
> = {
  primary: "linear-gradient(180deg, var(--brand), var(--brand-2))",
  teal: "linear-gradient(180deg, oklch(0.78 0.14 175), oklch(0.62 0.14 175))",
  amber: "linear-gradient(180deg, oklch(0.82 0.13 75), oklch(0.7 0.13 75))",
  violet: "linear-gradient(180deg, oklch(0.72 0.18 295), oklch(0.6 0.18 295))",
  coral: "linear-gradient(180deg, oklch(0.74 0.17 30), oklch(0.6 0.17 30))",
};

const TONE_VAR: Record<
  "primary" | "teal" | "amber" | "violet" | "coral",
  string
> = {
  primary: "var(--brand)",
  teal: "var(--teal)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  coral: "var(--coral)",
};
