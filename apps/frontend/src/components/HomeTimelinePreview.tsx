import { useMemo } from "react";
import type uPlot from "uplot";

import { Chart } from "@/components/Chart";
import { mulberry32 } from "@/lib/rng";

// Falls back to a procedural shape when the real status feed has nothing
// to show — the home page does not block on R2 the way the dashboard does.
function generateEnvelope({
  points = 96,
  base = 540,
  seed = 11,
}: { points?: number; base?: number; seed?: number } = {}): uPlot.AlignedData {
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
  const data = useMemo(() => generateEnvelope({ seed: 11, base: 480 }), []);

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
          className="inline-flex h-9 items-center rounded-full border border-border bg-[var(--surface)] px-4 text-[12.5px] font-medium text-foreground transition-colors hover:bg-[var(--surface-2)]"
          href="/dashboard"
        >
          Open full dashboard →
        </a>
      </div>
      <Chart
        ariaLabel="24-hour envelope preview"
        data={data}
        primary="p50"
        envelope="neighbors"
      />
    </section>
  );
}
