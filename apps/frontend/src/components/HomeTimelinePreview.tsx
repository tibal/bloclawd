import { useMemo } from "react";

import { Chart } from "@/components/Chart";
import type { AlignedData } from "@/lib/chart-data";
import { useBuckets, useManifest } from "@/lib/r2";
import { mulberry32 } from "@/lib/rng";

// Procedural shape used as a last-resort fallback when the public dataset
// has no h1 buckets yet. The home page should never block on R2.
function generateEnvelope({
  points = 96,
  base = 540,
  seed = 11,
}: { points?: number; base?: number; seed?: number } = {}): AlignedData {
  const r = mulberry32(seed);
  const xs: number[] = [];
  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];
  const startSec = Math.floor(Date.now() / 1000) - 24 * 3600;
  for (let i = 0; i < points; i++) {
    const hour = (i / points) * 24;
    let activity = 0;
    for (const h of [11, 14, 17, 20]) {
      const d = Math.min(Math.abs(hour - h), 24 - Math.abs(hour - h));
      activity += Math.exp(-(d * d) / 4);
    }
    activity = 0.35 + activity * 0.55;
    const center = base * activity * (1 + (r() - 0.5) * 0.18);
    const spread = center * (0.5 + r() * 0.2);
    xs.push(startSec + i * (24 * 60));
    p50.push(center);
    p25.push(Math.max(20, center - spread * 0.45 * (0.85 + r() * 0.3)));
    p10.push(Math.max(10, center - spread * 0.85 * (0.85 + r() * 0.3)));
    p75.push(center + spread * 0.4 * (0.85 + r() * 0.3));
    p90.push(center + spread * 0.85 * (0.85 + r() * 0.3));
  }
  return [xs, p10, p25, p50, p75, p90];
}

export function HomeTimelinePreview() {
  const manifest = useManifest();
  const h1Paths = manifest.data?.tiers.h1 ?? [];
  const buckets = useBuckets("h1", h1Paths);
  const realData = useMemo(() => buildAlignedFromBuckets(buckets), [buckets]);
  const fallback = useMemo(() => generateEnvelope({ seed: 11, base: 480 }), []);
  const data = realData ?? fallback;

  return (
    <section
      aria-label="Live aggregate preview"
      className="surface-card relative overflow-hidden p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            Live aggregate · last 24h
          </div>
          <p className="font-mono text-[11.5px] text-muted-foreground">
            Claude Code · max20 · all regions · p25–p75 envelope
          </p>
        </div>
        <a
          className="inline-flex h-11 items-center rounded-full border border-border bg-[var(--surface)] px-4 text-[12.5px] font-medium text-foreground transition-colors hover:bg-[var(--surface-2)]"
          href="/dashboard"
        >
          Open full dashboard →
        </a>
      </div>
      <Chart
        ariaLabel="24-hour envelope preview"
        curves={[
          {
            key: "preview",
            label: "Claude Code · max20 · all regions",
            data,
          },
        ]}
        primary="p50"
        dist={["p10-p90", "p25-p75"]}
        meta={realData ? { resolution: "h1" } : undefined}
      />
    </section>
  );
}

function buildAlignedFromBuckets(
  buckets: ReturnType<typeof useBuckets>,
): AlignedData | null {
  type Row = { ts: number; p10: number; p25: number; p50: number; p75: number; p90: number };
  const rows: Row[] = [];

  for (const result of buckets) {
    const env = result.data;
    if (!env) continue;
    const cell = env.cells.find(
      (c) =>
        c.subscription_tier === "max20" &&
        c.harness === "claude-code" &&
        c.limit_type === "5h" &&
        !c.insufficient_data,
    );
    const pcts = cell?.api_cost_usd ?? null;
    if (!pcts) continue;
    rows.push({
      ts: Math.floor(new Date(env.bucket_ts).getTime() / 1000),
      ...pcts,
    });
  }

  if (rows.length === 0) return null;
  rows.sort((a, b) => a.ts - b.ts);
  return [
    rows.map((r) => r.ts),
    rows.map((r) => r.p10),
    rows.map((r) => r.p25),
    rows.map((r) => r.p50),
    rows.map((r) => r.p75),
    rows.map((r) => r.p90),
  ];
}
