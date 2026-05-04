// Dev-only R2 fixture. Builds a deterministic Manifest, three buckets per
// resolution (q15 / h1 / d1), and a healthy _status.json. Intercepted by
// `fetchR2` when `import.meta.env.DEV` is true so every R2-backed component
// (chart, KPIs, breakdown, mix, cost) renders against the same snapshot.

import type { Harness } from "@web/Harness";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
import type { Region } from "@web/Region";
import type { Tier } from "@web/Tier";
import type { TokenType } from "@web/TokenType";

import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  unifiedWeight,
} from "@/lib/model-catalog";
import { mulberry32 } from "@/lib/rng";
import type {
  BucketCell,
  BucketEnvelope,
  Manifest,
  ModelCell,
  PercentileEncoding,
  Percentiles,
  RepresentativeMixCell,
  StatusJson,
  Tier as ResTier,
  TokenTypeCell,
} from "@/lib/r2";

const TOKEN_TYPES: readonly TokenType[] = [
  "input",
  "output",
  "cached_read",
  "cached_write",
];
const REGIONS: readonly Region[] = ["NA", "EU", "AS", "SA", "OC"];
const TIERS: readonly Tier[] = ["pro", "max5", "max20"];
const HARNESSES: readonly Harness[] = ["claude-code", "codex"];
const LIMIT_TYPES: readonly LimitType[] = ["5h", "weekly"];

const TIER_BASELINE_TOKENS: Record<Tier, number> = {
  pro: 220_000,
  max5: 720_000,
  max20: 2_400_000,
};

type MixSeed = { model: Model; tokenType: TokenType; share: number };

const HARNESS_MIX: Record<Harness, readonly MixSeed[]> = {
  "claude-code": [
    { model: "claude-sonnet-4-5", tokenType: "input", share: 0.18 },
    { model: "claude-sonnet-4-5", tokenType: "output", share: 0.16 },
    { model: "claude-sonnet-4-5", tokenType: "cached_read", share: 0.14 },
    { model: "claude-sonnet-4-5", tokenType: "cached_write", share: 0.06 },
    { model: "claude-opus-4-7", tokenType: "input", share: 0.06 },
    { model: "claude-opus-4-7", tokenType: "output", share: 0.08 },
    { model: "claude-opus-4-7", tokenType: "cached_read", share: 0.05 },
    { model: "claude-opus-4-7", tokenType: "cached_write", share: 0.03 },
    { model: "claude-haiku-4-5", tokenType: "input", share: 0.06 },
    { model: "claude-haiku-4-5", tokenType: "output", share: 0.04 },
    { model: "claude-haiku-4-5", tokenType: "cached_read", share: 0.03 },
    { model: "claude-haiku-4-5", tokenType: "cached_write", share: 0.01 },
    { model: "claude-sonnet-4-6", tokenType: "input", share: 0.04 },
    { model: "claude-sonnet-4-6", tokenType: "output", share: 0.03 },
    { model: "claude-sonnet-4-6", tokenType: "cached_read", share: 0.02 },
    { model: "claude-sonnet-4-6", tokenType: "cached_write", share: 0.01 },
  ],
  codex: [
    { model: "gpt-5-codex", tokenType: "input", share: 0.20 },
    { model: "gpt-5-codex", tokenType: "output", share: 0.22 },
    { model: "gpt-5-codex", tokenType: "cached_read", share: 0.16 },
    { model: "gpt-5-codex", tokenType: "cached_write", share: 0.06 },
    { model: "gpt-5", tokenType: "input", share: 0.08 },
    { model: "gpt-5", tokenType: "output", share: 0.07 },
    { model: "gpt-5", tokenType: "cached_read", share: 0.05 },
    { model: "gpt-5", tokenType: "cached_write", share: 0.02 },
    { model: "gpt-5.5", tokenType: "input", share: 0.04 },
    { model: "gpt-5.5", tokenType: "output", share: 0.05 },
    { model: "gpt-5.5", tokenType: "cached_read", share: 0.03 },
    { model: "gpt-5.5", tokenType: "cached_write", share: 0.02 },
  ],
};

function pcts(center: number, spread: number): Percentiles {
  return {
    p10: Math.max(0, center - spread * 1.4),
    p25: Math.max(0, center - spread * 0.55),
    p50: Math.max(0, center),
    p75: center + spread * 0.55,
    p90: center + spread * 1.4,
  };
}

function bin(p: Percentiles): PercentileEncoding {
  return { Bin: p };
}

function modelsForHarness(harness: Harness): readonly Model[] {
  return harness === "claude-code" ? ANTHROPIC_MODELS : OPENAI_MODELS;
}

function buildMixCells(
  harness: Harness,
  rng: () => number,
): RepresentativeMixCell[] {
  return HARNESS_MIX[harness].map((seed) => {
    const jitter = 0.85 + rng() * 0.3;
    const center = seed.share * jitter;
    return {
      model: seed.model,
      token_type: seed.tokenType,
      share: bin(pcts(center, center * 0.35)),
    };
  });
}

function buildModelCells(
  harness: Harness,
  tier: Tier,
  rng: () => number,
): ModelCell[] {
  const baseline = TIER_BASELINE_TOKENS[tier];
  const mix = HARNESS_MIX[harness];
  const totals = new Map<Model, number>();
  for (const m of mix) totals.set(m.model, (totals.get(m.model) ?? 0) + m.share);

  return modelsForHarness(harness).map((model) => {
    const share = totals.get(model) ?? 0.02;
    const center = baseline / Math.max(0.05, share);
    const spread = center * (0.45 + rng() * 0.2);
    const tokens: TokenTypeCell[] = TOKEN_TYPES.map((tt) => {
      const w = unifiedWeight(model, tt);
      const tokenCenter = center / Math.max(0.05, w);
      const tokenSpread = tokenCenter * (0.4 + rng() * 0.25);
      const typeShareCenter =
        (mix.find((m) => m.model === model && m.tokenType === tt)?.share ?? 0) /
        Math.max(0.0001, share);
      return {
        token_type: tt,
        n_with_type: Math.round(40 + rng() * 80),
        tokens_to_limit_if_only: bin(pcts(tokenCenter, tokenSpread)),
        share: bin(
          pcts(typeShareCenter, Math.max(0.02, typeShareCenter * 0.3)),
        ),
      };
    });
    return {
      model,
      n_with_model: Math.max(5, Math.round(40 + share * 200 + rng() * 30)),
      weights: TOKEN_TYPES.map((tt) => unifiedWeight(model, tt)),
      weight_source: "cohort",
      tokens_to_limit_if_only: bin(pcts(center, spread)),
      tokens,
    };
  });
}

// Diurnal/weekly shape so chart curves are visibly different per timestamp
// and per resolution. Each bucket gets its own activity weight so consumers
// see a real timeline, not a flat line.
function activityWeight(timestampMs: number, resolution: ResTier): number {
  const date = new Date(timestampMs);
  if (resolution === "d1") {
    // Lower weekend, ramp into mid-week.
    const dow = date.getUTCDay();
    return 0.6 + 0.4 * Math.sin(((dow - 1) / 7) * Math.PI * 2);
  }
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  let activity = 0;
  for (const peak of [11, 14, 17, 20]) {
    const d = Math.min(Math.abs(hours - peak), 24 - Math.abs(hours - peak));
    activity += Math.exp(-(d * d) / 4);
  }
  return 0.45 + activity * 0.55;
}

function buildUnifiedCost(
  tier: Tier,
  weight: number,
  rng: () => number,
): PercentileEncoding {
  const center = TIER_BASELINE_TOKENS[tier] * 0.42 * weight;
  const spread = center * (0.35 + rng() * 0.2);
  return bin(pcts(center, spread));
}

function buildCells(
  bucketSeed: number,
  weight: number,
  resolution: ResTier,
): BucketCell[] {
  const cells: BucketCell[] = [];
  for (const tier of TIERS) {
    for (const harness of HARNESSES) {
      for (const region of REGIONS) {
        for (const limitType of LIMIT_TYPES) {
          const seed =
            bucketSeed +
            tier.length * 13 +
            harness.length * 7 +
            region.length * 5 +
            limitType.length;
          const rng = mulberry32(seed);
          const insufficient = rng() < 0.02;
          // Boost submissions on h1 (largest bucket) so daily-mode panels
          // hit k≥5 across most cells.
          const baseN = resolution === "d1" ? 220 : resolution === "h1" ? 80 : 22;
          cells.push({
            tier,
            harness,
            region,
            limit_type: limitType,
            n_submissions: insufficient
              ? 1
              : Math.round(baseN + rng() * baseN * 1.2),
            trim_rate: rng() * 0.04,
            trim_rate_alert: false,
            unified_cost: insufficient ? null : buildUnifiedCost(tier, weight, rng),
            models: insufficient ? [] : buildModelCells(harness, tier, rng),
            insufficient_data: insufficient,
            representative_mix: insufficient ? undefined : buildMixCells(harness, rng),
          });
        }
      }
    }
  }
  return cells;
}

// --- Path conventions match `pathTimestampMs` in dashboard-data.ts ---

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function q15PathFor(date: Date): string {
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(
    date.getUTCDate(),
  )}/${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}.json`;
}

function h1PathFor(date: Date): string {
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(
    date.getUTCDate(),
  )}/${pad(date.getUTCHours())}.json`;
}

function d1PathFor(date: Date): string {
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(
    date.getUTCDate(),
  )}.json`;
}

interface BucketSpec {
  resolution: ResTier;
  date: Date;
  path: string;
  seed: number;
}

function snapToQuarter(d: Date): Date {
  const out = new Date(d);
  out.setUTCSeconds(0, 0);
  out.setUTCMinutes(Math.floor(out.getUTCMinutes() / 15) * 15);
  return out;
}

function snapToHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCSeconds(0, 0);
  out.setUTCMinutes(0);
  return out;
}

function snapToDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

const FROZEN_NOW: Date | null = null;

function buildSpecs(): { manifest: Manifest; specs: BucketSpec[] } {
  const now = FROZEN_NOW ?? new Date();
  const q15Anchor = snapToQuarter(now);
  const h1Anchor = snapToHour(now);
  const d1Anchor = snapToDay(now);

  const specs: BucketSpec[] = [];
  // Three of each, oldest first so the manifest sort matches `pathsForWindow`.
  for (let i = 2; i >= 0; i--) {
    const date = new Date(q15Anchor.getTime() - i * 15 * 60 * 1000);
    specs.push({ resolution: "q15", date, path: q15PathFor(date), seed: 100 + i });
  }
  for (let i = 2; i >= 0; i--) {
    const date = new Date(h1Anchor.getTime() - i * 60 * 60 * 1000);
    specs.push({ resolution: "h1", date, path: h1PathFor(date), seed: 200 + i });
  }
  for (let i = 2; i >= 0; i--) {
    const date = new Date(d1Anchor.getTime() - i * 24 * 60 * 60 * 1000);
    specs.push({ resolution: "d1", date, path: d1PathFor(date), seed: 300 + i });
  }

  const manifest: Manifest = {
    schema_version: "v1",
    last_updated_ts: now.toISOString(),
    tiers: {
      q15: specs.filter((s) => s.resolution === "q15").map((s) => s.path),
      h1: specs.filter((s) => s.resolution === "h1").map((s) => s.path),
      d1: specs.filter((s) => s.resolution === "d1").map((s) => s.path),
    },
  };

  return { manifest, specs };
}

function buildBucket(spec: BucketSpec): BucketEnvelope {
  const weight = activityWeight(spec.date.getTime(), spec.resolution);
  return {
    schema_version: "v1",
    bucket_ts: spec.date.toISOString(),
    tier_resolution: spec.resolution,
    bin_edges: [
      0,
      1024,
      4096,
      16_384,
      65_536,
      262_144,
      1_048_576,
      Number.MAX_SAFE_INTEGER,
    ],
    cells: buildCells(spec.seed, weight, spec.resolution),
  };
}

function buildStatus(now: Date): StatusJson {
  return {
    schema_version: "v1",
    last_cron_success_ts: new Date(now.getTime() - 7 * 60 * 1000).toISOString(),
    last_cron_attempted_ts: new Date(now.getTime() - 60 * 1000).toISOString(),
    ingest_health: "healthy",
    total_events_lifetime: 184_032,
    approximate_contributors_30d: 612,
    approximate_contributors_window_days: 30,
  };
}

let cache:
  | {
      manifest: Manifest;
      status: StatusJson;
      buckets: Map<string, BucketEnvelope>;
    }
  | null = null;

function ensureCache() {
  if (cache) return cache;
  const { manifest, specs } = buildSpecs();
  const buckets = new Map<string, BucketEnvelope>();
  for (const spec of specs) {
    buckets.set(`${spec.resolution}/${spec.path}`, buildBucket(spec));
  }
  cache = {
    manifest,
    status: buildStatus(FROZEN_NOW ?? new Date()),
    buckets,
  };
  return cache;
}

const REPORT_PREFIX = "/reports/v1/";

// `url` may be same-origin (`/reports/v1/...`) or absolute. Strip everything
// up to and including `/reports/v1/`.
function reportSuffix(url: string): string | null {
  const idx = url.indexOf(REPORT_PREFIX);
  return idx === -1 ? null : url.slice(idx + REPORT_PREFIX.length);
}

export function isMockableUrl(url: string): boolean {
  return reportSuffix(url) !== null;
}

export function mockResponseFor(url: string): unknown | null {
  const suffix = reportSuffix(url);
  if (suffix === null) return null;
  const c = ensureCache();
  if (suffix === "manifest.json") return c.manifest;
  if (suffix === "_status.json") return c.status;
  // Bucket: `<tier>/<path>`.
  const stripped = suffix.replace(/^\/+/, "");
  const bucket = c.buckets.get(stripped);
  return bucket ?? null;
}
