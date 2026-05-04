// Local replacement for `uPlot.AlignedData` — tuple of x timestamps + 5
// percentile rows. Aligned arrays are append-only at build time and treated
// as readonly downstream so the chart and brush can share a single object
// without defensive copies.

import { PERCENTILE_INDEX } from "@/lib/chart-tokens";

export type Series = ReadonlyArray<number | null | undefined>;

export type AlignedData = readonly [
  ReadonlyArray<number>,
  Series,
  Series,
  Series,
  Series,
  Series,
];

export const EMPTY_ALIGNED_DATA: AlignedData = [[], [], [], [], [], []];

export type ChartMeta = {
  // Per-bucket submission counts, parallel to `data[0]`. Optional — older
  // callers that don't yet wire the bucket-cell `n_submissions` can omit.
  submissions?: ReadonlyArray<number | null>;
  // Resolution of each bucket: drives x-axis tooltip range labelling.
  resolution?: "q15" | "h1" | "d1";
};

export function alignedDataHasValues(data: AlignedData | null): boolean {
  if (!data) return false;
  const p50 = data[PERCENTILE_INDEX.p50] ?? [];
  for (let i = 0; i < p50.length; i++) {
    const v = p50[i];
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

export function sliceByBrush(
  data: AlignedData,
  brush?: { start: number; end: number },
): AlignedData {
  const xs = data[0];
  if (!brush || xs.length === 0) return data;
  const lo = clamp(brush.start);
  const hi = clamp(brush.end);
  if (hi - lo > 0.999) return data;
  const startIdx = Math.max(0, Math.floor(lo * (xs.length - 1)));
  const endIdx = Math.min(xs.length, Math.ceil(hi * (xs.length - 1)) + 1);
  return data.map((row) => row.slice(startIdx, endIdx)) as unknown as AlignedData;
}

export function sliceMetaByBrush(
  meta: ChartMeta | undefined,
  xLength: number,
  brush?: { start: number; end: number },
): ChartMeta | undefined {
  if (!meta || !brush || xLength === 0 || !meta.submissions) return meta;
  const lo = clamp(brush.start);
  const hi = clamp(brush.end);
  if (hi - lo > 0.999) return meta;
  const startIdx = Math.max(0, Math.floor(lo * (xLength - 1)));
  const endIdx = Math.min(xLength, Math.ceil(hi * (xLength - 1)) + 1);
  return { ...meta, submissions: meta.submissions.slice(startIdx, endIdx) };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
