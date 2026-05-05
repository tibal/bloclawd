/// <reference types="vite/client" />
import { useQueries, useQuery } from "@tanstack/react-query";
import type { BucketCell } from "@web/BucketCell";
import type { BucketEnvelope } from "@web/BucketEnvelope";
import type { IngestHealth } from "@web/IngestHealth";
import type { Manifest } from "@web/Manifest";
import type { ModelTokenMix } from "@web/ModelTokenMix";
import type { Percentiles } from "@web/Percentiles";
import type { ReportResolution } from "@web/ReportResolution";
import type { StatusJson } from "@web/StatusJson";
import type { TokenMixTotals } from "@web/TokenMixTotals";
import type { TokenType } from "@web/TokenType";

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

export type {
  BucketCell,
  BucketEnvelope,
  IngestHealth,
  Manifest,
  ModelTokenMix,
  Percentiles,
  StatusJson,
  TokenMixTotals,
  TokenType,
};

export type Tier = ReportResolution;

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
  if (import.meta.env.DEV) {
    const mocked = await mockFetch<T>(url);
    if (mocked !== UNHANDLED) return mocked;
  }
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

const UNHANDLED = Symbol("r2-unhandled");

async function mockFetch<T>(url: string): Promise<T | typeof UNHANDLED> {
  const { isMockableUrl, mockResponseFor } = await import("@/lib/mock-r2");
  if (!isMockableUrl(url)) return UNHANDLED;
  const data = mockResponseFor(url);
  if (data === null) throw new R2NotFoundError(url);
  return data as T;
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
