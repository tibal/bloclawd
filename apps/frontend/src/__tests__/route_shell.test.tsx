import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RouteShell } from "@/components/RouteShell";

async function renderInRouter(
  child: React.ReactNode,
  initialEntry: string = "/",
) {
  const rootRoute = createRootRoute({
    component: () => <RouteShell>{child}</RouteShell>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const installRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/install",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([indexRoute, installRoute]),
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<RouterProvider router={router} />));
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

describe("RouteShell", () => {
  it("renders the wordmark, children, and public-data footer", async () => {
    const { container, cleanup } = await renderInRouter(<p>route child</p>);

    try {
      const wordmark = container.querySelector<HTMLAnchorElement>(
        'header a[href="/"]',
      );
      const footerLinks = Array.from(
        container.querySelectorAll<HTMLAnchorElement>("footer a"),
      ).map((link) => link.textContent);

      expect(wordmark?.textContent).toBe("bloclawd");
      expect(container.textContent).toContain("route child");
      expect(container.textContent).toContain(
        "Anonymous. PoW-gated. Open data (CC BY 4.0).",
      );
      expect(footerLinks).toEqual([
        "Methodology",
        "Data schema",
        "Source",
        "License",
      ]);
    } finally {
      cleanup();
    }
  });

  it("renders the submit-CTA strip on non-install routes", async () => {
    const { container, cleanup } = await renderInRouter(<p>x</p>, "/");

    try {
      const cta = container.querySelector<HTMLAnchorElement>(
        '[data-testid="submit-cta"]',
      );

      expect(cta?.textContent?.trim()).toBe("Submit + card →");
      expect(cta?.getAttribute("href")).toBe("/install");
      expect(container.textContent).toContain(
        "Got rate-limited by Claude Code or Codex?",
      );
      expect(container.textContent).toContain(
        "The normal CLI run submits an anonymous data point",
      );
    } finally {
      cleanup();
    }
  });

  it("hides the submit-CTA strip on /install to avoid a self-link", async () => {
    const { container, cleanup } = await renderInRouter(
      <p>x</p>,
      "/install",
    );

    try {
      const cta = container.querySelector('[data-testid="submit-cta"]');
      expect(cta).toBeNull();
    } finally {
      cleanup();
    }
  });
});
