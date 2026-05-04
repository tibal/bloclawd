import { useCallback } from "react";

import { Segmented } from "@/components/ui/segmented";
import type { Percentiles } from "@/lib/r2";
import { Route } from "@/routes/dashboard";

export type PercentileKey = keyof Percentiles;

const ORDER: readonly PercentileKey[] = ["p10", "p25", "p50", "p75", "p90"];
const OPTIONS = ORDER.map((p) => ({ value: p, label: p }));

export function PercentilePicker() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const onPick = useCallback(
    (next: PercentileKey) => {
      void navigate({ search: (prev) => ({ ...prev, primary: next }) });
    },
    [navigate],
  );

  return (
    <Segmented
      label="Show"
      ariaLabel="Pick the percentile to highlight"
      value={search.primary}
      options={OPTIONS}
      onChange={onPick}
    />
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
