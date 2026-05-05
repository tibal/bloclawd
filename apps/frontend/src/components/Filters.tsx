import { useCallback, useMemo } from "react";
import type { Harness } from "@web/Harness";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
import type { Plan } from "@web/Plan";
import type { Provider } from "@web/Provider";
import type { Region } from "@web/Region";
import type { Tier } from "@web/Tier";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cascade,
  harnessOptions,
  limitTypeOptions,
  modelOptions,
  planOptions,
  providerOptions,
  regionOptions,
  tierOptions,
  type CatalogFilters,
} from "@/lib/catalog";
import { Route, type DashboardSearch } from "@/routes/dashboard";

type SearchPatch = Partial<DashboardSearch>;
type HarnessParam = DashboardSearch["harness"];
type WindowParam = DashboardSearch["window"];

const WINDOW_OPTIONS = ["24h", "7d", "30d", "90d"] as const satisfies readonly WindowParam[];
const WINDOW_SELECT_OPTIONS = WINDOW_OPTIONS.map((w) => ({ value: w, label: w }));
const PROVIDER_SELECT_OPTIONS = providerOptions();
const TIER_SELECT_OPTIONS = tierOptions();
const REGION_SELECT_OPTIONS = regionOptions();

export function Filters() {
  const search = Route.useSearch();
  const updateSearch = useDashboardSearchUpdater();

  const filters: CatalogFilters = useMemo(
    () => ({
      provider: search.provider as Provider | undefined,
      plan: search.plan as Plan | undefined,
      model: search.model,
      tier: search.tier,
      harness: harnessFromSearch(search.harness),
      limit_type: search.limit_type,
    }),
    [
      search.provider,
      search.plan,
      search.model,
      search.tier,
      search.harness,
      search.limit_type,
    ],
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      const next = cascade(filters, {
        provider: optionalValue<Provider>(value),
      });
      updateSearch(searchPatchFor(next));
    },
    [filters, updateSearch],
  );

  const handlePlanChange = useCallback(
    (value: string) => {
      const next = cascade(filters, { plan: optionalValue<Plan>(value) });
      updateSearch(searchPatchFor(next));
    },
    [filters, updateSearch],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      const next = cascade(filters, { model: optionalValue<Model>(value) });
      updateSearch(searchPatchFor(next));
    },
    [filters, updateSearch],
  );

  const handleTierChange = useCallback(
    (value: string) => {
      const next = cascade(filters, { tier: optionalValue<Tier>(value) });
      updateSearch(searchPatchFor(next));
    },
    [filters, updateSearch],
  );

  const handleHarnessChange = useCallback(
    (value: string) => {
      const harness = value as Harness;
      const next = cascade(filters, { harness });
      updateSearch({ ...searchPatchFor(next), harness: harness as HarnessParam });
    },
    [filters, updateSearch],
  );

  const handleRegionChange = useCallback(
    (value: string) =>
      updateSearch({ region: optionalValue<Region>(value) }),
    [updateSearch],
  );

  const handleWindowChange = useCallback(
    (value: string) => updateSearch({ window: value as WindowParam }),
    [updateSearch],
  );

  const handleLimitTypeChange = useCallback(
    (value: string) => updateSearch({ limit_type: value as LimitType }),
    [updateSearch],
  );

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <FilterSelect
        label="Provider"
        onValueChange={handleProviderChange}
        options={PROVIDER_SELECT_OPTIONS}
        value={filters.provider ?? "all"}
        withAll
      />
      <FilterSelect
        label="Plan"
        onValueChange={handlePlanChange}
        options={planOptions(filters)}
        value={filters.plan ?? "all"}
        withAll
      />
      <FilterSelect
        label="Model"
        onValueChange={handleModelChange}
        options={modelOptions(filters)}
        value={filters.model ?? "all"}
        withAll
      />
      <FilterSelect
        label="Tier"
        onValueChange={handleTierChange}
        options={TIER_SELECT_OPTIONS}
        value={filters.tier ?? "all"}
        withAll
      />
      <FilterSelect
        label="Harness"
        onValueChange={handleHarnessChange}
        options={harnessOptions(filters)}
        value={filters.harness ?? "claude-code"}
      />
      <FilterSelect
        label="Region"
        onValueChange={handleRegionChange}
        options={REGION_SELECT_OPTIONS}
        value={search.region ?? "all"}
        withAll
      />
      <FilterSelect
        label="Window"
        onValueChange={handleWindowChange}
        options={WINDOW_SELECT_OPTIONS}
        value={search.window}
      />
      <FilterSelect
        label="Limit type"
        onValueChange={handleLimitTypeChange}
        options={limitTypeOptions(filters)}
        value={search.limit_type}
      />
    </div>
  );
}

function FilterSelect({
  label,
  onValueChange,
  options,
  value,
  withAll = false,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  value: string;
  withAll?: boolean;
}) {
  const id = `dashboard-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger aria-label={label} className="min-h-11" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {withAll ? <SelectItem value="all">all</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function useDashboardSearchUpdater() {
  const navigate = Route.useNavigate();

  return useCallback(
    (patch: SearchPatch) => {
      void navigate({
        search: (prev) => normalizeSearch({ ...prev, ...patch }),
      });
    },
    [navigate],
  );
}

function normalizeSearch(search: DashboardSearch): DashboardSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== undefined),
  ) as DashboardSearch;
}

function optionalValue<T extends string>(value: string): T | undefined {
  return value === "all" ? undefined : (value as T);
}

function harnessFromSearch(value: HarnessParam): Harness {
  return value === "claude-code" ? "claude-code" : "codex";
}

function searchPatchFor(filters: CatalogFilters): SearchPatch {
  return {
    provider: filters.provider,
    plan: filters.plan,
    model: filters.model,
    tier: filters.tier,
    limit_type: filters.limit_type,
  };
}
