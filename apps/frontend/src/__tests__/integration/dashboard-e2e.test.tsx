import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import type { BucketEnvelope, Manifest, StatusJson } from "@/lib/r2";

vi.mock("@/components/Chart", () => ({
  Chart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div aria-label={ariaLabel} role="img">
      chart
    </div>
  ),
}));

// Mirrors the same-origin default in src/lib/r2.ts so query keys match.
const R2_BASE_URL = "";
const REPORTS_ROOT = "reports/v1";
const NOW = Date.UTC(2026, 4, 2, 15, 0, 0);
const H1_PATHS = [
  "2026/05/02/10.json",
  "2026/05/02/11.json",
  "2026/05/02/12.json",
  "2026/05/02/13.json",
  "2026/05/02/14.json",
];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("dashboard end-to-end with mocked R2 cache", () => {
  it("renders chart, table rows, and chrome for a max20 cohort", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const queryClient = queryClientWithR2Data();
    const { container, cleanup } = await renderDashboard(
      "/dashboard?tier=max20&harness=cc&region=EU&limit_type=5h&window=7d&bands=p25-p75&compare=false",
      queryClient,
    );

    try {
      expect(container.querySelector('[role="img"]')).not.toBeNull();
      expect(
        container.querySelectorAll(
          'table[aria-label="Percentile values per timestamp"] tbody tr',
        ),
      ).toHaveLength(5);
      expect(container.textContent).toMatch(/12,?345 events/);
      expect(container.textContent).toContain("~230 contributors");
      expect(container.textContent).toContain("Healthy");
    } finally {
      cleanup();
    }
  });
});

async function renderDashboard(path: string, queryClient: QueryClient) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({ history, routeTree });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  await router.load();
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    container,
    cleanup: () => {
      root.unmount();
      queryClient.clear();
      container.remove();
    },
  };
}

function queryClientWithR2Data(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  queryClient.setQueryData(["r2", reportUrl("manifest.json")], manifest());
  queryClient.setQueryData(["r2", reportUrl("_status.json")], statusJson());
  for (const [idx, path] of H1_PATHS.entries()) {
    queryClient.setQueryData(
      ["r2", reportUrl(`h1/${path}`)],
      bucketEnvelope(path, idx),
    );
  }

  return queryClient;
}

function manifest(): Manifest {
  return {
    schema_version: "v1",
    last_updated_ts: "2026-05-02T14:00:00Z",
    tiers: {
      q15: [],
      h1: H1_PATHS,
      d1: [],
    },
  };
}

function statusJson(): StatusJson {
  return {
    schema_version: "v1",
    last_cron_success_ts: "2026-05-02T14:45:00Z",
    last_cron_attempted_ts: "2026-05-02T14:45:00Z",
    ingest_health: "healthy",
    total_events_lifetime: 12_345,
    approximate_contributors_30d: 230,
    approximate_contributors_window_days: 30,
  };
}

function bucketEnvelope(path: string, idx: number): BucketEnvelope {
  return {
    schema_version: "v1",
    bucket_ts: bucketTimestamp(path),
    tier_resolution: "h1",
    bin_edges: [1024, 2048, 4096, 8192, 16_384],
    cells: [
      {
        tier: "max20",
        harness: "claude-code",
        region: "EU",
        limit_type: "5h",
        n_submissions: 30 + idx,
        trim_rate: 0,
        trim_rate_alert: false,
        insufficient_data: false,
        unified_cost: {
          Mean: {
            p10: 100 + idx,
            p25: 200 + idx,
            p50: 300 + idx,
            p75: 400 + idx,
            p90: 500 + idx,
          },
        },
        models: [],
      },
      {
        tier: "max5",
        harness: "claude-code",
        region: "EU",
        limit_type: "5h",
        n_submissions: 4,
        trim_rate: 0,
        trim_rate_alert: false,
        insufficient_data: true,
        unified_cost: null,
        models: [],
      },
    ],
  };
}

function bucketTimestamp(path: string): string {
  const [year, month, day, hour] = path.replace(".json", "").split("/");
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour)),
  ).toISOString();
}

function reportUrl(path: string): string {
  return `${R2_BASE_URL}/${REPORTS_ROOT}/${path}`;
}
