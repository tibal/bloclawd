import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RouteShell } from "@/components/RouteShell";

function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(element);
  });

  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("RouteShell", () => {
  it("renders the wordmark, children, and public-data footer", () => {
    const { container, cleanup } = render(
      <RouteShell>
        <p>route child</p>
      </RouteShell>,
    );

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
});
