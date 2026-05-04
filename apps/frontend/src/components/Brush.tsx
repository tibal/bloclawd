import { useCallback, useEffect, useRef, useState } from "react";
import type uPlot from "uplot";

import { PERCENTILE_INDEX } from "@/lib/chart-tokens";
import { Route } from "@/routes/dashboard";

const HEIGHT = 64;
const WIDTH_FALLBACK = 720;
const PAD_L = 56;
const PAD_R = 24;
const HANDLE_W = 8;
const TRACK_TOP = 6;

interface BrushProps {
  data: uPlot.AlignedData;
  start: number;
  end: number;
}

type Drag = "start" | "end" | "range" | null;

export function Brush({ data, start, end }: BrushProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = Route.useNavigate();
  const [width, setWidth] = useState(WIDTH_FALLBACK);
  const [dragKind, setDragKind] = useState<Drag>(null);
  const dragOffsetRef = useRef(0);

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

  const xs = (data[0] ?? []) as readonly number[];
  const p50 = (data[PERCENTILE_INDEX.p50] ?? []) as ReadonlyArray<number | null | undefined>;
  const innerWidth = Math.max(0, width - PAD_L - PAD_R);
  const innerHeight = HEIGHT - 14;

  let yMax = 0;
  for (const v of p50) {
    if (typeof v === "number" && Number.isFinite(v) && v > yMax) yMax = v;
  }
  yMax = (yMax || 1) * 1.1;

  const xAt = (idx: number) =>
    xs.length <= 1 ? PAD_L : PAD_L + (idx / (xs.length - 1)) * innerWidth;
  const yAt = (v: number) => TRACK_TOP + innerHeight - (v / yMax) * innerHeight;

  const path = pathFromSeries(xs, p50, xAt, yAt);
  const x0 = PAD_L + start * innerWidth;
  const x1 = PAD_L + end * innerWidth;

  const updateRange = useCallback(
    (next: { start?: number; end?: number }) => {
      void navigate({
        search: (prev) => {
          const merged = {
            ...prev,
            brush_start: clamp(next.start ?? prev.brush_start),
            brush_end: clamp(next.end ?? prev.brush_end),
          };
          if (merged.brush_end - merged.brush_start < 0.02) {
            // keep a minimum slice so the chart doesn't collapse
            return prev;
          }
          return merged;
        },
      });
    },
    [navigate],
  );

  const fractionFromEvent = useCallback(
    (clientX: number) => {
      const el = containerRef.current?.querySelector("svg");
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left - PAD_L;
      return clamp(x / innerWidth);
    },
    [innerWidth],
  );

  const onPointerDown =
    (kind: Drag) => (event: React.PointerEvent<SVGElement>) => {
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      setDragKind(kind);
      if (kind === "range") {
        const f = fractionFromEvent(event.clientX);
        dragOffsetRef.current = f - start;
      }
    };

  const onPointerMove = (event: React.PointerEvent<SVGElement>) => {
    if (!dragKind) return;
    const f = fractionFromEvent(event.clientX);
    if (dragKind === "start") {
      updateRange({ start: Math.min(f, end - 0.02) });
    } else if (dragKind === "end") {
      updateRange({ end: Math.max(f, start + 0.02) });
    } else if (dragKind === "range") {
      const span = end - start;
      const offset = dragOffsetRef.current;
      const nextStart = clamp(f - offset);
      updateRange({
        start: clamp(Math.min(nextStart, 1 - span)),
        end: clamp(Math.min(nextStart, 1 - span) + span),
      });
    }
  };

  const onPointerUp = () => setDragKind(null);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11.5px] text-muted-foreground">
          Drag handles to zoom · double-click to reset
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {(start * 100).toFixed(0)}% — {(end * 100).toFixed(0)}%
        </span>
      </div>
      <svg
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        style={{ display: "block" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => updateRange({ start: 0, end: 1 })}
      >
        <defs>
          <linearGradient id="brush-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {path ? (
          <>
            <path d={`${path} L${xAt(xs.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`} fill="url(#brush-fill)" />
            <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="1.2" />
          </>
        ) : null}

        {/* dim regions outside the brush */}
        <rect x={PAD_L} y={0} width={Math.max(0, x0 - PAD_L)} height={innerHeight + 12} fill="oklch(0.155 0.008 260 / 0.65)" />
        <rect x={x1} y={0} width={Math.max(0, PAD_L + innerWidth - x1)} height={innerHeight + 12} fill="oklch(0.155 0.008 260 / 0.65)" />

        {/* range hit area */}
        <rect
          x={x0}
          y={0}
          width={Math.max(0, x1 - x0)}
          height={innerHeight + 12}
          fill="transparent"
          style={{ cursor: "grab" }}
          onPointerDown={onPointerDown("range")}
        />

        {/* handle bars */}
        <line x1={x0} x2={x0} y1={0} y2={innerHeight + 8} stroke="oklch(0.85 0.05 258)" strokeWidth="1" />
        <line x1={x1} x2={x1} y1={0} y2={innerHeight + 8} stroke="oklch(0.85 0.05 258)" strokeWidth="1" />

        {/* draggable handles */}
        <rect
          x={x0 - HANDLE_W / 2}
          y={innerHeight / 2 - 7}
          width={HANDLE_W}
          height={14}
          rx="2"
          fill="oklch(0.30 0.012 260)"
          stroke="oklch(0.85 0.05 258)"
          strokeWidth="1"
          style={{ cursor: "ew-resize" }}
          onPointerDown={onPointerDown("start")}
        />
        <rect
          x={x1 - HANDLE_W / 2}
          y={innerHeight / 2 - 7}
          width={HANDLE_W}
          height={14}
          rx="2"
          fill="oklch(0.30 0.012 260)"
          stroke="oklch(0.85 0.05 258)"
          strokeWidth="1"
          style={{ cursor: "ew-resize" }}
          onPointerDown={onPointerDown("end")}
        />
      </svg>
    </div>
  );
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pathFromSeries(
  xs: readonly number[],
  ys: ReadonlyArray<number | null | undefined>,
  xAt: (idx: number) => number,
  yAt: (v: number) => number,
): string | null {
  const segs: string[] = [];
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      started = false;
      continue;
    }
    segs.push(`${started ? "L" : "M"}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`);
    started = true;
  }
  return segs.length > 0 ? segs.join(" ") : null;
}
