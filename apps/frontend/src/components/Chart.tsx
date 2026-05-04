import { useEffect, useMemo, useRef, useState } from "react";
import type uPlot from "uplot";

import { formatTokens } from "@/lib/format";
import {
  PERCENTILE_INDEX,
  TIER_COLOR_VAR,
  TIER_DASH,
  type TierName,
} from "@/lib/chart-tokens";

export interface ChartProps {
  data: uPlot.AlignedData;
  bands: { mode: "p25-p75" | "p10-p90" };
  compareMode?: { tiers: Array<{ tier: TierName; data: uPlot.AlignedData }> };
  ariaLabel: string;
}

const HEIGHT = 360;
const WIDTH_FALLBACK = 720;
const PAD_L = 56;
const PAD_R = 24;
const PAD_T = 18;
const PAD_B = 36;

type SeriesPoint = { x: number; y: number };
type Series = ReadonlyArray<number | null | undefined>;

function asSeries(values: uPlot.AlignedData[number] | undefined): Series {
  return (values ?? []) as Series;
}

export function Chart({ data, bands, compareMode, ariaLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(WIDTH_FALLBACK);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth || WIDTH_FALLBACK);
    apply();
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return;
  }, []);

  const geometry = useMemo(
    () => buildGeometry({ data, compareMode, width }),
    [data, compareMode, width],
  );

  const innerWidth = Math.max(0, width - PAD_L - PAD_R);
  const innerHeight = Math.max(0, HEIGHT - PAD_T - PAD_B);
  const xs = asSeries(data[0]);

  const onPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (!xs.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const next = Math.round(fraction * (xs.length - 1));
    setHoverIndex((prev) => (prev === next ? prev : next));
  };

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      className="relative min-h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-[var(--bg-1)]"
      role="img"
    >
      <svg
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="bloclawd-band-outer" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="bloclawd-band-inner" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.10" />
          </linearGradient>
          <filter id="bloclawd-line-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {geometry.yTicks.map((tick, idx) => (
          <g key={`y-${tick.value}`}>
            <line
              stroke="var(--chart-grid)"
              strokeDasharray={idx === 0 ? "0" : "2 4"}
              x1={PAD_L}
              x2={PAD_L + innerWidth}
              y1={tick.y}
              y2={tick.y}
            />
            <text
              fill="var(--muted-foreground)"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              textAnchor="end"
              x={PAD_L - 10}
              y={tick.y + 4}
            >
              {formatTokens(tick.value)}
            </text>
          </g>
        ))}

        {geometry.xTicks.map((tick) => (
          <text
            key={`x-${tick.x}`}
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            textAnchor="middle"
            x={tick.x}
            y={PAD_T + innerHeight + 18}
          >
            {tick.label}
          </text>
        ))}

        {compareMode ? (
          compareMode.tiers.map(({ tier, data: tierData }) => {
            const path = pathFor(
              xs as readonly number[],
              asSeries(tierData[PERCENTILE_INDEX.p50]),
              geometry.xAt,
              geometry.yAt,
            );
            if (!path) return null;
            return (
              <path
                key={tier}
                d={path}
                data-tier={tier}
                fill="none"
                stroke={TIER_COLOR_VAR[tier]}
                strokeDasharray={TIER_DASH[tier]?.join(" ") ?? undefined}
                strokeLinecap="round"
                strokeWidth={tier === "max20" ? 2 : 1.6}
              />
            );
          })
        ) : (
          <>
            {bands.mode === "p10-p90" && geometry.outerBandPath ? (
              <path
                d={geometry.outerBandPath}
                data-band="p10-p90"
                fill="url(#bloclawd-band-outer)"
              />
            ) : null}
            {geometry.innerBandPath ? (
              <path
                d={geometry.innerBandPath}
                data-band="p25-p75"
                fill="url(#bloclawd-band-inner)"
              />
            ) : null}
            {geometry.medianPath ? (
              <path
                d={geometry.medianPath}
                data-series="p50"
                fill="none"
                filter="url(#bloclawd-line-glow)"
                stroke="var(--chart-1)"
                strokeLinecap="round"
                strokeWidth="2"
              />
            ) : null}
          </>
        )}

        {hoverIndex != null && geometry.medianPoints[hoverIndex] ? (
          <g>
            <line
              stroke="var(--chart-crosshair)"
              strokeDasharray="2 3"
              strokeOpacity="0.55"
              x1={geometry.xAt(hoverIndex)}
              x2={geometry.xAt(hoverIndex)}
              y1={PAD_T}
              y2={PAD_T + innerHeight}
            />
            <circle
              cx={geometry.xAt(hoverIndex)}
              cy={geometry.medianPoints[hoverIndex]!.y}
              fill="var(--bg)"
              r="4"
              stroke="var(--chart-1)"
              strokeWidth="1.5"
            />
          </g>
        ) : null}

        <rect
          fill="transparent"
          height={innerHeight}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerMove={onPointerMove}
          width={innerWidth}
          x={PAD_L}
          y={PAD_T}
        />
      </svg>

      <HoverTooltip data={data} hoverIndex={hoverIndex} />
    </div>
  );
}

function HoverTooltip({
  data,
  hoverIndex,
}: {
  data: uPlot.AlignedData;
  hoverIndex: number | null;
}) {
  if (hoverIndex == null) return null;
  const ts = asSeries(data[0])[hoverIndex];
  if (typeof ts !== "number") return null;
  const values = (Object.keys(PERCENTILE_INDEX) as Array<
    keyof typeof PERCENTILE_INDEX
  >).map((key) => ({
    key,
    value: numericAt(asSeries(data[PERCENTILE_INDEX[key]]), hoverIndex),
  }));

  return (
    <div className="pointer-events-none absolute left-20 top-5 min-w-[220px] rounded-xl border border-border bg-[var(--bg-2)]/95 p-3 shadow-[var(--shadow-card)] backdrop-blur-md">
      <div className="mb-2 font-mono text-[11px] text-muted-foreground">
        {formatTooltipTimestamp(ts)}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {values.map(({ key, value }) => (
          <div key={key} className="contents">
            <span
              className={
                key === "p50"
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              }
            >
              {key}
            </span>
            <span
              className={
                key === "p50"
                  ? "text-right font-mono font-semibold text-foreground tabular-nums"
                  : "text-right font-mono text-foreground/80 tabular-nums"
              }
            >
              {value == null ? "NA" : formatTokens(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ChartGeometry {
  xAt: (idx: number) => number;
  yAt: (value: number) => number;
  yTicks: Array<{ value: number; y: number }>;
  xTicks: Array<{ x: number; label: string }>;
  innerBandPath: string | null;
  outerBandPath: string | null;
  medianPath: string | null;
  medianPoints: Array<SeriesPoint | null>;
}

function buildGeometry({
  data,
  compareMode,
  width,
}: {
  data: uPlot.AlignedData;
  compareMode: ChartProps["compareMode"];
  width: number;
}): ChartGeometry {
  const xs = asSeries(data[0]) as readonly number[];
  const innerWidth = Math.max(0, width - PAD_L - PAD_R);
  const innerHeight = Math.max(0, HEIGHT - PAD_T - PAD_B);
  const length = xs.length;

  const xAt = (idx: number) =>
    length <= 1 ? PAD_L : PAD_L + (idx / (length - 1)) * innerWidth;

  const seriesForYMax: ReadonlyArray<Series> = compareMode
    ? compareMode.tiers.map(({ data: tierData }) =>
        asSeries(tierData[PERCENTILE_INDEX.p50]),
      )
    : [
        asSeries(data[PERCENTILE_INDEX.p10]),
        asSeries(data[PERCENTILE_INDEX.p90]),
        asSeries(data[PERCENTILE_INDEX.p50]),
      ];

  let rawMax = 0;
  for (const series of seriesForYMax) {
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (typeof v === "number" && Number.isFinite(v) && v > rawMax) {
        rawMax = v;
      }
    }
  }
  const yMax = (rawMax || 1) * 1.08;

  const yAt = (value: number) =>
    PAD_T + innerHeight - (value / yMax) * innerHeight;

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, idx) => {
    const value = (yMax / yTickCount) * idx;
    return { value: roundTick(value), y: yAt(value) };
  });

  const xTickCount = Math.min(7, Math.max(2, Math.floor(innerWidth / 110)));
  const xTicks = Array.from({ length: xTickCount }, (_, idx) => {
    const fraction = xTickCount === 1 ? 0 : idx / (xTickCount - 1);
    const dataIdx = Math.round(fraction * Math.max(0, length - 1));
    const ts = xs[dataIdx];
    return {
      x: PAD_L + fraction * innerWidth,
      label: typeof ts === "number" ? formatXTick(ts) : "",
    };
  });

  const medianPoints = pointsFor(
    xs,
    asSeries(data[PERCENTILE_INDEX.p50]),
    xAt,
    yAt,
  );
  const innerBandPath = bandPath(
    xs,
    asSeries(data[PERCENTILE_INDEX.p25]),
    asSeries(data[PERCENTILE_INDEX.p75]),
    xAt,
    yAt,
  );
  const outerBandPath = bandPath(
    xs,
    asSeries(data[PERCENTILE_INDEX.p10]),
    asSeries(data[PERCENTILE_INDEX.p90]),
    xAt,
    yAt,
  );

  return {
    xAt,
    yAt,
    yTicks,
    xTicks,
    innerBandPath,
    outerBandPath,
    medianPath: pathFromPoints(medianPoints),
    medianPoints,
  };
}

function pointsFor(
  xs: readonly number[],
  ys: Series,
  xAt: (idx: number) => number,
  yAt: (value: number) => number,
): Array<SeriesPoint | null> {
  const out: Array<SeriesPoint | null> = [];
  for (let idx = 0; idx < xs.length; idx++) {
    const y = ys[idx];
    if (typeof y !== "number" || !Number.isFinite(y)) {
      out.push(null);
    } else {
      out.push({ x: xAt(idx), y: yAt(y) });
    }
  }
  return out;
}

function pathFor(
  xs: readonly number[],
  ys: Series,
  xAt: (idx: number) => number,
  yAt: (value: number) => number,
): string | null {
  return pathFromPoints(pointsFor(xs, ys, xAt, yAt));
}

function pathFromPoints(points: Array<SeriesPoint | null>): string | null {
  const segments: string[] = [];
  let started = false;
  for (const point of points) {
    if (!point) {
      started = false;
      continue;
    }
    segments.push(
      `${started ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
    );
    started = true;
  }
  return segments.length > 0 ? segments.join(" ") : null;
}

function bandPath(
  xs: readonly number[],
  topYs: Series,
  bottomYs: Series,
  xAt: (idx: number) => number,
  yAt: (value: number) => number,
): string | null {
  const top = pointsFor(xs, topYs, xAt, yAt);
  const bottom = pointsFor(xs, bottomYs, xAt, yAt);
  const segments: string[] = [];
  let runStart = -1;

  for (let i = 0; i <= xs.length; i++) {
    const valid = i < xs.length && top[i] && bottom[i];
    if (valid && runStart === -1) runStart = i;
    if ((!valid || i === xs.length) && runStart !== -1) {
      const parts: string[] = [];
      for (let j = runStart; j < i; j++) {
        const p = top[j]!;
        parts.push(
          `${j === runStart ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`,
        );
      }
      for (let j = i - 1; j >= runStart; j--) {
        const p = bottom[j]!;
        parts.push(`L${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      parts.push("Z");
      segments.push(parts.join(" "));
      runStart = -1;
    }
  }
  return segments.length > 0 ? segments.join(" ") : null;
}

function numericAt(series: Series, index: number): number | null {
  const v = series[index];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function roundTick(value: number): number {
  if (value === 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value / magnitude) * magnitude;
}

function formatXTick(ts: number): string {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(5, 16).replace("T", " ");
}

function formatTooltipTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
}
