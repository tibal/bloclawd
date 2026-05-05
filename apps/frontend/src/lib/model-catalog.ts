// Presentation-only mappings keyed by Rust-exported generated types. Domain
// values, model lists, prices, tiers, and limit cadences come from
// `lib/catalog.ts` over the Rust-emitted catalog.json.

import type { Model } from "@web/Model";
import type { TokenMixTotals } from "@web/TokenMixTotals";
import type { TokenType } from "@web/TokenType";

export const TOKEN_TYPE_LABEL: Record<TokenType, string> = {
  input_tokens: "input_tokens",
  output_tokens: "output_tokens",
  cache_read_input_tokens: "cache_read_input_tokens",
  ephemeral_5m_input_tokens: "ephemeral_5m_input_tokens",
  ephemeral_1h_input_tokens: "ephemeral_1h_input_tokens",
  cached_input_tokens: "cached_input_tokens",
  reasoning_output_tokens: "reasoning_output_tokens",
};

export type TokenMixField = keyof TokenMixTotals;

export const TOKEN_MIX_FIELD_VALUES: readonly TokenMixField[] = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "ephemeral_5m_input_tokens",
  "ephemeral_1h_input_tokens",
  "cached_input_tokens",
  "reasoning_output_tokens",
];

export const TOKEN_MIX_FIELD_LABEL: Record<TokenMixField, string> = {
  input_tokens: "input_tokens",
  output_tokens: "output_tokens",
  cache_read_input_tokens: "cache_read_input_tokens",
  ephemeral_5m_input_tokens: "ephemeral_5m_input_tokens",
  ephemeral_1h_input_tokens: "ephemeral_1h_input_tokens",
  cached_input_tokens: "cached_input_tokens",
  reasoning_output_tokens: "reasoning_output_tokens",
};

export type Tone = "primary" | "teal" | "amber" | "violet" | "coral";

export const TONE_VAR: Record<Tone, string> = {
  primary: "var(--brand)",
  teal: "var(--teal)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  coral: "var(--coral)",
};

export const TONE_GRADIENT: Record<Tone, string> = {
  primary: "linear-gradient(180deg, var(--brand), var(--brand-2))",
  teal: "linear-gradient(180deg, oklch(0.78 0.14 175), oklch(0.62 0.14 175))",
  amber: "linear-gradient(180deg, oklch(0.82 0.13 75), oklch(0.7 0.13 75))",
  violet: "linear-gradient(180deg, oklch(0.72 0.18 295), oklch(0.6 0.18 295))",
  coral: "linear-gradient(180deg, oklch(0.74 0.17 30), oklch(0.6 0.17 30))",
};

export const TOKEN_TYPE_COLOR: Record<TokenType, Tone> = {
  input_tokens: "teal",
  output_tokens: "amber",
  cache_read_input_tokens: "violet",
  ephemeral_5m_input_tokens: "coral",
  ephemeral_1h_input_tokens: "primary",
  cached_input_tokens: "violet",
  reasoning_output_tokens: "coral",
};

export const TOKEN_MIX_FIELD_COLOR: Record<TokenMixField, Tone> = {
  input_tokens: "teal",
  output_tokens: "amber",
  cache_read_input_tokens: "violet",
  ephemeral_5m_input_tokens: "coral",
  ephemeral_1h_input_tokens: "primary",
  cached_input_tokens: "violet",
  reasoning_output_tokens: "coral",
};

export const MODEL_COLOR: Record<Model, Tone> = {
  "claude-opus-4-7": "violet",
  "claude-sonnet-4-6": "primary",
  "claude-sonnet-4-5": "primary",
  "claude-haiku-4-5": "teal",
  "gpt-5": "amber",
  "gpt-5.5": "amber",
  "gpt-5-codex": "coral",
};
