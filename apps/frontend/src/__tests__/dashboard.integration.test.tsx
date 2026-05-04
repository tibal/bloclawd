import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { useChartData } from "@/lib/dashboard-data";
import {
  useBucket,
  useManifest,
  useStatus,
  type Manifest,
  type StatusJson,
} from "@/lib/r2";
import type { AlignedData } from "@/lib/chart-data";

vi.mock("@/lib/dashboard-data", () => ({
  useChartData: vi.fn(),
  useDelayedLoading: (loading: boolean) => loading,
}));

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
      compareMode,
    }: {
      ariaLabel: string;
      compareMode?: { tiers: unknown[] };
    }) => (
      <div
        aria-label={ariaLabel}
        data-compare-count={compareMode?.tiers.length ?? 0}
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
const COMPARE_DATA = (["pro", "max5", "max20"] as const).map((tier, idx) => ({
  tier,
  data: [
    SAMPLE_DATA[0],
    [10 + idx],
    [20 + idx],
    [30 + idx],
    [40 + idx],
    [50 + idx],
  ] satisfies AlignedData,
}));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/dashboard assembly", () => {
  it("nudges users to pick a tier before rendering a single-tier chart", async () => {
    mockStatus();
    mockChartData({ data: SAMPLE_DATA });

    const { container, cleanup } = await renderDashboard("/dashboard");

    try {
      expect(container.textContent).toContain("Pick a tier");
      expect(container.querySelector('[role="img"]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("renders chart and data table for a selected tier", async () => {
    mockStatus();
    mockChartData({ data: SAMPLE_DATA });

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

  it("passes all three tier series to Chart in compare mode", async () => {
    mockStatus();
    mockChartData({ compareData: COMPARE_DATA });

    const { container, cleanup } = await renderDashboard(
      "/dashboard?compare=true",
    );

    try {
      expect(container.querySelector('[role="img"]')?.getAttribute(
        "data-compare-count",
      )).toBe("3");
    } finally {
      cleanup();
    }
  });

  it("renders stale alerts for down status and stale healthy status", async () => {
    mockChartData({ data: SAMPLE_DATA });
    mockStatus({ ingest_health: "down" });
    const downRender = await renderDashboard("/dashboard?tier=max20");

    try {
      expect(downRender.container.querySelector('[role="alert"]')?.textContent).toContain(
        "Public data is stale",
      );
    } finally {
      downRender.cleanup();
    }

    mockChartData({ data: SAMPLE_DATA });
    mockStatus({
      ingest_health: "healthy",
      last_cron_success_ts: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    });
    const staleRender = await renderDashboard("/dashboard?tier=max20");

    try {
      expect(staleRender.container.querySelector('[role="alert"]')?.textContent).toContain(
        "Public data is stale",
      );
    } finally {
      staleRender.cleanup();
    }
  });

  it("renders degraded status as an inline notice without top-level alert", async () => {
    mockChartData({ data: SAMPLE_DATA });
    mockStatus({ ingest_health: "degraded" });

    const { container, cleanup } = await renderDashboard("/dashboard?tier=max20");

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
  compareData = null,
  data = null,
  error = null,
  loading = false,
  meta = null,
}: Partial<ReturnType<typeof useChartData>> = {}) {
  vi.mocked(useChartData).mockReturnValue({
    data,
    compareData,
    meta,
    loading,
    error,
    bucketsLoaded: data || compareData ? 1 : 0,
    bucketsTotal: 1,
  });
  // Cohort panels read manifest+bucket; default them to empty so /dashboard
  // tests don't have to care unless they explicitly check cohort UI.
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
