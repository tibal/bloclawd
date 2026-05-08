import { useCallback, useMemo } from "react";
import type { Harness } from "@web/Harness";
import type { LimitType } from "@web/LimitType";
import type { Model } from "@web/Model";
import type { Plan } from "@web/Plan";
import type { Region } from "@web/Region";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cascade,
  decodeProviderHarness,
  encodeProviderHarness,
  harnessForProvider,
  limitTypeOptions,
  modelOptions,
  planOptions,
  providerHarnessOptions,
  regionOptions,
  resolveRow,
  type CatalogFilters,
} from "@/lib/catalog";
import type { FilterRow } from "@/lib/dashboard-search";

const PROVIDER_HARNESS_OPTIONS = providerHarnessOptions();
const REGION_SELECT_OPTIONS = regionOptions();

export interface FilterRowFieldsProps {
  row: FilterRow;
  onChange: (next: FilterRow) => void;
  // Hide aggregable fields (plan, model) when rendering a compact compare row.
  compact?: boolean;
}

export function FilterRowFields({
  row,
  onChange,
  compact = false,
}: FilterRowFieldsProps) {
  const resolved = useMemo(() => resolveRow(row), [row]);

  const apply = useCallback(
    (patch: CatalogFilters) => {
      const next: FilterRow = {
        provider: patch.provider,
        plan: patch.plan,
        model: patch.model,
        tier: patch.tier,
        // Provider→harness is 1:1 in the catalog today: pin harness from
        // provider whenever cascade left it dangling, so the row never
        // holds an inconsistent pair.
        harness:
          patch.harness ??
          (patch.provider ? harnessForProvider(patch.provider) : undefined),
        region: patch.region ?? row.region,
        limit_type: patch.limit_type ?? row.limit_type,
      };
      onChange(prune(next) as FilterRow);
    },
    [onChange, row.region, row.limit_type],
  );

  const onProviderHarness = (value: string) => {
    const decoded = decodeProviderHarness(value);
    if (!decoded) return;
    apply(
      cascade(row, { provider: decoded.provider, harness: decoded.harness }),
    );
  };

  const onLimit = (value: string) =>
    onChange(prune({ ...row, limit_type: value as LimitType }) as FilterRow);
  const onRegion = (value: string) =>
    onChange(prune({ ...row, region: optionalValue<Region>(value) }) as FilterRow);
  const onModel = (value: string) =>
    apply(cascade(row, { model: optionalValue<Model>(value) }));
  const onPlan = (value: string) =>
    apply(cascade(row, { plan: optionalValue<Plan>(value) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPill
        ariaLabel="Provider · Harness"
        label="Source"
        onChange={onProviderHarness}
        options={PROVIDER_HARNESS_OPTIONS}
        value={encodeProviderHarness(resolved.provider, resolved.harness)}
      />
      <FilterPill
        ariaLabel="Region"
        label="Region"
        onChange={onRegion}
        options={REGION_SELECT_OPTIONS}
        value={row.region ?? "all"}
        withAll
      />
      <FilterPill
        ariaLabel="Limit type"
        label="Limit"
        onChange={onLimit}
        options={limitTypeOptions(resolved)}
        value={resolved.limit_type}
      />
      {compact ? null : (
        <>
          <FilterPill
            ariaLabel="Model"
            label="Model"
            onChange={onModel}
            options={modelOptions(resolved)}
            value={row.model ?? "all"}
            withAll
          />
          <FilterPill
            ariaLabel="Plan"
            label="Plan"
            onChange={onPlan}
            options={planOptions(resolved)}
            value={row.plan ?? "all"}
            withAll
          />
        </>
      )}
    </div>
  );
}

interface FilterPillProps {
  ariaLabel: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  value: string;
  withAll?: boolean;
}

export function FilterPill({
  ariaLabel,
  label,
  onChange,
  options,
  value,
  withAll = false,
}: FilterPillProps) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-11 min-h-11 w-fit justify-start gap-2 rounded-full border border-border bg-[var(--surface)] px-3 text-[12.5px] font-medium text-foreground hover:bg-[var(--surface-2)] data-[state=open]:bg-[var(--surface-2)] lg:h-8 lg:min-h-0"
      >
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[220px]">
        {withAll ? <SelectItem value="all">all</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function prune<T extends Record<string, unknown>>(value: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function optionalValue<T extends string>(value: string): T | undefined {
  return value === "all" ? undefined : (value as T);
}

// Re-export for callers that bundle the row editor with a remove button.
export { type Harness };
