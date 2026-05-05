// Typed accessors over the Rust-emitted `catalog.json`. The Rust crate
// (`crates/event-schema/src/catalog.rs`) is the single source of truth;
// this module just exposes lookup + cascading helpers for the dashboard
// filters. To regenerate the JSON: `cargo run -p xtask -- gen-catalog`.

import catalogJson from "@web/catalog.json";
import type { Catalog } from "@web/Catalog";
import type { Harness } from "@web/Harness";
import type { LimitInfo } from "@web/LimitInfo";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
import type { ModelInfo } from "@web/ModelInfo";
import type { Plan } from "@web/Plan";
import type { PlanInfo } from "@web/PlanInfo";
import type { Provider } from "@web/Provider";
import type { Region } from "@web/Region";
import type { Tier } from "@web/Tier";
import type { TokenType } from "@web/TokenType";
import type { Window } from "@web/Window";

export const CATALOG: Catalog = catalogJson as Catalog;

export type NonEmptyValues<T extends string> = readonly [T, ...T[]];

function nonEmptyValues<T extends string>(
  values: readonly T[],
  label: string,
): NonEmptyValues<T> {
  if (values.length === 0) {
    throw new Error(`catalog has no ${label}`);
  }
  return values as NonEmptyValues<T>;
}

export const MODEL_VALUES = nonEmptyValues(
  CATALOG.models.map((m) => m.model),
  "models",
);
export const HARNESS_VALUES = nonEmptyValues(CATALOG.harnesses, "harnesses");
export const DASHBOARD_HARNESS_VALUES = nonEmptyValues(
  ["cc" as const, ...CATALOG.harnesses],
  "dashboard harnesses",
);
export const REGION_VALUES = nonEmptyValues(CATALOG.regions, "regions");
export const TIER_VALUES = nonEmptyValues(CATALOG.tiers, "tiers");
export const PROVIDER_VALUES = nonEmptyValues(CATALOG.providers, "providers");
export const PLAN_VALUES = nonEmptyValues(
  CATALOG.plans.map((p) => p.plan),
  "plans",
);
export const LIMIT_TYPE_VALUES = nonEmptyValues(
  CATALOG.limit_types,
  "limit types",
);
export const TOKEN_TYPE_VALUES = nonEmptyValues(
  CATALOG.token_types,
  "token types",
);
export const WINDOW_VALUES = nonEmptyValues(CATALOG.windows, "windows");

export type CatalogFilters = {
  provider?: Provider;
  plan?: Plan;
  model?: Model;
  tier?: Tier;
  harness?: Harness;
  limit_type?: LimitType;
};

export function planInfo(plan: Plan): PlanInfo {
  const found = CATALOG.plans.find((p) => p.plan === plan);
  if (!found) {
    throw new Error(`unknown plan: ${plan}`);
  }
  return found;
}

export function limitInfo(limitType: LimitType): LimitInfo {
  const found = CATALOG.limits.find((limit) => limit.limit_type === limitType);
  if (!found) {
    throw new Error(`unknown limit type: ${limitType}`);
  }
  return found;
}

export function modelInfo(model: Model): ModelInfo {
  const found = CATALOG.models.find((m) => m.model === model);
  if (!found) {
    throw new Error(`unknown model: ${model}`);
  }
  return found;
}

export function providerOfModel(model: Model): Provider {
  return modelInfo(model).provider;
}

export function providerOfPlan(plan: Plan): Provider {
  return planInfo(plan).provider;
}

export function plansForProvider(provider: Provider): readonly PlanInfo[] {
  return CATALOG.plans.filter((p) => p.provider === provider);
}

export function modelsForProvider(provider: Provider): readonly ModelInfo[] {
  return CATALOG.models.filter((m) => m.provider === provider);
}

export function modelsForPlan(plan: Plan): readonly Model[] {
  return planInfo(plan).models;
}

export function harnessesForPlan(plan: Plan): readonly Harness[] {
  return planInfo(plan).harnesses;
}

export function harnessesForProvider(provider: Provider): readonly Harness[] {
  const seen = new Set<Harness>();
  for (const plan of plansForProvider(provider)) {
    for (const harness of plan.harnesses) {
      seen.add(harness);
    }
  }
  return Array.from(seen);
}

export function plansForModel(model: Model): readonly PlanInfo[] {
  return CATALOG.plans.filter((p) => p.models.includes(model));
}

export function plansForTier(tier: Tier): readonly PlanInfo[] {
  return CATALOG.plans.filter((p) => p.tier_alias === tier);
}

export function tierForPlan(plan: Plan): Tier | null {
  return planInfo(plan).tier_alias;
}

export function primaryPlanForTier(tier: Tier): PlanInfo {
  const plan = plansForTier(tier)[0];
  if (!plan) {
    throw new Error(`no catalog plan aliases tier: ${tier}`);
  }
  return plan;
}

export function tierDisplayName(tier: Tier): string {
  return primaryPlanForTier(tier).display_name;
}

export function tierMonthlyCostUsd(tier: Tier): number {
  return primaryPlanForTier(tier).monthly_cost_usd;
}

export function tierLabel(tier: Tier): string {
  const plan = primaryPlanForTier(tier);
  return `${plan.display_name} · $${plan.monthly_cost_usd}/mo`;
}

export function limitWindowsPerMonth(limitType: LimitType): number {
  return limitInfo(limitType).windows_per_month;
}

export function planIncludesModel(plan: Plan, model: Model): boolean {
  return planInfo(plan).models.includes(model);
}

// --- cascading reducer ------------------------------------------------------
//
// The dashboard filters are not independent: changing one selection narrows
// the valid options for the others. `cascade(filters, change)` applies a
// single-field change and returns a normalized state where any newly
// invalid sibling fields have been cleared or auto-resolved.
//
// Rules:
//   * Setting `plan` forces `provider = plan.provider`, sets `tier` to
//     `plan.tier_alias` if it has one, and clears `model` / `harness`
//     when they are not part of the plan.
//   * Setting `provider` clears `plan`, `model`, `harness` if they belong
//     to a different provider.
//   * Setting `model` forces `provider = model.provider` and clears `plan`
//     when the plan does not include the model.
//   * Setting `tier` clears `plan` when the plan's `tier_alias` no longer
//     matches.
//   * Setting `harness` is informational; it does not narrow the others
//     beyond what is already implied by provider.

export type FilterChange = Partial<CatalogFilters>;

export function cascade(
  current: CatalogFilters,
  change: FilterChange,
): CatalogFilters {
  let next: CatalogFilters = { ...current, ...change };

  if (change.plan !== undefined) {
    next = applyPlanChange(next, change.plan);
  }
  if (change.provider !== undefined) {
    next = applyProviderChange(next, change.provider);
  }
  if (change.model !== undefined) {
    next = applyModelChange(next, change.model);
  }
  if (change.tier !== undefined) {
    next = applyTierChange(next, change.tier);
  }

  return prune(next);
}

function applyPlanChange(
  state: CatalogFilters,
  plan: Plan | undefined,
): CatalogFilters {
  if (!plan) {
    return state;
  }
  const info = planInfo(plan);
  const next: CatalogFilters = {
    ...state,
    plan,
    provider: info.provider,
    tier: info.tier_alias ?? undefined,
  };
  if (next.model && !info.models.includes(next.model)) {
    next.model = undefined;
  }
  if (next.harness && !info.harnesses.includes(next.harness)) {
    next.harness = undefined;
  }
  return next;
}

function applyProviderChange(
  state: CatalogFilters,
  provider: Provider | undefined,
): CatalogFilters {
  if (!provider) {
    return state;
  }
  const next: CatalogFilters = { ...state, provider };
  if (next.plan && providerOfPlan(next.plan) !== provider) {
    next.plan = undefined;
    next.tier = undefined;
  }
  if (next.model && providerOfModel(next.model) !== provider) {
    next.model = undefined;
  }
  const allowedHarnesses = harnessesForProvider(provider);
  if (next.harness && !allowedHarnesses.includes(next.harness)) {
    next.harness = undefined;
  }
  return next;
}

function applyModelChange(
  state: CatalogFilters,
  model: Model | undefined,
): CatalogFilters {
  if (!model) {
    return state;
  }
  const next: CatalogFilters = { ...state, model, provider: providerOfModel(model) };
  if (next.plan && !planIncludesModel(next.plan, model)) {
    next.plan = undefined;
    next.tier = undefined;
  }
  return next;
}

function applyTierChange(
  state: CatalogFilters,
  tier: Tier | undefined,
): CatalogFilters {
  if (!tier) {
    return state;
  }
  const next: CatalogFilters = { ...state, tier };
  if (next.plan && tierForPlan(next.plan) !== tier) {
    next.plan = undefined;
  }
  return next;
}

function prune(state: CatalogFilters): CatalogFilters {
  const out: CatalogFilters = {};
  for (const [key, value] of Object.entries(state) as [
    keyof CatalogFilters,
    CatalogFilters[keyof CatalogFilters],
  ][]) {
    if (value !== undefined) {
      // @ts-expect-error narrowing across union of value types
      out[key] = value;
    }
  }
  return out;
}

// Visible options for a select, given the current filter state.
export type Options<T extends string> = readonly { value: T; label: string }[];

export function providerOptions(): Options<Provider> {
  return CATALOG.providers.map((p) => ({ value: p, label: providerLabel(p) }));
}

export function planOptions(filters: CatalogFilters): Options<Plan> {
  const plans = filters.provider
    ? plansForProvider(filters.provider)
    : CATALOG.plans;
  return plans.map((p) => ({ value: p.plan, label: planLabel(p) }));
}

export function modelOptions(filters: CatalogFilters): Options<Model> {
  let models: readonly ModelInfo[] = CATALOG.models;
  if (filters.plan) {
    const allowed = new Set(modelsForPlan(filters.plan));
    models = CATALOG.models.filter((m) => allowed.has(m.model));
  } else if (filters.provider) {
    models = modelsForProvider(filters.provider);
  }
  return models.map((m) => ({ value: m.model, label: m.display_name }));
}

export function harnessOptions(filters: CatalogFilters): Options<Harness> {
  const harnesses = filters.provider
    ? harnessesForProvider(filters.provider)
    : CATALOG.harnesses;
  return harnesses.map((h) => ({ value: h, label: h }));
}

export function tierOptions(): Options<Tier> {
  return CATALOG.tiers.map((tier) => ({ value: tier, label: tier }));
}

export function regionOptions(): Options<Region> {
  return CATALOG.regions.map((region) => ({ value: region, label: region }));
}

export function tokenTypeOptions(): Options<TokenType> {
  return CATALOG.token_types.map((tokenType) => ({
    value: tokenType,
    label: tokenType,
  }));
}

export function windowOptions(): Options<Window> {
  return CATALOG.windows.map((window) => ({ value: window, label: window }));
}

export function limitTypeOptions(filters: CatalogFilters): Options<LimitType> {
  // A limit type is selectable when at least one currently-visible plan
  // exposes it. Without filters, this is just every limit type in the
  // catalog. With a plan picked, narrow to that plan's limit_types.
  if (filters.plan) {
    return planInfo(filters.plan).limit_types.map((lt) => ({
      value: lt,
      label: lt,
    }));
  }
  const seen = new Set<LimitType>();
  const candidatePlans = filters.provider
    ? plansForProvider(filters.provider)
    : CATALOG.plans;
  for (const plan of candidatePlans) {
    for (const lt of plan.limit_types) {
      seen.add(lt);
    }
  }
  return Array.from(seen).map((lt) => ({ value: lt, label: lt }));
}

function providerLabel(provider: Provider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function planLabel(plan: PlanInfo): string {
  return `${providerLabel(plan.provider)} ${plan.display_name}`;
}
