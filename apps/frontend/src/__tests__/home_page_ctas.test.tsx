import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

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
    useBuckets: () => [],
  };
});

async function renderHome() {
  const history = createMemoryHistory({ initialEntries: ["/"] });
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

describe("home page CTAs", () => {
  it("prioritizes the rank card and keeps live data accessible", async () => {
    const { container, cleanup } = await renderHome();

    try {
      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"));
      const install = links.find(
        (link) => link.textContent === "Submit + make card",
      );
      const dashboard = links.find(
        (link) => link.textContent === "See live limits",
      );
      const rank = links.find((link) => link.textContent === "Try sample card");
      const methodology = links.find(
        (link) => link.textContent === "Privacy details",
      );

      expect(install?.textContent).toBe("Submit + make card");
      expect(install?.getAttribute("href")).toBe("/install");
      expect(dashboard?.textContent).toBe("See live limits");
      expect(dashboard?.getAttribute("href")).toBe("/dashboard");
      expect(rank?.getAttribute("href")).toBe("/rank");
      expect(methodology?.textContent).toBe("Privacy details");
      expect(methodology?.getAttribute("href")).toBe("/methodology");
    } finally {
      cleanup();
    }
  });
});
