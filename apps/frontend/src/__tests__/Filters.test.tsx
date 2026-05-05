import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { DistributionPicker } from "@/components/DistributionPicker";
import { Filters } from "@/components/Filters";
import { PercentilePicker } from "@/components/PercentilePicker";
import { Route as DashboardRouteImport } from "@/routes/dashboard";

let dashboardNode: React.ReactNode = null;

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const dashboardRoute = DashboardRouteImport.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => rootRoute,
  component: DashboardProbe,
} as never);

const testRouteTree = rootRoute._addFileChildren({
  DashboardRoute: dashboardRoute,
});

function DashboardProbe() {
  return dashboardNode;
}

async function renderDashboard(node: React.ReactNode, initialEntry: string) {
  dashboardNode = node;
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ history, routeTree: testRouteTree });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(<RouterProvider router={router} />);
  });
  await router.load();
  await settle();

  return {
    container,
    router,
    cleanup: () => {
      root.unmount();
      container.remove();
      dashboardNode = null;
    },
  };
}

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Filters", () => {
  it("reads model and tier selections from dashboard search params", async () => {
    const { container, cleanup } = await renderDashboard(
      <Filters />,
      "/dashboard?model=claude-opus-4-7&tier=max20",
    );

    try {
      expect(
        container.querySelector('[aria-label="Model"]')?.textContent,
      ).toContain("Claude Opus 4.7");
      expect(
        container.querySelector('[aria-label="Tier"]')?.textContent,
      ).toContain("max20");
    } finally {
      cleanup();
    }
  });

  it("updates the URL when tier changes", async () => {
    const { container, router, cleanup } = await renderDashboard(
      <Filters />,
      "/dashboard?model=claude-opus-4-7&tier=max20",
    );

    try {
      const trigger = container.querySelector('[aria-label="Tier"]');
      expect(trigger).not.toBeNull();
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      await settle();

      const option = Array.from(
        document.body.querySelectorAll('[role="option"]'),
      ).find((item) => item.textContent?.includes("pro"));
      expect(option).not.toBeUndefined();
      option?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await settle();

      expect(router.state.location.search).toMatchObject({ tier: "pro" });
    } finally {
      cleanup();
    }
  });

  it("round-trips percentile picker and distribution toggles through URL search", async () => {
    const { container, router, cleanup } = await renderDashboard(
      <>
        <PercentilePicker />
        <DistributionPicker />
      </>,
      "/dashboard?primary=p50",
    );

    try {
      const p25Button = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "p25",
      );
      expect(p25Button).not.toBeUndefined();
      click(p25Button!);
      await settle();

      // open the distribution dropdown
      const distTrigger = container.querySelector(
        '[aria-label="Distribution envelopes"]',
      );
      expect(distTrigger).not.toBeNull();
      click(distTrigger!);
      await settle();

      // toggle outer envelope off
      const outerOption = Array.from(
        document.body.querySelectorAll('[role="button"], button'),
      ).find((el) => el.textContent?.includes("p10 — p90"));
      expect(outerOption).not.toBeUndefined();
      click(outerOption!);
      await settle();

      expect(router.state.location.search).toMatchObject({
        primary: "p25",
        dist: ["p25-p75"],
      });
    } finally {
      cleanup();
    }
  });
});
