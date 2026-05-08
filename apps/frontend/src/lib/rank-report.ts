import type { Harness } from "@web/Harness";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
import type { Region } from "@web/Region";
import type { Tier } from "@web/Tier";
import type { TokenMixTotals } from "@web/TokenMixTotals";
import type { TokenType } from "@web/TokenType";

import {
  CATALOG,
  HARNESS_VALUES,
  LIMIT_TYPE_VALUES,
  MODEL_VALUES,
  REGION_VALUES,
  TIER_VALUES,
  modelInfo,
} from "@/lib/catalog";
import type { AggregatedCohortCell } from "@/lib/cohort";
import {
  TOKEN_MIX_FIELD_LABEL,
  TOKEN_MIX_FIELD_VALUES,
  type TokenMixField,
} from "@/lib/model-catalog";

export const RANK_SHARE_PARAM = "s" as const;
export const CAVEMAN_URL = "https://github.com/JuliusBrussee/caveman" as const;
export const CAVEMAN_STACK_URL = "https://www.getcaveman.dev/" as const;
export const RTK_URL = "https://github.com/rtk-ai/rtk" as const;
export const RTK_DOCS_URL = "https://www.rtk-ai.app/" as const;

export type RankModel = {
  model: Model;
  tokens: TokenMixTotals;
};

export type RankReport = {
  bloclawd_rank_v: 1;
  harness: Harness;
  tier: Tier;
  region: Region;
  limit_type: LimitType;
  models: RankModel[];
};

export type ShareEntry = {
  id: string;
  label: string;
  value: number;
  share: number;
};

export type Recommendation = {
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

export type RankAnalysis = {
  apiCostUsd: number;
  rawTokens: number;
  medianCostUsd: number | null;
  ratioToMedian: number | null;
  ratioLabel: string;
  segment: string;
  segmentId:
    | "lowest"
    | "low"
    | "below-median"
    | "above-median"
    | "high"
    | "top";
  percentileLabel: string;
  profile: string;
  profileBlurb: string;
  topModel: string;
  tokenEntries: ShareEntry[];
  cohortTokenEntries: ShareEntry[];
  modelEntries: ShareEntry[];
  cohortModelEntries: ShareEntry[];
  recommendations: Recommendation[];
  shareTitle: string;
  shareDescription: string;
};

type PackedReport = {
  v: 1;
  h: Harness;
  t: Tier;
  r: Region;
  l: LimitType;
  m: Array<[Model, number, number, number, number, number, number, number]>;
};

const ZERO_TOKENS: TokenMixTotals = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  ephemeral_5m_input_tokens: 0,
  ephemeral_1h_input_tokens: 0,
  cached_input_tokens: 0,
  reasoning_output_tokens: 0,
};

const PACKED_FIELD_ORDER = TOKEN_MIX_FIELD_VALUES;

export function parseRankInput(input: string): RankReport {
  const candidates = jsonCandidates(input);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const report = normalizeRankValue(parsed);
      if (report) return report;
    } catch {
      // Continue scanning; pasted terminals often include prose around JSON.
    }
  }
  throw new Error("Paste a bloclawd rank block, dry-run JSON, or event payload.");
}

export function encodeRankReport(report: RankReport): string {
  const packed: PackedReport = {
    v: 1,
    h: report.harness,
    t: report.tier,
    r: report.region,
    l: report.limit_type,
    m: report.models.map((entry) => [
      entry.model,
      entry.tokens.input_tokens,
      entry.tokens.output_tokens,
      entry.tokens.cache_read_input_tokens,
      entry.tokens.ephemeral_5m_input_tokens,
      entry.tokens.ephemeral_1h_input_tokens,
      entry.tokens.cached_input_tokens,
      entry.tokens.reasoning_output_tokens,
    ]),
  };
  return base64UrlEncode(JSON.stringify(packed));
}

export function decodeRankReport(snapshot: string | undefined): RankReport | null {
  if (!snapshot) return null;
  try {
    const packed = JSON.parse(base64UrlDecode(snapshot)) as unknown;
    if (!isObject(packed)) return null;
    if (packed.v !== 1 || !Array.isArray(packed.m)) return null;
    const harness = asHarness(packed.h);
    const tier = asTier(packed.t);
    const region = asRegion(packed.r);
    const limitType = asLimitType(packed.l);
    if (!harness || !tier || !region || !limitType) return null;
    const models = packed.m.flatMap((row): RankModel[] => {
      if (!Array.isArray(row) || row.length !== 8) return [];
      const model = asModel(row[0]);
      if (!model) return [];
      const tokens = tokensFromPacked(row.slice(1));
      return tokens ? [{ model, tokens }] : [];
    });
    if (models.length === 0) return null;
    return normalizeReport({
      bloclawd_rank_v: 1,
      harness,
      tier,
      region,
      limit_type: limitType,
      models,
    });
  } catch {
    return null;
  }
}

export function analyzeRankReport(
  report: RankReport,
  cohort: AggregatedCohortCell | null,
): RankAnalysis {
  const apiCostUsd = apiCostForReport(report);
  const rawTokens = totalTokens(report.models.map((entry) => entry.tokens));
  const percentiles = cohort?.api_cost_usd ?? null;
  const medianCostUsd = percentiles?.p50 ?? null;
  const ratioToMedian =
    medianCostUsd && medianCostUsd > 0 ? apiCostUsd / medianCostUsd : null;
  const segment = segmentFor(apiCostUsd, percentiles);
  const tokenEntries = tokenShareEntries(
    totalsByToken(report.models.map((entry) => entry.tokens)),
  );
  const cohortTokenEntries = tokenShareEntries(
    totalsByToken(cohort?.typical_mix.map((entry) => entry.tokens) ?? []),
  );
  const modelEntries = modelShareEntries(report.models);
  const cohortModelEntries = modelShareEntries(cohort?.typical_mix ?? []);
  const profile = profileFor(tokenEntries, modelEntries);
  const topModel = modelEntries[0]?.label ?? "mixed models";
  const recommendations = recommendationsFor(
    report,
    apiCostUsd,
    tokenEntries,
    cohortTokenEntries,
  );
  const ratioLabel = ratioLabelFor(ratioToMedian);
  const shareTitle =
    ratioToMedian == null
      ? `${profile.title} · bloclawd rank card`
      : `${profile.title} · ${ratioLabel}`;

  return {
    apiCostUsd,
    rawTokens,
    medianCostUsd,
    ratioToMedian,
    ratioLabel,
    segment: segment.segment,
    segmentId: segment.segmentId,
    percentileLabel: segment.percentileLabel,
    profile: profile.title,
    profileBlurb: profile.blurb,
    topModel,
    tokenEntries,
    cohortTokenEntries,
    modelEntries,
    cohortModelEntries,
    recommendations,
    shareTitle,
    shareDescription:
      medianCostUsd == null
        ? `My ${report.harness} ${report.limit_type} limit card: ${formatCost(
            apiCostUsd,
          )} API-equivalent across ${topModel}.`
        : `My ${report.harness} ${report.limit_type} limit card landed ${ratioLabel} at ${formatCost(
            apiCostUsd,
          )} API-equivalent.`,
  };
}

export function apiCostForReport(report: RankReport): number {
  return report.models.reduce(
    (sum, entry) => sum + apiCostForModelTokens(entry.model, entry.tokens),
    0,
  );
}

export function apiCostForModelTokens(
  model: Model,
  tokens: TokenMixTotals,
): number {
  const info = modelInfo(model);
  return TOKEN_MIX_FIELD_VALUES.reduce((sum, field) => {
    const price =
      info.prices.find((entry) => entry.token_type === field)?.usd_per_token ??
      0;
    return sum + tokens[field] * price;
  }, 0);
}

export function compactMetaParams(analysis: RankAnalysis) {
  return {
    profile: analysis.profile,
    ratio: analysis.ratioToMedian?.toFixed(2),
    cost: analysis.apiCostUsd.toFixed(2),
    seg: analysis.segmentId,
  };
}

function normalizeRankValue(value: unknown): RankReport | null {
  if (Array.isArray(value)) return normalizeSubmittedEvents(value);
  if (!isObject(value)) return null;
  if (Array.isArray(value.requests)) {
    return normalizeSubmittedEvents(value.requests);
  }
  if (isObject(value.payload) && value.limit_type) {
    return normalizeSubmittedEvents([value]);
  }
  if (value.bloclawd_rank_v === 1 && Array.isArray(value.models)) {
    const harness = asHarness(value.harness);
    const tier = asTier(value.tier);
    const region = asRegion(value.region);
    const limitType = asLimitType(value.limit_type);
    if (!harness || !tier || !region || !limitType) return null;
    const models = value.models.flatMap((entry): RankModel[] => {
      if (!isObject(entry)) return [];
      const model = asModel(entry.model);
      const tokens = normalizeTokens(entry.tokens);
      return model && tokens ? [{ model, tokens }] : [];
    });
    if (models.length === 0) return null;
    return normalizeReport({
      bloclawd_rank_v: 1,
      harness,
      tier,
      region,
      limit_type: limitType,
      models,
    });
  }
  const model = asModel(value.model);
  const tokens = normalizeTokens(value.tokens);
  const harness = asHarness(value.harness);
  const tier = asTier(value.tier);
  const region = asRegion(value.region);
  const limitType = asLimitType(value.limit_type);
  if (model && tokens && harness && tier && region && limitType) {
    return normalizeReport({
      bloclawd_rank_v: 1,
      harness,
      tier,
      region,
      limit_type: limitType,
      models: [{ model, tokens }],
    });
  }
  return null;
}

function normalizeSubmittedEvents(value: unknown[]): RankReport | null {
  const rows = value.flatMap((entry): Array<{
    harness: Harness;
    tier: Tier;
    region: Region;
    limitType: LimitType;
    model: Model;
    tokens: TokenMixTotals;
  }> => {
    if (!isObject(entry) || !isObject(entry.payload)) return [];
    const harness = asHarness(entry.payload.harness);
    const tier = asTier(entry.payload.tier);
    const region = asRegion(entry.payload.region);
    const limitType = asLimitType(entry.limit_type);
    const model = asModel(entry.payload.model);
    const tokens = normalizeTokens(entry.payload.tokens);
    return harness && tier && region && limitType && model && tokens
      ? [{ harness, tier, region, limitType, model, tokens }]
      : [];
  });
  const first = rows[0];
  if (!first) return null;
  return normalizeReport({
    bloclawd_rank_v: 1,
    harness: first.harness,
    tier: first.tier,
    region: first.region,
    limit_type: first.limitType,
    models: rows
      .filter(
        (row) =>
          row.harness === first.harness &&
          row.tier === first.tier &&
          row.region === first.region &&
          row.limitType === first.limitType,
      )
      .map((row) => ({ model: row.model, tokens: row.tokens })),
  });
}

function normalizeReport(report: RankReport): RankReport {
  const merged = new Map<Model, TokenMixTotals>();
  for (const entry of report.models) {
    const current = merged.get(entry.model) ?? { ...ZERO_TOKENS };
    for (const field of TOKEN_MIX_FIELD_VALUES) {
      current[field] += entry.tokens[field];
    }
    merged.set(entry.model, current);
  }
  const models = CATALOG.models.flatMap((info) => {
    const tokens = merged.get(info.model);
    return tokens && totalTokens([tokens]) > 0
      ? [{ model: info.model, tokens }]
      : [];
  });
  return { ...report, models };
}

function normalizeTokens(value: unknown): TokenMixTotals | null {
  if (!isObject(value)) return null;
  const tokens = { ...ZERO_TOKENS };
  for (const field of TOKEN_MIX_FIELD_VALUES) {
    const raw = value[field];
    const num = typeof raw === "number" ? raw : raw == null ? 0 : NaN;
    if (!Number.isFinite(num) || num < 0) return null;
    tokens[field] = num;
  }
  return totalTokens([tokens]) > 0 ? tokens : null;
}

function tokensFromPacked(value: unknown[]): TokenMixTotals | null {
  const tokens = { ...ZERO_TOKENS };
  for (let index = 0; index < PACKED_FIELD_ORDER.length; index++) {
    const raw = value[index];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return null;
    }
    tokens[PACKED_FIELD_ORDER[index]!] = raw;
  }
  return totalTokens([tokens]) > 0 ? tokens : null;
}

function jsonCandidates(input: string): string[] {
  const trimmed = input.trim();
  const marker = blockBetween(
    input,
    "--- bloclawd rank input ---",
    "--- end bloclawd rank input ---",
  );
  const candidates = [marker, trimmed].filter(Boolean) as string[];
  const starts: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "{" || input[i] === "[") starts.push(i);
  }
  for (const start of starts) {
    const block = balancedJsonAt(input, start);
    if (block) candidates.push(block);
  }
  return Array.from(new Set(candidates));
}

function blockBetween(input: string, start: string, end: string): string | null {
  const startIndex = input.indexOf(start);
  if (startIndex === -1) return null;
  const bodyStart = startIndex + start.length;
  const endIndex = input.indexOf(end, bodyStart);
  if (endIndex === -1) return null;
  return input.slice(bodyStart, endIndex).trim();
}

function balancedJsonAt(input: string, start: number): string | null {
  const open = input[start];
  if (open !== "{" && open !== "[") return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function tokenShareEntries(totals: TokenMixTotals): ShareEntry[] {
  const entries = TOKEN_MIX_FIELD_VALUES.map((field) => ({
    id: field,
    label: TOKEN_MIX_FIELD_LABEL[field],
    value: totals[field],
    share: 0,
  })).filter((entry) => entry.value > 0);
  const sum = entries.reduce((total, entry) => total + entry.value, 0);
  return entries.map((entry) => ({
    ...entry,
    share: sum > 0 ? entry.value / sum : 0,
  }));
}

function modelShareEntries(models: readonly RankModel[]): ShareEntry[] {
  const values = models
    .map((entry) => ({
      id: entry.model,
      label: modelInfo(entry.model).display_name,
      value: apiCostForModelTokens(entry.model, entry.tokens),
      share: 0,
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  const sum = values.reduce((total, entry) => total + entry.value, 0);
  return values.map((entry) => ({
    ...entry,
    share: sum > 0 ? entry.value / sum : 0,
  }));
}

function totalsByToken(values: readonly TokenMixTotals[]): TokenMixTotals {
  const totals = { ...ZERO_TOKENS };
  for (const value of values) {
    for (const field of TOKEN_MIX_FIELD_VALUES) {
      totals[field] += value[field];
    }
  }
  return totals;
}

function totalTokens(values: readonly TokenMixTotals[]): number {
  return values.reduce(
    (sum, tokens) =>
      sum +
      TOKEN_MIX_FIELD_VALUES.reduce((inner, field) => inner + tokens[field], 0),
    0,
  );
}

function segmentFor(
  cost: number,
  p: AggregatedCohortCell["api_cost_usd"] | null,
): Pick<RankAnalysis, "segment" | "segmentId" | "percentileLabel"> {
  if (!p) {
    return {
      segment: "Unscored cohort",
      segmentId: "below-median",
      percentileLabel: "Waiting for public cohort data",
    };
  }
  if (cost < p.p10) {
    return {
      segment: "Early wall",
      segmentId: "lowest",
      percentileLabel: "Below p10",
    };
  }
  if (cost < p.p25) {
    return {
      segment: "Thin headroom",
      segmentId: "low",
      percentileLabel: "p10-p25",
    };
  }
  if (cost < p.p50) {
    return {
      segment: "Below-median headroom",
      segmentId: "below-median",
      percentileLabel: "p25-p50",
    };
  }
  if (cost < p.p75) {
    return {
      segment: "Above-median headroom",
      segmentId: "above-median",
      percentileLabel: "p50-p75",
    };
  }
  if (cost < p.p90) {
    return {
      segment: "Heavy headroom",
      segmentId: "high",
      percentileLabel: "p75-p90",
    };
  }
  return {
    segment: "Top-decile limit",
    segmentId: "top",
    percentileLabel: "Above p90",
  };
}

function profileFor(
  tokenEntries: ShareEntry[],
  modelEntries: ShareEntry[],
): { title: string; blurb: string } {
  const share = (field: TokenMixField) =>
    tokenEntries.find((entry) => entry.id === field)?.share ?? 0;
  const cacheShare =
    share("cache_read_input_tokens") +
    share("cached_input_tokens") +
    share("ephemeral_5m_input_tokens") +
    share("ephemeral_1h_input_tokens");
  const outputShare = share("output_tokens") + share("reasoning_output_tokens");
  const inputShare = share("input_tokens");
  const topModel = modelEntries[0];

  if (cacheShare >= 0.45) {
    return {
      title: "Cache Stacker",
      blurb:
        "Your profile is dominated by cached and cache-created context. That is usually healthier than raw prompt churn, but cache misses still hurt.",
    };
  }
  if (outputShare >= 0.36) {
    return {
      title: "Output Spender",
      blurb:
        "A large share of the run is generated output. Shorter agent replies and tighter review loops should move this profile fastest.",
    };
  }
  if (topModel && topModel.share >= 0.6) {
    return {
      title: "Premium Model Loyalist",
      blurb: `${topModel.label} carries most of the API-equivalent cost. Model routing matters more than micro-optimizing prompts here.`,
    };
  }
  if (inputShare >= 0.55) {
    return {
      title: "Context Hauler",
      blurb:
        "Most of the weight is input context. Tool output filtering and smaller persistent instructions should buy room before another tier upgrade.",
    };
  }
  return {
    title: "Balanced Grinder",
    blurb:
      "No single token class dominates. Your next win probably comes from workflow discipline: smaller turns, cleaner context, and model routing.",
  };
}

function recommendationsFor(
  report: RankReport,
  apiCostUsd: number,
  tokenEntries: ShareEntry[],
  cohortTokenEntries: ShareEntry[],
): Recommendation[] {
  const tokenShare = (entries: ShareEntry[], id: string) =>
    entries.find((entry) => entry.id === id)?.share ?? 0;
  const outputShare =
    tokenShare(tokenEntries, "output_tokens") +
    tokenShare(tokenEntries, "reasoning_output_tokens");
  const cohortOutputShare =
    tokenShare(cohortTokenEntries, "output_tokens") +
    tokenShare(cohortTokenEntries, "reasoning_output_tokens");
  const costShares = costShareByToken(report, apiCostUsd);
  const outputCostShare =
    costShares.output_tokens + costShares.reasoning_output_tokens;
  const inputLikeCostShare =
    costShares.input_tokens +
    costShares.cache_read_input_tokens +
    costShares.cached_input_tokens +
    costShares.ephemeral_5m_input_tokens +
    costShares.ephemeral_1h_input_tokens;
  const recommendations: Recommendation[] = [];

  if (outputShare >= 0.28 || outputShare > cohortOutputShare + 0.12) {
    recommendations.push({
      title: `Caveman target: ${formatPercent(outputShare)} output-heavy`,
      body: `If terse agent output trims 25% of output-style tokens, this exact token shape drops about ${formatPercent(
        outputCostShare * 0.25,
      )} in API-equivalent cost.`,
      href: CAVEMAN_URL,
      cta: "Open Caveman",
    });
  } else {
    recommendations.push({
      title: "Caveman is still worth testing",
      body:
        "Your output share is not the main leak, but compressed replies can keep long sessions cleaner and easier to share.",
      href: CAVEMAN_STACK_URL,
      cta: "View Caveman stack",
    });
  }

  if (inputLikeCostShare >= 0.55) {
    recommendations.push({
      title: `RTK target: ${formatPercent(inputLikeCostShare)} input/cache-like cost`,
      body: `If command output filtering removes 30% of input-like context before it reaches the model, the arithmetic win is roughly ${formatPercent(
        inputLikeCostShare * 0.3,
      )} on this card.`,
      href: RTK_URL,
      cta: "Open RTK",
    });
  } else {
    recommendations.push({
      title: "RTK keeps the terminal quiet",
      body:
        "Your card is not pure input bloat, but filtered shell output is still the cheapest way to stop accidental context inflation.",
      href: RTK_DOCS_URL,
      cta: "Read RTK docs",
    });
  }

  const swap = bestPriceSheetSwap(report, apiCostUsd);
  if (swap && swap.savings >= 0.1) {
    recommendations.push({
      title: `${swap.modelLabel} price math: ${formatPercent(swap.savings)} lower`,
      body:
        "This is API-price arithmetic on the same token counts, not a quality promise. It is useful when part of the task can survive a cheaper model.",
    });
  }

  return recommendations.slice(0, 3);
}

function costShareByToken(
  report: RankReport,
  totalCost: number,
): Record<TokenMixField, number> {
  const out = TOKEN_MIX_FIELD_VALUES.reduce(
    (acc, field) => ({ ...acc, [field]: 0 }),
    {} as Record<TokenMixField, number>,
  );
  if (totalCost <= 0) return out;
  for (const entry of report.models) {
    const info = modelInfo(entry.model);
    for (const field of TOKEN_MIX_FIELD_VALUES) {
      const price =
        info.prices.find((point) => point.token_type === field)?.usd_per_token ??
        0;
      out[field] += (entry.tokens[field] * price) / totalCost;
    }
  }
  return out;
}

function bestPriceSheetSwap(
  report: RankReport,
  currentCost: number,
): { modelLabel: string; savings: number } | null {
  if (currentCost <= 0) return null;
  const totals = totalsByToken(report.models.map((entry) => entry.tokens));
  const currentModels = new Set(report.models.map((entry) => entry.model));
  let best: { model: Model; cost: number } | null = null;
  for (const candidate of CATALOG.models) {
    if (currentModels.has(candidate.model)) continue;
    const cost = apiCostForModelTokens(candidate.model, totals);
    if (!best || cost < best.cost) best = { model: candidate.model, cost };
  }
  if (!best || best.cost >= currentCost) return null;
  return {
    modelLabel: modelInfo(best.model).display_name,
    savings: (currentCost - best.cost) / currentCost,
  };
}

function ratioLabelFor(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "median unavailable";
  if (ratio >= 1) return `${ratio.toFixed(2)}x median headroom`;
  return `${(1 / ratio).toFixed(2)}x less than median`;
}

function asModel(value: unknown): Model | null {
  return MODEL_VALUES.includes(value as Model) ? (value as Model) : null;
}

function asHarness(value: unknown): Harness | null {
  return HARNESS_VALUES.includes(value as Harness) ? (value as Harness) : null;
}

function asTier(value: unknown): Tier | null {
  return TIER_VALUES.includes(value as Tier) ? (value as Tier) : null;
}

function asRegion(value: unknown): Region | null {
  return REGION_VALUES.includes(value as Region) ? (value as Region) : null;
}

function asLimitType(value: unknown): LimitType | null {
  return LIMIT_TYPE_VALUES.includes(value as LimitType)
    ? (value as LimitType)
    : null;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCost(value: number): string {
  return `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

export function tokenTypeLabel(tokenType: TokenType): string {
  return TOKEN_MIX_FIELD_LABEL[tokenType];
}
