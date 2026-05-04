// Shared symbolic indices into the local AlignedData rows so chart and
// dashboard don't pass raw 1..5 magic numbers around.
export const PERCENTILE_INDEX = {
  p10: 1,
  p25: 2,
  p50: 3,
  p75: 4,
  p90: 5,
} as const;

export type TierName = "pro" | "max5" | "max20";

export const TIER_COLOR_VAR: Record<TierName, string> = {
  pro: "var(--chart-1)",
  max5: "var(--chart-2)",
  max20: "var(--chart-3)",
};

export const TIER_DASH: Record<TierName, number[] | undefined> = {
  pro: undefined,
  max5: [8, 4],
  max20: [2, 4],
};
