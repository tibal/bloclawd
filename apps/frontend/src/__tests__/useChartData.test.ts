import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Model } from "@web/Model";
import type { Tier } from "@web/Tier";

import type { DashboardSearch } from "@/lib/dashboard-search";
import {
  useBuckets,
  useManifest,
  type BucketEnvelope,
  type BucketResult,
  type Manifest,
} from "@/lib/r2";
import { useChartData } from "@/lib/dashboard-data";
import type { AlignedData } from "@/lib/chart-data";

vi.mock("@/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2")>();
  return {
    ...actual,
    useManifest: vi.fn(),
    useBuckets: vi.fn(),
  };
});

const NOW = Date.UTC(2026, 4, 2, 21, 15, 0);
const CURRENT_H1_PATH = "2026/05/02/21.json";
const OLD_H1_PATH = "2026/04/20/00.json";

const BASE_FILTERS: DashboardSearch = {
  harness: "claude-code",
  limit_type: "5h",
  range: "1w",
  primary: "p50",
  dist: ["p10-p90", "p25-p75"],
  compare: false,
  rows: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("useChartData", () => {
  it("picks h1 buckets for the 1w range and returns one curve", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("max20", {
            apiCost: [10, 20, 30, 40, 50],
          }),
        ]),
      ),
    ]);

    const result = renderHookResult({
      ...BASE_FILTERS,
      region: "EU",
      tier: "max20",
    });

    expect(useBuckets).toHaveBeenCalledWith("h1", [CURRENT_H1_PATH]);
    expect(result.loading).toBe(false);
    expect(result.error).toBeNull();
    expect(result.bucketsLoaded).toBe(1);
    expect(result.bucketsTotal).toBe(1);
    expect(result.curves).toHaveLength(1);
    expect(result.curves[0]?.data).toEqual([
      [Date.UTC(2026, 4, 2, 21, 0, 0) / 1000],
      [10],
      [20],
      [30],
      [40],
      [50],
    ] satisfies AlignedData);
  });

  it("keeps API-cost percentiles when the model filter matches typical mix", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("max20", {
            model: "claude-sonnet-4-5",
            apiCost: [10, 20, 30, 40, 50],
          }),
        ]),
      ),
    ]);

    const result = renderHookResult({
      ...BASE_FILTERS,
      model: "claude-sonnet-4-5",
      region: "EU",
      tier: "max20",
    });

    expect(result.curves[0]?.data[3]).toEqual([30]);
  });

  it("returns one curve per row when compare is enabled", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("pro", { apiCost: [1, 2, 3, 4, 5] }),
          cell("max5", { apiCost: [10, 20, 30, 40, 50] }),
          cell("max20", { apiCost: [100, 200, 300, 400, 500] }),
        ]),
      ),
    ]);

    const result = renderHookResult({
      ...BASE_FILTERS,
      tier: "pro",
      compare: true,
      rows: [
        { harness: "claude-code", tier: "max5", limit_type: "5h" },
        { harness: "claude-code", tier: "max20", limit_type: "5h" },
      ],
    });

    expect(result.curves).toHaveLength(3);
    expect(result.curves.map((c) => c.filters.tier)).toEqual([
      "pro",
      "max5",
      "max20",
    ]);
    expect(result.curves.map((c) => c.data[3][0])).toEqual([3, 30, 300]);
  });
});

function renderHookResult(filters: DashboardSearch) {
  const observed: ReturnType<typeof useChartData>[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    observed.push(useChartData(filters));
    return null;
  }

  vi.spyOn(Date, "now").mockReturnValue(NOW);

  try {
    flushSync(() => {
      root.render(React.createElement(Probe));
    });
    return observed.at(-1)!;
  } finally {
    root.unmount();
    container.remove();
  }
}

function mockManifest() {
  vi.mocked(useManifest).mockReturnValue({
    data: {
      schema_version: "v1",
      last_updated_ts: new Date(NOW).toISOString(),
      tiers: {
        q15: [],
        h1: [OLD_H1_PATH, CURRENT_H1_PATH],
        d1: [],
      },
    } satisfies Manifest,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useManifest>);
}

function bucketResult(data: BucketEnvelope): BucketResult {
  return { data, isLoading: false, error: null };
}

function bucket(cells: BucketEnvelope["cells"]): BucketEnvelope {
  return {
    schema_version: "v1",
    bucket_ts: "2026-05-02T21:00:00Z",
    tier_resolution: "h1",
    cells,
  };
}

function cell(
  tier: Tier,
  {
    model,
    apiCost,
  }: {
    model?: Model;
    apiCost: [number, number, number, number, number];
  },
): BucketEnvelope["cells"][number] {
  return {
    subscription_tier: tier,
    harness: "claude-code",
    region: "EU",
    limit_type: "5h",
    n_dropped: 0,
    n_retained: 12,
    insufficient_data: false,
    api_cost_usd: percentiles(apiCost),
    typical_mix: model
      ? [
          {
            model,
            tokens: {
              input: 100,
              output: 50,
              cached_read: 250,
              cached_write: 10,
            },
          },
        ]
      : [],
  };
}

function percentiles(values: [number, number, number, number, number]) {
  return {
    p10: values[0],
    p25: values[1],
    p50: values[2],
    p75: values[3],
    p90: values[4],
  };
}
