import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Chart, type ChartCurve } from "@/components/Chart";
import type { AlignedData } from "@/lib/chart-data";

function sampleData(): AlignedData {
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

function curve(label: string, data: AlignedData, key = label): ChartCurve {
  return { key, label, data };
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
  it("renders an accessible SVG envelope chart with the inner band", () => {
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Unified cost p50 with percentile band"
        curves={[curve("primary", sampleData())]}
        dist={["p25-p75"]}
      />,
    );

    try {
      const chart = container.querySelector('[role="img"]');
      expect(chart?.getAttribute("aria-label")).toBe(
        "Unified cost p50 with percentile band",
      );
      expect(chart?.querySelector("svg")).not.toBeNull();
      expect(chart?.querySelector('[data-band="p25-p75"]')).not.toBeNull();
      expect(chart?.querySelector('[data-curve="primary"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("renders the outer p10–p90 band when selected in dist", () => {
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Unified cost wide band"
        curves={[curve("primary", sampleData())]}
        dist={["p10-p90"]}
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

  it("draws one line per curve in compare mode and skips bands", () => {
    const data = sampleData();
    const { container, cleanup } = render(
      <Chart
        ariaLabel="Compare tiers"
        curves={[
          curve("Pro", data, "pro"),
          curve("Max5", data, "max5"),
          curve("Max20", data, "max20"),
        ]}
        dist={["p25-p75"]}
      />,
    );

    try {
      const paths = Array.from(
        container.querySelectorAll<SVGPathElement>("path[data-curve]"),
      );
      expect(paths.map((p) => p.getAttribute("data-curve"))).toEqual([
        "pro",
        "max5",
        "max20",
      ]);
      // No envelope rendered in compare mode.
      expect(container.querySelector('[data-band="p25-p75"]')).toBeNull();
    } finally {
      cleanup();
    }
  });
});
