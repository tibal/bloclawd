import type uPlot from "uplot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Chart } from "@/components/Chart";

const constructorCalls: Array<{ opts: uPlot.Options; data: uPlot.AlignedData }> =
  [];

vi.mock("uplot", () => {
  class MockUPlot {
    root: HTMLElement;
    series: uPlot.Series[];
    axes: uPlot.Axis[];
    destroyed = false;

    constructor(
      opts: uPlot.Options,
      data: uPlot.AlignedData,
      target: HTMLElement,
    ) {
      this.root = document.createElement("div");
      this.series = opts.series;
      this.axes = opts.axes ?? [];
      constructorCalls.push({ opts, data });
      target.appendChild(document.createElement("canvas"));
    }

    setData = vi.fn();
    setSize = vi.fn();
    redraw = vi.fn();
    destroy = vi.fn(() => {
      this.destroyed = true;
    });
  }

  return { default: MockUPlot };
});

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

afterEach(() => {
  constructorCalls.length = 0;
});

describe("Chart", () => {
  it("mounts a uPlot canvas with accessible chart semantics", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <Chart
            ariaLabel="Unified cost p50 with percentile band"
            bands={{ mode: "p25-p75" }}
            data={sampleData()}
          />,
        );
      });

      const chart = container.querySelector('[role="img"]');
      expect(chart?.getAttribute("aria-label")).toBe(
        "Unified cost p50 with percentile band",
      );
      expect(chart?.querySelector("canvas")).not.toBeNull();
      expect(constructorCalls[0]?.opts.cursor?.sync?.key).toBe(
        "bloclawd-dashboard",
      );
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it("applies tier stroke patterns in compare mode", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const data = sampleData();

    try {
      flushSync(() => {
        root.render(
          <Chart
            ariaLabel="Compare tiers"
            bands={{ mode: "p25-p75" }}
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
      });

      const series = constructorCalls[0]?.opts.series ?? [];
      expect(series.map((item) => item.dash)).toContain(undefined);
      expect(series.map((item) => item.dash)).toContainEqual([8, 4]);
      expect(series.map((item) => item.dash)).toContainEqual([2, 4]);
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
