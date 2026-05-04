// SSOT mirror.
// Source: crates/event-schema/src/model_prices.rs + crates/event-schema/src/enums.rs.
// Update both when adding/changing models, prices, or harness mappings.

import type { Harness } from "@web/Harness";
import type { Model } from "@web/Model";
import type { TokenType } from "@web/TokenType";

export type ProviderId = "anthropic" | "openai";

export const ANTHROPIC_MODELS: readonly Model[] = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
];

export const OPENAI_MODELS: readonly Model[] = [
  "gpt-5",
  "gpt-5.5",
  "gpt-5-codex",
];

export function providerForModel(model: Model): ProviderId {
  return ANTHROPIC_MODELS.includes(model) ? "anthropic" : "openai";
}

export function harnessForProvider(provider: ProviderId): Harness {
  return provider === "anthropic" ? "claude-code" : "codex";
}

export function providerForHarness(harness: Harness): ProviderId {
  return harness === "claude-code" ? "anthropic" : "openai";
}

// USD per token. Mirror of MODEL_PRICES (5h window) in
// crates/event-schema/src/model_prices.rs.
export const PRICE_PER_TOKEN_USD: Record<
  Model,
  Record<TokenType, number>
> = {
  "claude-opus-4-7": {
    input: 5e-6,
    output: 25e-6,
    cached_read: 0.5e-6,
    cached_write: 6.25e-6,
  },
  "claude-sonnet-4-6": {
    input: 3e-6,
    output: 15e-6,
    cached_read: 0.3e-6,
    cached_write: 3.75e-6,
  },
  "claude-sonnet-4-5": {
    input: 3e-6,
    output: 15e-6,
    cached_read: 0.3e-6,
    cached_write: 3.75e-6,
  },
  "claude-haiku-4-5": {
    input: 1e-6,
    output: 5e-6,
    cached_read: 0.1e-6,
    cached_write: 1.25e-6,
  },
  "gpt-5": {
    input: 1.25e-6,
    output: 10e-6,
    cached_read: 0.125e-6,
    cached_write: 1.25e-6,
  },
  "gpt-5.5": {
    input: 5e-6,
    output: 30e-6,
    cached_read: 0.5e-6,
    cached_write: 5e-6,
  },
  "gpt-5-codex": {
    input: 1.25e-6,
    output: 10e-6,
    cached_read: 0.125e-6,
    cached_write: 1.25e-6,
  },
};

// Per-tier subscription monthly USD cost. Used by CostEquivalentPanel to
// compute "you'd pay $X via API for this typical 5h burn vs your $Y
// fraction-of-subscription".
export const TIER_PRICE_USD: Record<"pro" | "max5" | "max20", number> = {
  pro: 20,
  max5: 100,
  max20: 200,
};

// Cross-provider unified-token bridge. We anchor at the flagship-output
// token (Opus 4.7 output ≡ GPT-5.5 output ≡ 1 unified token). All other
// (model, token_type) pairs are scaled by their USD price ratio against
// the anchor. This produces a single-axis "unified cost" that compares
// fairly across providers.
const ANCHOR_PRICE_USD = PRICE_PER_TOKEN_USD["claude-opus-4-7"].output;

export function unifiedWeight(model: Model, tokenType: TokenType): number {
  return PRICE_PER_TOKEN_USD[model][tokenType] / ANCHOR_PRICE_USD;
}

// Display labels for the four token types.
export const TOKEN_TYPE_LABEL: Record<TokenType, string> = {
  input: "Input",
  output: "Output",
  cached_read: "Cache read",
  cached_write: "Cache write",
};

// Stable color tag per token type — referenced by TokenMixPanel and the
// breakdown table.
export const TOKEN_TYPE_COLOR: Record<TokenType, "primary" | "teal" | "amber" | "violet" | "coral"> = {
  output: "amber",
  input: "teal",
  cached_read: "violet",
  cached_write: "coral",
};

// Stable color tag per model (for breakdown table dot).
export const MODEL_COLOR: Record<
  Model,
  "primary" | "teal" | "amber" | "violet" | "coral"
> = {
  "claude-opus-4-7": "violet",
  "claude-sonnet-4-6": "primary",
  "claude-sonnet-4-5": "primary",
  "claude-haiku-4-5": "teal",
  "gpt-5": "amber",
  "gpt-5.5": "amber",
  "gpt-5-codex": "coral",
};
