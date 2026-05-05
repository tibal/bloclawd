import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

vi.mock("@/lib/dashboard-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard-data")>();
  return {
    ...actual,
    useChartData: () => ({
      curves: [],
      meta: null,
      loading: false,
      error: null,
      bucketsLoaded: 0,
      bucketsTotal: 0,
      resolution: "h1" as const,
    }),
    useDelayedLoading: () => false,
  };
});

vi.mock("@/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2")>();
  return {
    ...actual,
    useStatus: () => ({
      data: {
        schema_version: "v1",
        last_cron_success_ts: new Date().toISOString(),
        last_cron_attempted_ts: new Date().toISOString(),
        ingest_health: "healthy",
        total_events_lifetime: 0,
        approximate_contributors_30d: 0,
        approximate_contributors_window_days: 30,
      },
      isLoading: false,
      error: null,
    }),
    useManifest: () => ({
      data: {
        schema_version: "v1",
        last_updated_ts: new Date().toISOString(),
        tiers: { q15: [], h1: [], d1: [] },
      },
      isLoading: false,
      error: null,
    }),
    useBucket: () => ({
      data: undefined,
      isLoading: false,
      error: null,
    }),
    useBuckets: () => [],
  };
});

async function renderPath(path: string) {
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

describe("frontend routes", () => {
  it.each([
    ["/", "When do AI subscription users actually hit limits?"],
    ["/dashboard", "API-equivalent cost"],
    ["/compare", "Pro vs Max5 vs Max20"],
    ["/methodology", "How bloclawd computes what you see"],
    ["/methodology/changelog", "Methodology changelog"],
    ["/data", "What your CLI submits"],
  ])("renders %s", async (path, heading) => {
    const { container, cleanup } = await renderPath(path);

    try {
      expect(container.textContent).toContain(heading);
    } finally {
      cleanup();
    }
  });
});
