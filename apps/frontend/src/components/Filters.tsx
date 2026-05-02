import { useCallback } from "react";
import type { Harness } from "@web/Harness";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
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
import { Route, type DashboardSearch } from "@/routes/dashboard";

type SearchPatch = Partial<DashboardSearch>;
type HarnessParam = DashboardSearch["harness"];
type WindowParam = DashboardSearch["window"];
type FilterOption = string | { value: string; label: string };

const MODEL_OPTIONS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "gpt-5",
  "gpt-5.5",
  "gpt-5-codex",
] as const satisfies readonly Model[];

const TIER_OPTIONS = ["pro", "max5", "max20"] as const satisfies readonly Tier[];
const HARNESS_OPTIONS = [
  { value: "claude-code", label: "claude-code" },
  { value: "codex", label: "codex" },
] as const satisfies readonly { value: HarnessParam; label: Harness }[];
const REGION_OPTIONS = [
  "NA",
  "EU",
  "AS",
  "SA",
  "OC",
  "AF",
  "AN",
] as const satisfies readonly Region[];
const WINDOW_OPTIONS = ["24h", "7d", "30d", "90d"] as const satisfies readonly WindowParam[];
const LIMIT_TYPE_OPTIONS = ["5h", "weekly"] as const satisfies readonly LimitType[];

export function Filters() {
  const search = Route.useSearch();
  const updateSearch = useDashboardSearchUpdater();

  const handleModelChange = useCallback(
    (value: string) =>
      updateSearch({ model: optionalValue(value) as Model | undefined }),
    [updateSearch],
  );
  const handleTierChange = useCallback(
    (value: string) =>
      updateSearch({ tier: optionalValue(value) as Tier | undefined }),
    [updateSearch],
  );
  const handleHarnessChange = useCallback(
    (value: string) => updateSearch({ harness: value as HarnessParam }),
    [updateSearch],
  );
  const handleRegionChange = useCallback(
    (value: string) =>
      updateSearch({ region: optionalValue(value) as Region | undefined }),
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <FilterSelect
        label="Model"
        onValueChange={handleModelChange}
        options={MODEL_OPTIONS}
        value={search.model ?? "all"}
        withAll
      />
      <FilterSelect
        label="Tier"
        onValueChange={handleTierChange}
        options={TIER_OPTIONS}
        value={search.tier ?? "all"}
        withAll
      />
      <FilterSelect
        label="Harness"
        onValueChange={handleHarnessChange}
        options={HARNESS_OPTIONS}
        value={search.harness}
      />
      <FilterSelect
        label="Region"
        onValueChange={handleRegionChange}
        options={REGION_OPTIONS}
        value={search.region ?? "all"}
        withAll
      />
      <FilterSelect
        label="Window"
        onValueChange={handleWindowChange}
        options={WINDOW_OPTIONS}
        value={search.window}
      />
      <FilterSelect
        label="Limit type"
        onValueChange={handleLimitTypeChange}
        options={LIMIT_TYPE_OPTIONS}
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
  options: readonly FilterOption[];
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
            <SelectItem key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function optionValue(option: FilterOption): string {
  return typeof option === "string" ? option : option.value;
}

function optionLabel(option: FilterOption): string {
  return typeof option === "string" ? option : option.label;
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

function optionalValue(value: string): string | undefined {
  return value === "all" ? undefined : value;
}
