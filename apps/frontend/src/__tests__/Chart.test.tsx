import type uPlot from "uplot";
import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Chart } from "@/components/Chart";

function sampleData(): uPlot.AlignedData {
  const xs = Array.from({ length: 10 }, (_, idx) => 1_700_000_000 + idx * 60);
  return [
    xs,
    xs.map((_, idx) => 100 + idx),
    xs.map((_, idx) => 120 + idx),
    xs.map((_, idx) => 150 + idx),
    xs.map((_, idx) => 180 + idx),
    xs.map((_, idx) => 220 + idx),
  ];
}

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(node));
  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("Chart", () => {
  it("renders an accessible SVG envelope chart with the median series", () => {
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Unified cost p50 with percentile band"
        envelope="neighbors"
        data={sampleData()}
      />,
    );

    try {
      const chart = container.querySelector('[role="img"]');
      expect(chart?.getAttribute("aria-label")).toBe(
        "Unified cost p50 with percentile band",
      );
      expect(chart?.querySelector("svg")).not.toBeNull();
      expect(chart?.querySelector('[data-band="p25-p75"]')).not.toBeNull();
      expect(chart?.querySelector('[data-series="p50"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("renders the outer p10–p90 band when wide-band mode is selected", () => {
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Unified cost wide band"
        envelope="wide"
        data={sampleData()}
      />,
    );

    try {
      expect(
        container.querySelector('[data-band="p10-p90"]'),
      ).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("applies tier stroke patterns in compare mode", () => {
    const data = sampleData();
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Compare tiers"
        envelope="neighbors"
        compareMode={{
          tiers: [
            { tier: "pro", data },
            { tier: "max5", data },
            { tier: "max20", data },
          ],
        }}
        data={data}
      />,
    );

    try {
      const dashes = Array.from(
        container.querySelectorAll<SVGPathElement>("path[data-tier]"),
      ).map((path) => path.getAttribute("stroke-dasharray"));

      expect(dashes).toContain("8 4");
      expect(dashes).toContain("2 4");
      expect(dashes).toContain(null);
    } finally {
      cleanup();
    }
  });
});
