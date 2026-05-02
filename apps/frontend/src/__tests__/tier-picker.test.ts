import { describe, expect, it } from "vitest";

import { pickTier } from "@/lib/tier-picker";

describe("pickTier", () => {
  it.each([
    [0.5, "q15"],
    [1, "q15"],
    [3, "h1"],
    [7, "h1"],
    [10, "d1"],
    [365, "d1"],
  ] as const)("maps %s days to %s", (windowDays, tier) => {
    expect(pickTier(windowDays)).toBe(tier);
  });
});
