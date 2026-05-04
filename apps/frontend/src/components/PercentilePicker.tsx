import { useCallback } from "react";

import type { Percentiles } from "@/lib/r2";
import { Route } from "@/routes/dashboard";

export type PercentileKey = keyof Percentiles;

const ORDER: readonly PercentileKey[] = ["p10", "p25", "p50", "p75", "p90"];

export function PercentilePicker() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const onPick = useCallback(
    (next: PercentileKey) => {
      void navigate({
        search: (prev) => ({ ...prev, primary: next }),
      });
    },
    [navigate],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Pick the percentile to highlight"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-[var(--bg-1)] p-[3px]"
    >
      <span className="px-2 text-[11px] text-muted-foreground">Show</span>
      {ORDER.map((p) => {
        const active = search.primary === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(p)}
            className={
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors " +
              (active
                ? "bg-[var(--surface)] text-foreground shadow-[0_0_0_1px_var(--line)_inset]"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

// Returns the surrounding pair for a primary percentile. p50 → [p25, p75],
// p10 → [p10, p25], p90 → [p75, p90].
export function neighborBand(primary: PercentileKey): [PercentileKey, PercentileKey] {
  const idx = ORDER.indexOf(primary);
  const lo = ORDER[Math.max(0, idx - 1)] ?? "p10";
  const hi = ORDER[Math.min(ORDER.length - 1, idx + 1)] ?? "p90";
  return [lo, hi];
}
