import { describe, expect, it } from "vitest";

import { formatDriftPct } from "@/routes/dashboard";

describe("formatDriftPct", () => {
  it("returns em dash when null", () => {
    expect(formatDriftPct(null)).toBe("—");
  });

  it("treats sub-0.05% as flat", () => {
    expect(formatDriftPct(0)).toBe("±0%");
    expect(formatDriftPct(0.04)).toBe("±0%");
    expect(formatDriftPct(-0.04)).toBe("±0%");
  });

  it("formats positive drift with a plus sign", () => {
    expect(formatDriftPct(12.345)).toBe("+12.3%");
  });

  it("formats negative drift with an en-dash minus sign", () => {
    expect(formatDriftPct(-4.1)).toBe("−4.1%");
  });

  it("rounds to one decimal", () => {
    expect(formatDriftPct(0.16)).toBe("+0.2%");
    expect(formatDriftPct(-99.95)).toBe("−100.0%");
  });
});
