import { useEffect, useMemo, useRef, useState } from "react";

import type { PercentileKey } from "@/components/PercentilePicker";
import {
  asSeries,
  bandPath,
  pathFor,
  pathFromPoints,
  pointsFor,
  type Point,
  type Series,
} from "@/lib/chart-geometry";
import {
  type AlignedData,
  type ChartMeta,
} from "@/lib/chart-data";
import { PERCENTILE_INDEX } from "@/lib/chart-tokens";
import type { DistKey } from "@/lib/dashboard-search";
import { formatUsd } from "@/lib/format";

export interface ChartCurve {
  key: string;
  label: string;
  data: AlignedData;
}

export interface ChartProps {
  curves: ChartCurve[];
  primary?: PercentileKey;
  dist?: DistKey[];
  ariaLabel: string;
  meta?: ChartMeta;
  yLabel?: string;
}

const HEIGHT = 360;
const WIDTH_FALLBACK = 720;
const PAD_L = 56;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 36;

const RESOLUTION_LABEL: Record<NonNullable<ChartMeta["resolution"]>, string> = {
  q15: "15 min",
  h1: "1 hour",
  d1: "1 day",
};

// Curve palette used in compare mode (primary curve always uses --chart-1).
const CURVE_PALETTE: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--violet)",
  "var(--coral)",
  "var(--amber)",
];

export function Chart({
  curves,
  primary = "p50",
  dist = ["p10-p90", "p25-p75"],
  ariaLabel,
  meta,
  yLabel,
}: ChartProps) {
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

  const compareMode = curves.length > 1;

  const xs = useMemo(
    () => alignedXs(curves[0]?.data) as readonly number[],
    [curves],
  );

  const geometry = useMemo(
    () => buildGeometry({ curves, width, primary }),
    [curves, width, primary],
  );

  const innerWidth = Math.max(0, width - PAD_L - PAD_R);
  const innerHeight = Math.max(0, HEIGHT - PAD_T - PAD_B);

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

  const yLabelText =
    yLabel ??
    (meta?.resolution
      ? `USD · ${RESOLUTION_LABEL[meta.resolution]}`
      : "USD / window");

  const primaryCurve = curves[0];

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
        style={{ display: "block", overflow: "visible" }}
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

        <text
          fill="var(--muted-foreground)"
          fontFamily="var(--font-mono)"
          fontSize="10.5"
          x={PAD_L}
          y={PAD_T - 8}
        >
          {yLabelText}
        </text>

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
              {formatYTick(tick.value)}
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

        {/* Envelopes only render in single-curve mode; comparing multiple
            cohorts becomes unreadable with overlapping bands. */}
        {!compareMode && primaryCurve && dist.includes("p10-p90") &&
        geometry.outerBandPath ? (
          <path
            d={geometry.outerBandPath}
            data-band="p10-p90"
            fill="url(#bloclawd-band-outer)"
          />
        ) : null}
        {!compareMode && primaryCurve && dist.includes("p25-p75") &&
        geometry.innerBandPath ? (
          <path
            d={geometry.innerBandPath}
            data-band="p25-p75"
            fill="url(#bloclawd-band-inner)"
          />
        ) : null}

        {geometry.curveLines.map(({ key, path, color }) => (
          <path
            key={key}
            d={path}
            data-curve={key}
            fill="none"
            filter={curves.length === 1 ? "url(#bloclawd-line-glow)" : undefined}
            stroke={color}
            strokeLinecap="round"
            strokeWidth="2"
          />
        ))}

        {hoverIndex != null && geometry.crosshair ? (
          <line
            stroke="var(--chart-crosshair)"
            strokeDasharray="2 3"
            strokeOpacity="0.55"
            x1={geometry.crosshair.x}
            x2={geometry.crosshair.x}
            y1={PAD_T}
            y2={PAD_T + innerHeight}
          />
        ) : null}

        {hoverIndex != null
          ? geometry.curveLines.map(({ key, primaryPoints, color }) => {
              const pt = primaryPoints[hoverIndex];
              if (!pt) return null;
              return (
                <circle
                  key={`dot-${key}`}
                  cx={pt.x}
                  cy={pt.y}
                  fill="var(--bg)"
                  r="4"
                  stroke={color}
                  strokeWidth="1.5"
                />
              );
            })
          : null}

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

      <HoverTooltip
        curves={curves}
        primary={primary}
        compareMode={compareMode}
        dist={dist}
        hoverIndex={hoverIndex}
        meta={meta}
      />
    </div>
  );
}

function HoverTooltip({
  curves,
  primary,
  compareMode,
  dist,
  hoverIndex,
  meta,
}: {
  curves: ChartCurve[];
  primary: PercentileKey;
  compareMode: boolean;
  dist: DistKey[];
  hoverIndex: number | null;
  meta: ChartMeta | undefined;
}) {
  if (hoverIndex == null) return null;
  const xs = alignedXs(curves[0]?.data);
  const ts = xs[hoverIndex];
  if (typeof ts !== "number") return null;
  const submissions = meta?.submissions?.[hoverIndex] ?? null;

  return (
    <div className="pointer-events-none absolute left-20 top-5 min-w-[240px] rounded-xl border border-border bg-[var(--bg-2)]/95 p-3 shadow-[var(--shadow-card)] backdrop-blur-md">
      <div className="mb-2 font-mono text-[11px] text-muted-foreground">
        {formatTooltipTimestamp(ts, meta?.resolution)}
      </div>
      {compareMode ? (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
          {curves.map((curve, i) => {
            const value = numericAt(
              asSeries(curve.data[PERCENTILE_INDEX[primary]]),
              hoverIndex,
            );
            const color = CURVE_PALETTE[i % CURVE_PALETTE.length];
            return (
              <div key={curve.key} className="contents">
                <span className="flex min-w-0 items-center gap-2 truncate text-foreground">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-3 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="truncate">{curve.label}</span>
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {value == null ? "—" : formatUsd(value)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <SinglePercentileBlock
          curve={curves[0]}
          primary={primary}
          dist={dist}
          hoverIndex={hoverIndex}
        />
      )}
      {submissions != null ? (
        <div className="mt-2.5 border-t border-border/60 pt-2 font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground">
            {submissions.toLocaleString()}
          </span>{" "}
          submissions · k≥5
        </div>
      ) : null}
    </div>
  );
}

function SinglePercentileBlock({
  curve,
  primary,
  dist,
  hoverIndex,
}: {
  curve: ChartCurve | undefined;
  primary: PercentileKey;
  dist: DistKey[];
  hoverIndex: number;
}) {
  if (!curve) return null;
  const showOuter = dist.includes("p10-p90");
  const showInner = dist.includes("p25-p75");
  const orderedKeys: PercentileKey[] = [];
  if (showOuter) orderedKeys.push("p90");
  if (showInner) orderedKeys.push("p75");
  orderedKeys.push(primary);
  if (showInner && primary !== "p25") orderedKeys.push("p25");
  if (showOuter && primary !== "p10") orderedKeys.push("p10");

  const seen = new Set<PercentileKey>();
  const uniq = orderedKeys.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {uniq.map((key) => {
        const value = numericAt(
          asSeries(curve.data[PERCENTILE_INDEX[key]]),
          hoverIndex,
        );
        const isPrimary = key === primary;
        return (
          <div key={key} className="contents">
            <span
              className={
                isPrimary
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              }
            >
              {key}
            </span>
            <span
              className={
                isPrimary
                  ? "text-right font-mono font-semibold text-foreground tabular-nums"
                  : "text-right font-mono text-foreground/80 tabular-nums"
              }
            >
              {value == null ? "—" : formatUsd(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ChartGeometry {
  yTicks: Array<{ value: number; y: number }>;
  xTicks: Array<{ x: number; label: string }>;
  innerBandPath: string | null;
  outerBandPath: string | null;
  curveLines: Array<{
    key: string;
    path: string;
    color: string;
    primaryPoints: Array<Point | null>;
  }>;
  crosshair: { x: number } | null;
}

function buildGeometry({
  curves,
  width,
  primary,
}: {
  curves: ChartCurve[];
  width: number;
  primary: PercentileKey;
}): ChartGeometry {
  const xs = alignedXs(curves[0]?.data) as readonly number[];
  const innerWidth = Math.max(0, width - PAD_L - PAD_R);
  const innerHeight = Math.max(0, HEIGHT - PAD_T - PAD_B);
  const length = xs.length;

  const xAt = (idx: number) =>
    length <= 1 ? PAD_L : PAD_L + (idx / (length - 1)) * innerWidth;

  let rawMax = 0;
  for (const curve of curves) {
    for (const seriesIdx of [
      PERCENTILE_INDEX.p10,
      PERCENTILE_INDEX.p90,
      PERCENTILE_INDEX[primary],
    ]) {
      const series = asSeries(curve.data[seriesIdx]);
      for (let i = 0; i < series.length; i++) {
        const v = series[i];
        if (typeof v === "number" && Number.isFinite(v) && v > rawMax) {
          rawMax = v;
        }
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

  // Bands derived from the primary (first) curve in single-mode only;
  // hide them in compare so multiple bands don't muddy the picture.
  const primaryCurve = curves[0];
  const innerBandPath =
    primaryCurve && curves.length === 1
      ? bandPath(
          xs,
          asSeries(primaryCurve.data[PERCENTILE_INDEX.p25]),
          asSeries(primaryCurve.data[PERCENTILE_INDEX.p75]),
          xAt,
          yAt,
        )
      : null;
  const outerBandPath =
    primaryCurve && curves.length === 1
      ? bandPath(
          xs,
          asSeries(primaryCurve.data[PERCENTILE_INDEX.p10]),
          asSeries(primaryCurve.data[PERCENTILE_INDEX.p90]),
          xAt,
          yAt,
        )
      : null;

  const curveLines = curves
    .map((curve, i) => {
      const points = pointsFor(
        xs,
        asSeries(curve.data[PERCENTILE_INDEX[primary]]),
        xAt,
        yAt,
      );
      const path = pathFromPoints(points);
      if (!path) return null;
      return {
        key: curve.key,
        path,
        color: CURVE_PALETTE[i % CURVE_PALETTE.length]!,
        primaryPoints: points,
      };
    })
    .flatMap((curve) => (curve ? [curve] : []));

  return {
    yTicks,
    xTicks,
    innerBandPath,
    outerBandPath,
    curveLines,
    crosshair: null,
  };
}

function alignedXs(data: AlignedData | undefined): readonly number[] {
  return (data?.[0] ?? []) as readonly number[];
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

function formatYTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(value < 1 ? 2 : 0)}`;
}

function formatXTick(ts: number): string {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(5, 16).replace("T", " ");
}

function formatTooltipTimestamp(
  ts: number,
  resolution: ChartMeta["resolution"] | undefined,
): string {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  if (resolution === "d1") return `${iso.slice(0, 10)} UTC`;
  const startMin = iso.slice(11, 16);
  const stepMin = resolution === "q15" ? 15 : 60;
  const end = new Date(date.getTime() + stepMin * 60_000)
    .toISOString()
    .slice(11, 16);
  return `${iso.slice(0, 10)} · ${startMin} – ${end} UTC`;
}

// Backwards-compatible adapter so existing callers that hand a single
// AlignedData keep working.
export function singleCurveChart(
  data: AlignedData,
  label: string = "primary",
): ChartCurve {
  return { key: "primary", label, data };
}

// Re-export for callers used to import bandPath/etc. from this module.
export { bandPath, pathFor, pathFromPoints, pointsFor };
