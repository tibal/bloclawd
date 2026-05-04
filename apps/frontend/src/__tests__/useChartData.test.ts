import type uPlot from "uplot";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardSearch } from "@/routes/dashboard";
import {
  useBuckets,
  useManifest,
  type BucketEnvelope,
  type BucketResult,
  type Manifest,
} from "@/lib/r2";
import { useChartData } from "@/lib/dashboard-data";

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
  window: "7d",
  primary: "p50",
  envelope: "neighbors",
  brush_start: 0,
  brush_end: 1,
  compare: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("useChartData", () => {
  it("picks h1 buckets for the 7d window and returns single-tier aligned data", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("max20", {
            unified: [10, 20, 30, 40, 50],
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
    expect(result.data).toEqual([
      [Date.UTC(2026, 4, 2, 21, 0, 0) / 1000],
      [10],
      [20],
      [30],
      [40],
      [50],
    ] satisfies uPlot.AlignedData);
  });

  it("uses model drill-down percentiles when the model filter is set", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("max20", {
            model: "gpt-5",
            modelValues: [100, 200, 300, 400, 500],
            unified: [10, 20, 30, 40, 50],
          }),
        ]),
      ),
    ]);

    const result = renderHookResult({
      ...BASE_FILTERS,
      model: "gpt-5",
      region: "EU",
      tier: "max20",
    });

    expect(result.data?.[3]).toEqual([300]);
  });

  it("emits three aligned tier series in compare mode", () => {
    mockManifest();
    vi.mocked(useBuckets).mockReturnValue([
      bucketResult(
        bucket([
          cell("pro", { unified: [1, 2, 3, 4, 5] }),
          cell("max5", { unified: [10, 20, 30, 40, 50] }),
          cell("max20", { unified: [100, 200, 300, 400, 500] }),
        ]),
      ),
    ]);

    const result = renderHookResult({
      ...BASE_FILTERS,
      compare: true,
    });

    expect(result.data).toBeNull();
    expect(result.compareData?.map(({ tier }) => tier)).toEqual([
      "pro",
      "max5",
      "max20",
    ]);
    expect(result.compareData?.map(({ data }) => data[3][0])).toEqual([
      3, 30, 300,
    ]);
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
    bin_edges: [],
    cells,
  };
}

function cell(
  tier: "pro" | "max5" | "max20",
  {
    model,
    modelValues,
    unified,
  }: {
    model?: string;
    modelValues?: [number, number, number, number, number];
    unified: [number, number, number, number, number];
  },
): BucketEnvelope["cells"][number] {
  return {
    tier,
    harness: "claude-code",
    region: "EU",
    limit_type: "5h",
    n_submissions: 12,
    trim_rate: 0,
    trim_rate_alert: false,
    insufficient_data: false,
    unified_cost: percentiles(unified),
    models: model
      ? [
          {
            model,
            n_with_model: 12,
            weights: [],
            weight_source: "cohort",
            tokens_to_limit_if_only: modelValues
              ? percentiles(modelValues)
              : null,
          },
        ]
      : [],
  };
}

function percentiles(values: [number, number, number, number, number]) {
  return {
    Mean: {
      p10: values[0],
      p25: values[1],
      p50: values[2],
      p75: values[3],
      p90: values[4],
    },
  };
}
