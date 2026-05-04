/// <reference types="vite/client" />
import { useQueries, useQuery } from "@tanstack/react-query";

// Empty default = same-origin: SPA fetches `/reports/v1/...` via the
// frontend Worker, which proxies the R2 bucket through its BUCKET
// binding (see apps/frontend/worker/index.ts). Set
// VITE_R2_BASE_URL=https://data.bloclawd.com (or another absolute URL)
// to bypass the proxy and read directly from a public R2 attach.
const REPORTS_ROOT = "reports/v1";
const R2_BASE_URL = (import.meta.env.VITE_R2_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);

class PromisePool {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private cap: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.cap) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const pool = new PromisePool(8);

export type Tier = "q15" | "h1" | "d1";
export type IngestHealth = "healthy" | "degraded" | "down";
export type WeightSource = "cohort" | "tier+harness" | "tier" | "prior";

export type Percentiles = {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export type PercentileEncoding =
  | { Mean: Percentiles }
  | { Bin: Percentiles };

export function decodePercentiles(
  encoding: PercentileEncoding | null | undefined,
): Percentiles | null {
  if (!encoding) return null;
  return "Mean" in encoding ? encoding.Mean : encoding.Bin;
}

// Re-exported from generated rust types (apps/web/src/generated/TokenType.ts).
// SSOT: crates/event-schema/src/enums.rs.
export type { TokenType } from "@web/TokenType";
import type { TokenType } from "@web/TokenType";

export const TOKEN_TYPES: readonly TokenType[] = [
  "input",
  "output",
  "cached_read",
  "cached_write",
] as const;

// Per (model, token_type) "tokens-at-limit-if-only" estimation. Each bucket
// reports the percentile distribution of tokens-burned-at-limit assuming the
// user spent on that single (model, token_type). Lets the UI show "if you
// spent only opus output, you'd hit limit at p50 = 86k".
export type TokenTypeCell = {
  token_type: TokenType;
  n_with_type: number;
  // Percentiles of tokens-to-limit-if-only this token type were spent.
  tokens_to_limit_if_only: PercentileEncoding | null;
  // Percentiles of the share of total spend this token type represents
  // across cohort submissions (0..1).
  share: PercentileEncoding | null;
};

export type ModelCell = {
  model: string;
  n_with_model: number;
  weights: readonly number[];
  weight_source: WeightSource;
  tokens_to_limit_if_only: PercentileEncoding | null;
  // OPTIONAL — per-token-type breakdown for this model. When present, sums
  // of tokens.tokens_to_limit_if_only across types should reconcile with the
  // model-level estimate.
  tokens?: readonly TokenTypeCell[];
};

// Cohort-level representative mix. Each entry's `share` is a percentile
// distribution of the fraction of total spend allocated to that
// (model, token_type) across submitters in the cohort. Lets the UI render
// "the typical user spent X% on output, with p10..p90 spread".
export type RepresentativeMixCell = {
  model: string;
  token_type: TokenType;
  share: PercentileEncoding;
};

export type BucketCell = {
  tier: string;
  harness: string;
  region: string;
  limit_type: "5h" | "weekly";
  n_submissions: number;
  trim_rate: number;
  trim_rate_alert: boolean;
  unified_cost: PercentileEncoding | null;
  models: ModelCell[];
  insufficient_data: boolean;
  // OPTIONAL — token-type breakdowns at cohort level. Pre-computed so the
  // dashboard can avoid re-aggregating from `models`.
  representative_mix?: readonly RepresentativeMixCell[];
};

export type BucketEnvelope = {
  schema_version: "v1";
  bucket_ts: string;
  tier_resolution: Tier;
  bin_edges: readonly number[];
  cells: BucketCell[];
};

export type Manifest = {
  schema_version: "v1";
  last_updated_ts: string;
  tiers: Record<Tier, string[]>;
};

export type StatusJson = {
  schema_version: "v1";
  last_cron_success_ts: string;
  last_cron_attempted_ts: string;
  ingest_health: IngestHealth;
  total_events_lifetime: number;
  approximate_contributors_30d: number;
  approximate_contributors_window_days: number;
};

export type BucketResult = {
  data: BucketEnvelope | undefined;
  isLoading: boolean;
  error: Error | null;
};

export class R2NotFoundError extends Error {
  readonly status = 404;
  constructor(url: string) {
    super(`r2 404 ${url}`);
    this.name = "R2NotFoundError";
  }
}

export function isR2NotFound(error: unknown): error is R2NotFoundError {
  return error instanceof R2NotFoundError;
}

export async function fetchR2<T>(url: string): Promise<T> {
  return pool.run(async () => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      throw new R2NotFoundError(url);
    }
    if (!response.ok) {
      throw new Error(`r2 ${response.status} ${url}`);
    }
    return (await response.json()) as T;
  });
}

export function useManifest() {
  const url = reportUrl("manifest.json");
  return useQuery({
    queryKey: ["r2", url],
    queryFn: () => fetchR2<Manifest>(url),
    staleTime: 60_000,
  });
}

export function useBucket(tier: Tier, path: string) {
  const url = bucketUrl(tier, path);
  return useQuery({
    queryKey: ["r2", url],
    queryFn: () => fetchR2<BucketEnvelope>(url),
    staleTime: Infinity,
  });
}

export function useStatus() {
  const url = reportUrl("_status.json");
  return useQuery({
    queryKey: ["r2", url],
    queryFn: () => fetchR2<StatusJson>(url),
    staleTime: 5 * 60_000,
  });
}

export function useBuckets(tier: Tier, paths: string[]): BucketResult[] {
  const queries = useQueries({
    queries: paths.map((path) => {
      const url = bucketUrl(tier, path);
      return {
        queryKey: ["r2", url],
        queryFn: () => fetchR2<BucketEnvelope>(url),
        staleTime: Infinity,
      };
    }),
  });

  return queries.map((query) => ({
    data: query.data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  }));
}

function reportUrl(path: string): string {
  return `${R2_BASE_URL}/${REPORTS_ROOT}/${path.replace(/^\/+/, "")}`;
}

function bucketUrl(tier: Tier, path: string): string {
  return reportUrl(`${tier}/${path}`);
}
