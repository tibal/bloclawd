import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

type TierName = "pro" | "max5" | "max20";

export interface ChartProps {
  data: uPlot.AlignedData;
  bands: { mode: "p25-p75" | "p10-p90" };
  compareMode?: { tiers: Array<{ tier: TierName; data: uPlot.AlignedData }> };
  ariaLabel: string;
}

type ChartTheme = {
  chart1: string;
  chart2: string;
  chart3: string;
  grid: string;
  crosshair: string;
  foreground: string;
  muted: string;
};

const CHART_HEIGHT = 360;
const CHART_WIDTH_FALLBACK = 640;
const SYNC_KEY = "bloclawd-dashboard";

const TIER_STYLES: Record<TierName, { cssVar: keyof ChartTheme; dash?: number[] }> =
  {
    pro: { cssVar: "chart1" },
    max5: { cssVar: "chart2", dash: [8, 4] },
    max20: { cssVar: "chart3", dash: [2, 4] },
  };

export function Chart({ data, bands, compareMode, ariaLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inst = useRef<uPlot | null>(null);
  const themeRef = useRef<ChartTheme | null>(null);
  const plotData = useMemo(
    () => buildPlotData(data, compareMode),
    [data, compareMode],
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    themeRef.current = readChartTheme();
    inst.current = new uPlot(
      buildOptions({
        bands,
        compareMode,
        getTheme: () => themeRef.current ?? readChartTheme(),
        width: container.clientWidth || CHART_WIDTH_FALLBACK,
      }),
      plotData,
      container,
    );

    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(() => {
            inst.current?.setSize({
              width: container.clientWidth || CHART_WIDTH_FALLBACK,
              height: CHART_HEIGHT,
            });
          })
        : null;
    resizeObserver?.observe(container);

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onThemeChange = () => {
      themeRef.current = readChartTheme();
      inst.current?.redraw(false, true);
    };
    mediaQuery?.addEventListener("change", onThemeChange);

    return () => {
      resizeObserver?.disconnect();
      mediaQuery?.removeEventListener("change", onThemeChange);
      inst.current?.destroy();
      inst.current = null;
    };
  }, [bands, compareMode, plotData]);

  useEffect(() => {
    inst.current?.setData(plotData);
  }, [plotData]);

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      className="min-h-[360px] w-full"
      role="img"
    />
  );
}

function buildPlotData(
  data: uPlot.AlignedData,
  compareMode: ChartProps["compareMode"],
): uPlot.AlignedData {
  if (!compareMode) {
    return data;
  }

  const xs = data[0];
  return [xs, ...compareMode.tiers.map(({ data: tierData }) => tierData[3])];
}

function buildOptions({
  bands,
  compareMode,
  getTheme,
  width,
}: {
  bands: ChartProps["bands"];
  compareMode: ChartProps["compareMode"];
  getTheme: () => ChartTheme;
  width: number;
}): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    series: compareMode
      ? buildCompareSeries(compareMode, getTheme)
      : buildSingleSeries(getTheme),
    bands: compareMode ? [] : [buildBand(bands.mode, getTheme)],
    scales: { x: { time: true } },
    axes: [
      {
        stroke: () => getTheme().muted,
        grid: { stroke: () => getTheme().grid },
      },
      {
        stroke: () => getTheme().muted,
        grid: { stroke: () => getTheme().grid },
      },
    ],
    legend: { show: true, live: true },
    cursor: {
      x: true,
      y: false,
      sync: { key: SYNC_KEY },
      points: { show: false },
    },
  };
}

function buildSingleSeries(getTheme: () => ChartTheme): uPlot.Series[] {
  return [
    {},
    hiddenBandEdge("p10", getTheme),
    hiddenBandEdge("p25", getTheme),
    {
      label: "p50",
      stroke: () => getTheme().chart1,
      width: 2,
      value: formatValue,
    },
    hiddenBandEdge("p75", getTheme),
    hiddenBandEdge("p90", getTheme),
  ];
}

function buildCompareSeries(
  compareMode: NonNullable<ChartProps["compareMode"]>,
  getTheme: () => ChartTheme,
): uPlot.Series[] {
  return [
    {},
    ...compareMode.tiers.map(({ tier }) => {
      const style = TIER_STYLES[tier];
      return {
        label: tier,
        stroke: () => getTheme()[style.cssVar],
        width: 2,
        dash: style.dash,
        value: formatValue,
      };
    }),
  ];
}

function hiddenBandEdge(
  label: string,
  getTheme: () => ChartTheme,
): uPlot.Series {
  return {
    label,
    stroke: () => transparentize(getTheme().chart1),
    width: 0,
    value: formatValue,
  };
}

function buildBand(
  mode: ChartProps["bands"]["mode"],
  getTheme: () => ChartTheme,
): uPlot.Band {
  const alpha = mode === "p25-p75" ? "0.18" : "0.10";
  return {
    series: mode === "p25-p75" ? [4, 2] : [5, 1],
    fill: () => withAlpha(getTheme().chart1, alpha),
  };
}

function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  return {
    chart1: readCssVar(style, "--chart-1", "#3b5bdb"),
    chart2: readCssVar(style, "--chart-2", "#0f766e"),
    chart3: readCssVar(style, "--chart-3", "#c2410c"),
    grid: readCssVar(style, "--chart-grid", "#d4d4d4"),
    crosshair: readCssVar(style, "--chart-crosshair", "#737373"),
    foreground: readCssVar(style, "--foreground", "#171717"),
    muted: readCssVar(style, "--muted-foreground", "#737373"),
  };
}

function readCssVar(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  return style.getPropertyValue(name).trim() || fallback;
}

function withAlpha(color: string, alpha: string): string {
  if (color.startsWith("oklch(")) {
    return color.replace(/\)$/, ` / ${alpha})`);
  }
  return color;
}

function transparentize(color: string): string {
  return withAlpha(color, "0");
}

function formatValue(
  _self: uPlot,
  rawValue: number,
  _seriesIdx: number,
  _idx: number | null,
): string {
  return Number.isFinite(rawValue)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        rawValue,
      )
    : "NA";
}
