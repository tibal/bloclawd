import type uPlot from "uplot";

export type Point = { x: number; y: number };
export type Series = ReadonlyArray<number | null | undefined>;

export function asSeries(values: uPlot.AlignedData[number] | undefined): Series {
  return (values ?? []) as Series;
}

export function pointsFor(
  xs: readonly number[],
  ys: Series,
  xAt: (idx: number) => number,
  yAt: (value: number) => number,
): Array<Point | null> {
  const out: Array<Point | null> = [];
  for (let idx = 0; idx < xs.length; idx++) {
    const y = ys[idx];
    out.push(
      typeof y !== "number" || !Number.isFinite(y)
        ? null
        : { x: xAt(idx), y: yAt(y) },
    );
  }
  return out;
}

export function pathFromPoints(points: Array<Point | null>): string | null {
  const segments: string[] = [];
  let started = false;
  for (const p of points) {
    if (!p) {
      started = false;
      continue;
    }
    segments.push(`${started ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    started = true;
  }
  return segments.length > 0 ? segments.join(" ") : null;
}

export function pathFor(
  xs: readonly number[],
  ys: Series,
  xAt: (idx: number) => number,
  yAt: (value: number) => number,
): string | null {
  return pathFromPoints(pointsFor(xs, ys, xAt, yAt));
}

export function bandPath(
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
