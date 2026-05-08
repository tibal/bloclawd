import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { ChartCurve } from "@/components/Chart";
import { useChartData, type CurveResult } from "@/lib/dashboard-data";
import {
  useBucket,
  useManifest,
  useStatus,
  type Manifest,
  type StatusJson,
} from "@/lib/r2";
import type { AlignedData } from "@/lib/chart-data";

vi.mock("@/lib/dashboard-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard-data")>();
  return {
    ...actual,
    useChartData: vi.fn(),
    useDelayedLoading: (loading: boolean) => loading,
  };
});

vi.mock("@/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2")>();
  return {
    ...actual,
    useStatus: vi.fn(),
    useManifest: vi.fn(),
    useBucket: vi.fn(),
  };
});

vi.mock("@/components/Chart", () => ({
  Chart: vi.fn(
    ({
      ariaLabel,
      curves,
    }: {
      ariaLabel: string;
      curves: ChartCurve[];
    }) => (
      <div
        aria-label={ariaLabel}
        data-curve-count={curves.length}
        role="img"
      >
        chart
      </div>
    ),
  ),
}));

const NOW = Date.UTC(2026, 4, 2, 21, 15, 0);
const SAMPLE_DATA: AlignedData = [
  [Date.UTC(2026, 4, 2, 21, 0, 0) / 1000],
  [10],
  [20],
  [30],
  [40],
  [50],
];

function makeCurve(
  key: string,
  data: AlignedData,
  tier: "pro" | "max5" | "max20" = "max20",
): CurveResult {
  const planByTier = {
    pro: "anthropic-pro",
    max5: "anthropic-max5",
    max20: "anthropic-max20",
  } as const;
  return {
    key,
    label: `${tier} cohort`,
    filters: {
      provider: "anthropic",
      plan: planByTier[tier],
      harness: "claude-code",
      tier,
      limit_type: "5h",
    },
    data,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/dashboard assembly", () => {
  it("renders chart and data table for the primary curve", async () => {
    mockStatus();
    mockChartData({ curves: [makeCurve("primary", SAMPLE_DATA)] });

    const { container, cleanup } = await renderDashboard(
      "/dashboard?tier=max20&region=EU",
    );

    try {
      expect(container.querySelector('[role="img"]')).not.toBeNull();
      expect(
        container.querySelector(
          'table[aria-label="Percentile values per timestamp"]',
        ),
      ).not.toBeNull();
      expect(container.textContent).toContain("2026-05-02T21:00:00.000Z");
    } finally {
      cleanup();
    }
  });

  it("passes one curve per row to Chart in compare mode", async () => {
    mockStatus();
    mockChartData({
      curves: [
        makeCurve("primary", SAMPLE_DATA, "pro"),
        makeCurve("row-0", SAMPLE_DATA, "max5"),
        makeCurve("row-1", SAMPLE_DATA, "max20"),
      ],
    });

    const { container, cleanup } = await renderDashboard(
      "/dashboard?compare=true",
    );

    try {
      expect(
        container.querySelector('[role="img"]')?.getAttribute(
          "data-curve-count",
        ),
      ).toBe("3");
    } finally {
      cleanup();
    }
  });

  it("renders stale alerts for down status and stale healthy status", async () => {
    mockChartData({ curves: [makeCurve("primary", SAMPLE_DATA)] });
    mockStatus({ ingest_health: "down" });
    const downRender = await renderDashboard("/dashboard?tier=max20");

    try {
      expect(
        downRender.container.querySelector('[role="alert"]')?.textContent,
      ).toContain("Public data is stale");
    } finally {
      downRender.cleanup();
    }

    mockChartData({ curves: [makeCurve("primary", SAMPLE_DATA)] });
    mockStatus({
      ingest_health: "healthy",
      last_cron_success_ts: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    });
    const staleRender = await renderDashboard("/dashboard?tier=max20");

    try {
      expect(
        staleRender.container.querySelector('[role="alert"]')?.textContent,
      ).toContain("Public data is stale");
    } finally {
      staleRender.cleanup();
    }
  });

  it("renders degraded status as an inline notice without top-level alert", async () => {
    mockChartData({ curves: [makeCurve("primary", SAMPLE_DATA)] });
    mockStatus({ ingest_health: "degraded" });

    const { container, cleanup } = await renderDashboard(
      "/dashboard?tier=max20",
    );

    try {
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent).toContain("Ingest degraded");
    } finally {
      cleanup();
    }
  });
});

async function renderDashboard(path: string) {
  vi.spyOn(Date, "now").mockReturnValue(NOW);

  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({ history, routeTree });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(<RouterProvider router={router} />);
  });
  await router.load();
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

function mockChartData({
  curves = [],
  error = null,
  loading = false,
  meta = null,
}: Partial<ReturnType<typeof useChartData>> = {}) {
  vi.mocked(useChartData).mockReturnValue({
    curves,
    meta,
    loading,
    error,
    bucketsLoaded: curves.length > 0 ? 1 : 0,
    bucketsTotal: 1,
    resolution: "h1",
  });
  vi.mocked(useManifest).mockReturnValue({
    data: {
      schema_version: "v1",
      last_updated_ts: new Date(NOW).toISOString(),
      tiers: { q15: [], h1: [], d1: [] },
    } satisfies Manifest,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useManifest>);
  vi.mocked(useBucket).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useBucket>);
}

function mockStatus(overrides: Partial<StatusJson> = {}) {
  vi.mocked(useStatus).mockReturnValue({
    data: {
      schema_version: "v1",
      last_cron_success_ts: new Date(NOW - 12 * 60_000).toISOString(),
      last_cron_attempted_ts: new Date(NOW - 12 * 60_000).toISOString(),
      ingest_health: "healthy",
      total_events_lifetime: 12_345,
      approximate_contributors_30d: 230,
      approximate_contributors_window_days: 30,
      ...overrides,
    },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useStatus>);
}
