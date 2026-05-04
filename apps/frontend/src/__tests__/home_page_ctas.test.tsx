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
  it("links to the dashboard and methodology", async () => {
    const { container, cleanup } = await renderHome();

    try {
      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"));
      const dashboard = links.find(
        (link) => link.textContent === "Open dashboard",
      );
      const methodology = links.find(
        (link) => link.textContent === "Read the methodology",
      );

      expect(dashboard?.textContent).toBe("Open dashboard");
      expect(dashboard?.getAttribute("href")).toBe("/dashboard");
      expect(methodology?.textContent).toBe("Read the methodology");
      expect(methodology?.getAttribute("href")).toBe("/methodology");
    } finally {
      cleanup();
    }
  });
});
