// Gate via `import.meta.env.DEV` at the call site — these aggregates do
// not exist in production R2 yet, and the imports must tree-shake away
// from the prod bundle.

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
  ModelCell,
  Percentiles,
  PercentileEncoding,
  RepresentativeMixCell,
  TokenTypeCell,
} from "@/lib/r2";

const TOKEN_TYPES: readonly TokenType[] = [
  "input",
  "output",
  "cached_read",
  "cached_write",
];

function pcts(center: number, spread: number): Percentiles {
  return {
    p10: Math.max(0, center - spread * 1.4),
    p25: Math.max(0, center - spread * 0.55),
    p50: Math.max(0, center),
    p75: center + spread * 0.55,
    p90: center + spread * 1.4,
  };
}

function bin(percentiles: Percentiles): PercentileEncoding {
  return { Bin: percentiles };
}

const REGIONS: readonly Region[] = ["NA", "EU", "AS"];
const TIERS: readonly Tier[] = ["pro", "max5", "max20"];
const HARNESSES: readonly Harness[] = ["claude-code", "codex"];
const LIMIT_TYPES: readonly LimitType[] = ["5h", "weekly"];

const TIER_BASELINE_TOKENS: Record<Tier, number> = {
  pro: 220_000,
  max5: 720_000,
  max20: 2_400_000,
};

// Shares sum to ~1.0 per harness; real backend will derive these from
// submissions but the mock intentionally matches that constraint.
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
    const center = baseline / Math.max(0.05, share); // tokens-if-only inversely scales with share
    const spread = center * (0.45 + rng() * 0.2);
    const tokens: TokenTypeCell[] = TOKEN_TYPES.map((tt) => {
      // tokens-to-limit-if-only for a single token type: divide unified cost
      // budget by per-token unified weight. Cheaper tokens (cached_read)
      // give you many more tokens before hitting the same unified cost.
      const w = unifiedWeight(model, tt);
      const tokenCenter = center / Math.max(0.05, w);
      const tokenSpread = tokenCenter * (0.4 + rng() * 0.25);
      const typeShareCenter = (mix.find((m) => m.model === model && m.tokenType === tt)?.share ?? 0) / Math.max(0.0001, share);
      return {
        token_type: tt,
        n_with_type: Math.round(40 + rng() * 80),
        tokens_to_limit_if_only: bin(pcts(tokenCenter, tokenSpread)),
        share: bin(
          pcts(
            typeShareCenter,
            Math.max(0.02, typeShareCenter * 0.3),
          ),
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

function buildUnifiedCost(tier: Tier, rng: () => number): PercentileEncoding {
  // Unified cost is in "anchor-token equivalents" — roughly the count of
  // Opus 4.7 output tokens you'd have spent for the same dollar value at
  // API list price.
  const center = TIER_BASELINE_TOKENS[tier] * 0.42;
  const spread = center * (0.35 + rng() * 0.2);
  return bin(pcts(center, spread));
}

function buildCells(seed: number): BucketCell[] {
  const cells: BucketCell[] = [];
  for (const tier of TIERS) {
    for (const harness of HARNESSES) {
      for (const region of REGIONS) {
        for (const limitType of LIMIT_TYPES) {
          const rng = mulberry32(
            seed +
              tier.length * 13 +
              harness.length * 7 +
              region.length * 5 +
              limitType.length,
          );
          cells.push({
            tier,
            harness,
            region,
            limit_type: limitType,
            n_submissions: Math.round(60 + rng() * 240),
            trim_rate: rng() * 0.04,
            trim_rate_alert: false,
            unified_cost: buildUnifiedCost(tier, rng),
            models: buildModelCells(harness, tier, rng),
            insufficient_data: false,
            representative_mix: buildMixCells(harness, rng),
          });
        }
      }
    }
  }
  return cells;
}

export function mockLatestBucket(seed = 11): BucketEnvelope {
  return {
    schema_version: "v1",
    bucket_ts: new Date().toISOString(),
    tier_resolution: "h1",
    bin_edges: [0, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576, Number.MAX_SAFE_INTEGER],
    cells: buildCells(seed),
  };
}

export function pickCell(
  bucket: BucketEnvelope,
  match: Partial<Pick<BucketCell, "tier" | "harness" | "region" | "limit_type">>,
): BucketCell | null {
  return (
    bucket.cells.find(
      (cell) =>
        (match.tier == null || cell.tier === match.tier) &&
        (match.harness == null || cell.harness === match.harness) &&
        (match.region == null || cell.region === match.region) &&
        (match.limit_type == null || cell.limit_type === match.limit_type),
    ) ?? bucket.cells[0] ?? null
  );
}
