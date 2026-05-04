import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PERCENTILE_INDEX } from "@/lib/chart-tokens";
import { asSeries, pathFor } from "@/lib/chart-geometry";
import type { AlignedData } from "@/lib/chart-data";
import { Route } from "@/routes/dashboard";

const HEIGHT = 64;
const VBOX_WIDTH = 1200;
const PAD_L = 56;
const PAD_R = 24;
const HANDLE_W = 8;
const INNER_HEIGHT = HEIGHT - 14;
const INNER_WIDTH = VBOX_WIDTH - PAD_L - PAD_R;
const MIN_SPAN = 0.02;

interface BrushProps {
  data: AlignedData;
  start: number;
  end: number;
}

type DragKind = "start" | "end" | "range";
interface DragState {
  kind: DragKind;
  start: number;
  end: number;
  pointerOffset: number;
}

export function Brush({ data, start, end }: BrushProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const navigate = Route.useNavigate();
  const [drag, setDrag] = useState<DragState | null>(null);

  const xs = (data[0] ?? []) as readonly number[];
  const p50 = (data[PERCENTILE_INDEX.p50] ?? []) as ReadonlyArray<number | null | undefined>;

  const { path, yMaxFloor } = useMemo(() => buildPath(xs, p50), [xs, p50]);

  // While dragging we render against `drag.{start,end}` so motion stays
  // local; URL is committed on pointerup. When idle, fall back to props.
  const liveStart = drag?.start ?? start;
  const liveEnd = drag?.end ?? end;
  const x0 = PAD_L + liveStart * INNER_WIDTH;
  const x1 = PAD_L + liveEnd * INNER_WIDTH;

  const fractionFromEvent = useCallback((clientX: number) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const xPx = clientX - rect.left;
    // map DOM px back into viewBox space, then strip padding
    const viewX = (xPx / rect.width) * VBOX_WIDTH - PAD_L;
    return clamp(viewX / INNER_WIDTH);
  }, []);

  const commit = useCallback(
    (next: { start: number; end: number }) => {
      void navigate({
        search: (prev) =>
          prev.brush_start === next.start && prev.brush_end === next.end
            ? prev
            : { ...prev, brush_start: next.start, brush_end: next.end },
      });
    },
    [navigate],
  );

  const onPointerDown = (kind: DragKind) => (event: React.PointerEvent<SVGElement>) => {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const f = fractionFromEvent(event.clientX);
    setDrag({ kind, start, end, pointerOffset: f - start });
  };

  const onPointerMove = (event: React.PointerEvent<SVGElement>) => {
    if (!drag) return;
    const f = fractionFromEvent(event.clientX);
    const next = applyDrag(drag, f);
    setDrag(next);
  };

  const finishDrag = useCallback(() => {
    if (!drag) return;
    if (drag.end - drag.start >= MIN_SPAN) {
      commit({ start: drag.start, end: drag.end });
    }
    setDrag(null);
  }, [drag, commit]);

  // Safety: if the component unmounts mid-drag, drop the listener.
  useEffect(() => () => setDrag(null), []);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11.5px] text-muted-foreground">
          Drag handles to zoom · double-click to reset
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {(liveStart * 100).toFixed(0)}% — {(liveEnd * 100).toFixed(0)}%
        </span>
      </div>
      <svg
        ref={svgRef}
        height={HEIGHT}
        viewBox={`0 0 ${VBOX_WIDTH} ${HEIGHT}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={() => commit({ start: 0, end: 1 })}
      >
        <defs>
          <linearGradient id="brush-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {path ? (
          <>
            <path d={`${path} L${PAD_L + INNER_WIDTH},${yMaxFloor} L${PAD_L},${yMaxFloor} Z`} fill="url(#brush-fill)" />
            <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="1.2" />
          </>
        ) : null}

        <rect x={PAD_L} y={0} width={Math.max(0, x0 - PAD_L)} height={INNER_HEIGHT + 12} fill="oklch(0.155 0.008 260 / 0.65)" />
        <rect x={x1} y={0} width={Math.max(0, PAD_L + INNER_WIDTH - x1)} height={INNER_HEIGHT + 12} fill="oklch(0.155 0.008 260 / 0.65)" />

        <rect
          x={x0}
          y={0}
          width={Math.max(0, x1 - x0)}
          height={INNER_HEIGHT + 12}
          fill="transparent"
          style={{ cursor: "grab" }}
          onPointerDown={onPointerDown("range")}
        />

        <line x1={x0} x2={x0} y1={0} y2={INNER_HEIGHT + 8} stroke="oklch(0.85 0.05 258)" strokeWidth="1" />
        <line x1={x1} x2={x1} y1={0} y2={INNER_HEIGHT + 8} stroke="oklch(0.85 0.05 258)" strokeWidth="1" />

        <rect
          x={x0 - HANDLE_W / 2}
          y={INNER_HEIGHT / 2 - 7}
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
          y={INNER_HEIGHT / 2 - 7}
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

function applyDrag(drag: DragState, f: number): DragState {
  if (drag.kind === "start") {
    return { ...drag, start: Math.min(f, drag.end - MIN_SPAN) };
  }
  if (drag.kind === "end") {
    return { ...drag, end: Math.max(f, drag.start + MIN_SPAN) };
  }
  const span = drag.end - drag.start;
  const nextStart = clamp(Math.min(f - drag.pointerOffset, 1 - span));
  return { ...drag, start: nextStart, end: nextStart + span };
}

function buildPath(
  xs: readonly number[],
  p50: ReadonlyArray<number | null | undefined>,
): { path: string | null; yMaxFloor: number } {
  if (xs.length === 0) return { path: null, yMaxFloor: INNER_HEIGHT };
  let yMax = 0;
  for (const v of p50) {
    if (typeof v === "number" && Number.isFinite(v) && v > yMax) yMax = v;
  }
  yMax = (yMax || 1) * 1.1;
  const xAt = (idx: number) =>
    xs.length <= 1 ? PAD_L : PAD_L + (idx / (xs.length - 1)) * INNER_WIDTH;
  const yAt = (v: number) => 6 + INNER_HEIGHT - (v / yMax) * INNER_HEIGHT;
  return {
    path: pathFor(xs, asSeries(p50), xAt, yAt),
    yMaxFloor: yAt(0),
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
