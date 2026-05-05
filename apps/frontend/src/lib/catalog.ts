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
  region?: Region;
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
  const allowed = allowedModels(filters);
  return CATALOG.models
    .filter((m) => allowed.has(m.model))
    .map((m) => ({ value: m.model, label: m.display_name }));
}

function allowedModels(filters: CatalogFilters): Set<Model> {
  // Intersect: models available under each currently-set filter.
  let set: Set<Model> | null = null;
  const intersect = (next: Iterable<Model>) => {
    const incoming = new Set(next);
    set = set
      ? new Set(Array.from(set).filter((m) => incoming.has(m)))
      : incoming;
  };

  if (filters.plan) intersect(modelsForPlan(filters.plan));
  if (filters.provider) {
    intersect(modelsForProvider(filters.provider).map((m) => m.model));
  }
  if (filters.tier) {
    const tierModels = new Set<Model>();
    for (const plan of plansForTier(filters.tier)) {
      for (const model of plan.models) tierModels.add(model);
    }
    intersect(tierModels);
  }
  if (filters.harness) {
    // A model is reachable via a harness if any plan exposes both.
    const harnessModels = new Set<Model>();
    for (const plan of CATALOG.plans) {
      if (!plan.harnesses.includes(filters.harness)) continue;
      for (const model of plan.models) harnessModels.add(model);
    }
    intersect(harnessModels);
  }

  return set ?? new Set(CATALOG.models.map((m) => m.model));
}

export function harnessOptions(filters: CatalogFilters): Options<Harness> {
  const harnesses = filters.provider
    ? harnessesForProvider(filters.provider)
    : CATALOG.harnesses;
  return harnesses.map((h) => ({ value: h, label: h }));
}

export function harnessForProvider(provider: Provider): Harness {
  const harnesses = harnessesForProvider(provider);
  if (harnesses.length === 0) {
    throw new Error(`provider ${provider} has no harness in catalog`);
  }
  return harnesses[0]!;
}

export function providerHarnessLabel(
  provider: Provider,
  harness: Harness,
): string {
  return `${providerLabel(provider)} · ${harness}`;
}

export type ProviderHarness = { provider: Provider; harness: Harness };

export function providerHarnessOptions(): Options<string> {
  // Encoded as `${provider}:${harness}`. The catalog is already strict 1:1
  // today; we still enumerate every (provider, harness) pair so the field
  // stays correct if a provider gains a second harness.
  const out: { value: string; label: string }[] = [];
  for (const provider of CATALOG.providers) {
    for (const harness of harnessesForProvider(provider)) {
      out.push({
        value: encodeProviderHarness(provider, harness),
        label: providerHarnessLabel(provider, harness),
      });
    }
  }
  return out;
}

export function encodeProviderHarness(
  provider: Provider,
  harness: Harness,
): string {
  return `${provider}:${harness}`;
}

export function decodeProviderHarness(value: string): ProviderHarness | null {
  const [provider, harness] = value.split(":") as [string, string];
  if (!CATALOG.providers.includes(provider as Provider)) return null;
  if (!CATALOG.harnesses.includes(harness as Harness)) return null;
  return { provider: provider as Provider, harness: harness as Harness };
}

export function tierOptions(filters?: CatalogFilters): Options<Tier> {
  // Only surface tiers reachable in plans matching the current
  // provider/harness. OpenAI plans have tier_alias=null today, so the
  // tier picker hides itself for OpenAI rather than offering selections
  // that wipe limit_type / plan.
  const seen = new Set<Tier>();
  for (const plan of CATALOG.plans) {
    if (filters?.provider && plan.provider !== filters.provider) continue;
    if (filters?.harness && !plan.harnesses.includes(filters.harness)) {
      continue;
    }
    if (plan.tier_alias) seen.add(plan.tier_alias);
  }
  return CATALOG.tiers
    .filter((t) => seen.has(t))
    .map((tier) => ({ value: tier, label: tier }));
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
  // exposes it. Plan picks the narrowest set; otherwise we intersect the
  // plans matching the active provider/tier/harness filters.
  if (filters.plan) {
    return planInfo(filters.plan).limit_types.map((lt) => ({
      value: lt,
      label: lt,
    }));
  }
  const seen = new Set<LimitType>();
  for (const plan of candidatePlansFor(filters)) {
    for (const lt of plan.limit_types) {
      seen.add(lt);
    }
  }
  return Array.from(seen).map((lt) => ({ value: lt, label: lt }));
}

function candidatePlansFor(filters: CatalogFilters): readonly PlanInfo[] {
  return CATALOG.plans.filter((plan) => {
    if (filters.provider && plan.provider !== filters.provider) return false;
    if (filters.harness && !plan.harnesses.includes(filters.harness)) {
      return false;
    }
    // Tier filtering only applies when the matching provider exposes
    // tier_alias values (Anthropic does, OpenAI plans are tier_alias=null
    // today). Otherwise we drop the tier filter so siblings — limit_type,
    // model, plan — remain selectable.
    if (filters.tier && providerHasTierAliases(filters)) {
      if (plan.tier_alias !== filters.tier) return false;
    }
    return true;
  });
}

function providerHasTierAliases(filters: CatalogFilters): boolean {
  return CATALOG.plans.some((plan) => {
    if (filters.provider && plan.provider !== filters.provider) return false;
    if (filters.harness && !plan.harnesses.includes(filters.harness)) {
      return false;
    }
    return plan.tier_alias != null;
  });
}

// First non-aggregable value still valid under `filters`. Used to keep
// tier / harness / limit_type pinned to a single non-`all` value (and
// auto-pick a fresh one when a sibling change invalidates the current
// choice).
export function firstAvailableTier(filters: CatalogFilters): Tier | null {
  for (const tier of CATALOG.tiers) {
    if (tierIsAvailable(tier, filters)) return tier;
  }
  return CATALOG.tiers[0] ?? null;
}

export function tierIsAvailable(tier: Tier, filters: CatalogFilters): boolean {
  return candidatePlansFor({ ...filters, tier }).length > 0;
}

export function firstAvailableHarness(
  filters: CatalogFilters,
): Harness | null {
  const provider = filters.provider;
  const candidates = provider ? harnessesForProvider(provider) : CATALOG.harnesses;
  for (const harness of candidates) {
    if (harnessIsAvailable(harness, filters)) return harness;
  }
  return candidates[0] ?? null;
}

export function harnessIsAvailable(
  harness: Harness,
  filters: CatalogFilters,
): boolean {
  return candidatePlansFor({ ...filters, harness }).length > 0;
}

export function firstAvailableLimitType(
  filters: CatalogFilters,
): LimitType | null {
  const opts = limitTypeOptions(filters);
  return opts[0]?.value ?? null;
}

export function limitTypeIsAvailable(
  limitType: LimitType,
  filters: CatalogFilters,
): boolean {
  return limitTypeOptions(filters).some((o) => o.value === limitType);
}

// Resolve a partial filter row to one with non-aggregable fields filled in.
// Provider+harness move together (1:1 today); when only one is set we pin
// the other from the catalog. Tier is left undefined when the active
// provider has no tier_alias (OpenAI today). limit_type falls back to the
// first catalog value still valid under the row's other filters.
// Aggregable fields (plan, model, region) pass through untouched.
export type ResolvedRow = CatalogFilters & {
  provider: Provider;
  harness: Harness;
  tier?: Tier;
  limit_type: LimitType;
};

export function resolveRow(filters: CatalogFilters): ResolvedRow {
  let next: CatalogFilters = { ...filters };

  if (next.provider && !next.harness) {
    next = { ...next, harness: harnessForProvider(next.provider) };
  }

  const provider = next.provider ?? CATALOG.providers[0]!;
  const harness =
    next.harness && harnessIsAvailable(next.harness, { ...next, provider })
      ? next.harness
      : harnessForProvider(provider);

  next = { ...next, provider, harness };

  // Drop tier entirely when the catalog has no tier aliases for this
  // provider (e.g. OpenAI). Otherwise, keep current tier when valid or
  // fall back to the first available.
  if (providerHasTierAliases(next)) {
    const tier =
      next.tier && tierIsAvailable(next.tier, next)
        ? next.tier
        : firstAvailableTier(next);
    next = { ...next, tier: tier ?? undefined };
  } else {
    next = { ...next, tier: undefined };
  }

  let limit_type =
    next.limit_type && limitTypeIsAvailable(next.limit_type, next)
      ? next.limit_type
      : firstAvailableLimitType(next);
  if (!limit_type) {
    limit_type = CATALOG.limit_types[0]!;
  }
  next = { ...next, limit_type };

  return next as ResolvedRow;
}

function providerLabel(provider: Provider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function planLabel(plan: PlanInfo): string {
  return `${providerLabel(plan.provider)} ${plan.display_name}`;
}
