import type { Model } from "@web/Model";
import type { Region } from "@web/Region";
import type { Tier } from "@web/Tier";

import {
  CATALOG,
  type ResolvedRow,
} from "@/lib/catalog";
import { TOKEN_MIX_FIELD_VALUES } from "@/lib/model-catalog";
import type {
  BucketCell,
  BucketEnvelope,
  ModelTokenMix,
  Percentiles,
  TokenMixTotals,
} from "@/lib/r2";

export type AggregatedCohortCell = {
  subscription_tier?: Tier;
  harness?: BucketCell["harness"];
  region?: Region;
  limit_type: BucketCell["limit_type"];
  api_cost_usd: Percentiles | null;
  n_dropped: number;
  n_retained: number;
  typical_mix: ModelTokenMix[];
  cell_count: number;
};

export type CohortCellFilter = {
  tier?: Tier;
  harness?: BucketCell["harness"];
  region?: Region;
  limit_type?: BucketCell["limit_type"];
  model?: Model;
};

export function cellsForRow(
  bucket: BucketEnvelope,
  row: ResolvedRow,
): BucketCell[] {
  return bucket.cells.filter((cell) => cellMatchesRow(cell, row));
}

export function cellsMatching(
  cells: readonly BucketCell[],
  filter: CohortCellFilter,
): BucketCell[] {
  return cells.filter((cell) => cellMatchesFilter(cell, filter));
}

export function cellMatchesRow(cell: BucketCell, row: ResolvedRow): boolean {
  return cellMatchesFilter(cell, row);
}

export function cellMatchesFilter(
  cell: BucketCell,
  filter: CohortCellFilter,
): boolean {
  if (filter.tier && cell.subscription_tier !== filter.tier) return false;
  if (filter.harness && cell.harness !== filter.harness) return false;
  if (filter.limit_type && cell.limit_type !== filter.limit_type) return false;
  if (filter.region && cell.region !== filter.region) return false;
  if (filter.model && !cellHasModel(cell, filter.model)) return false;
  return true;
}

export function percentilesForCells(cells: readonly BucketCell[]): Percentiles | null {
  return weightedAveragePercentiles(
    cells.flatMap((cell) =>
      cell.api_cost_usd
        ? [{ weight: Math.max(1, cell.n_retained), percentiles: cell.api_cost_usd }]
        : [],
    ),
  );
}

export function aggregateCohortCell(
  bucket: BucketEnvelope,
  row: ResolvedRow,
): AggregatedCohortCell | null {
  return aggregateCohortCells(cellsForRow(bucket, row), row);
}

export function aggregateCohortCells(
  cells: readonly BucketCell[],
  filter: CohortCellFilter,
): AggregatedCohortCell | null {
  if (cells.length === 0) return null;

  return {
    subscription_tier: filter.tier,
    harness: filter.harness,
    region: filter.region,
    limit_type: filter.limit_type ?? cells[0]!.limit_type,
    api_cost_usd: percentilesForCells(cells),
    n_dropped: cells.reduce((sum, cell) => sum + cell.n_dropped, 0),
    n_retained: cells.reduce((sum, cell) => sum + cell.n_retained, 0),
    typical_mix: aggregateTypicalMix(cells, filter.model),
    cell_count: cells.length,
  };
}

export function weightedAveragePercentiles(
  values: Array<{ weight: number; percentiles: Percentiles }>,
): Percentiles | null {
  if (values.length === 0) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  const weighted = (key: keyof Percentiles) =>
    values.reduce(
      (sum, item) => sum + item.percentiles[key] * item.weight,
      0,
    ) / totalWeight;
  return {
    p10: weighted("p10"),
    p25: weighted("p25"),
    p50: weighted("p50"),
    p75: weighted("p75"),
    p90: weighted("p90"),
  };
}

function cellHasModel(cell: BucketCell, model: Model): boolean {
  return cell.typical_mix.some(
    (entry) =>
      entry.model === model &&
      TOKEN_MIX_FIELD_VALUES.some((field) => entry.tokens[field] > 0),
  );
}

function aggregateTypicalMix(
  cells: readonly BucketCell[],
  modelFilter: Model | undefined,
): ModelTokenMix[] {
  const totalsByModel = new Map<Model, TokenMixTotals>();
  let totalWeight = 0;

  for (const cell of cells) {
    const weight = Math.max(1, cell.n_retained);
    totalWeight += weight;

    for (const entry of cell.typical_mix) {
      if (modelFilter && entry.model !== modelFilter) continue;
      const totals = totalsByModel.get(entry.model) ?? zeroTotals();
      for (const field of TOKEN_MIX_FIELD_VALUES) {
        totals[field] += entry.tokens[field] * weight;
      }
      totalsByModel.set(entry.model, totals);
    }
  }

  const denom = Math.max(1, totalWeight);
  return CATALOG.models
    .flatMap((modelInfo) => {
      const totals = totalsByModel.get(modelInfo.model);
      if (!totals) return [];
      const averaged = zeroTotals();
      for (const field of TOKEN_MIX_FIELD_VALUES) {
        averaged[field] = totals[field] / denom;
      }
      return isZero(averaged)
        ? []
        : [{ model: modelInfo.model, tokens: averaged }];
    });
}

function zeroTotals(): TokenMixTotals {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
    ephemeral_1h_input_tokens: 0,
    cached_input_tokens: 0,
    reasoning_output_tokens: 0,
  };
}

function isZero(totals: TokenMixTotals): boolean {
  return TOKEN_MIX_FIELD_VALUES.every((field) => totals[field] === 0);
}
