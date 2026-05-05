import { useMemo } from "react";

import {
  TOKEN_MIX_FIELD_COLOR,
  TOKEN_MIX_FIELD_LABEL,
  TOKEN_MIX_FIELD_VALUES,
  TONE_GRADIENT,
  TONE_VAR,
  type Tone,
} from "@/lib/model-catalog";
import { formatTokens } from "@/lib/format";
import type { AggregatedCohortCell } from "@/lib/cohort";

interface TokenMixPanelProps {
  cell: Pick<AggregatedCohortCell, "typical_mix" | "cell_count">;
}

export function TokenMixPanel({ cell }: TokenMixPanelProps) {
  const { totals, sumPrimary } = useMemo(() => {
    const mix = cell.typical_mix;
    const aggregated = TOKEN_MIX_FIELD_VALUES.map((field) => {
      let value = 0;
      for (const entry of mix) {
        value += entry.tokens[field];
      }
      return { field, value };
    }).filter((entry) => entry.value > 0);
    const sum = Math.max(
      0.0001,
      aggregated.reduce((s, t) => s + t.value, 0),
    );
    return { totals: aggregated, sumPrimary: sum };
  }, [cell]);

  return (
    <div className="surface-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">Typical token mix</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            average retained submission · raw provider token fields
          </div>
        </div>
        <span className="tag">{cell.cell_count} cell{cell.cell_count === 1 ? "" : "s"}</span>
      </div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <StackedBar entries={totals.map((t) => ({
          color: TOKEN_MIX_FIELD_COLOR[t.field],
          weight: t.value / sumPrimary,
        }))} />

        <div className="flex flex-col gap-3">
          {totals.map((t) => {
            const sharePct = (t.value / sumPrimary) * 100;
            return (
              <div key={t.field}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className={`tag dot ${TOKEN_MIX_FIELD_COLOR[t.field]}`}>
                    {TOKEN_MIX_FIELD_LABEL[t.field]}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    {sharePct.toFixed(0)}%
                    <span className="ml-2 text-muted-foreground text-[11px]">
                      {formatTokens(t.value)}
                    </span>
                  </span>
                </div>
                <ShareTrack
                  value={sharePct}
                  tone={TOKEN_MIX_FIELD_COLOR[t.field]}
                />
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
  entries: { color: Tone; weight: number }[];
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

function ShareTrack({ value, tone }: { value: number; tone: Tone }) {
  const color = TONE_VAR[tone];
  return (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-[var(--bg-1)]">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.min(100, value)}%`,
          background: color,
        }}
      />
    </div>
  );
}
