import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CostEquivalentPanel } from "@/components/CostEquivalentPanel";
import type { ResolvedRow } from "@/lib/catalog";
import { aggregateCohortCell } from "@/lib/cohort";
import type { BucketCell, BucketEnvelope, Percentiles } from "@/lib/r2";

afterEach(() => {
  document.body.replaceChildren();
});

describe("cohort panels", () => {
  it("aggregates the panel mix with the same model and provider filters as the chart", () => {
    const cell = aggregateCohortCell(bucket(), CODEX_FILTERS);

    expect(cell?.n_retained).toBe(30);
    expect(cell?.cell_count).toBe(1);
    expect(cell?.typical_mix.map((entry) => entry.model)).toEqual([
      "gpt-5-codex",
    ]);
    expect(cell?.typical_mix[0]?.tokens.input_tokens).toBeCloseTo(
      300,
    );
  });

  it("renders OpenAI plan labels and Codex costs in cost-equivalent rows", () => {
    const { container, cleanup } = render(
      <CostEquivalentPanel
        bucket={bucket()}
        filters={CODEX_FILTERS}
        primary="p50"
      />,
    );

    try {
      expect(container.textContent).toContain("ChatGPT Plus $20");
      expect(container.textContent).toContain("ChatGPT Pro $100");
      expect(container.textContent).toContain("ChatGPT Pro $200");
      expect(container.textContent).not.toContain("Claude Max");
      expect(container.textContent).toContain("$10.00");
      expect(container.textContent).toContain("$20.00");
      expect(container.textContent).toContain("$30.00");
      expect(container.textContent).not.toContain("$999.00");
    } finally {
      cleanup();
    }
  });
});

const CODEX_FILTERS: ResolvedRow = {
  provider: "openai",
  plan: "openai-pro",
  tier: "max20",
  harness: "codex",
  limit_type: "5h",
  model: "gpt-5-codex",
};

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(node);
  });

  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

function bucket(): BucketEnvelope {
  return {
    schema_version: "v1",
    bucket_ts: "2026-05-02T21:00:00Z",
    tier_resolution: "h1",
    cells: [
      codexCell("pro", "EU", 10, 10, 100),
      codexCell("max5", "EU", 20, 20, 200),
      codexCell("max20", "NA", 30, 30, 300),
      {
        subscription_tier: "max20",
        harness: "claude-code",
        region: "EU",
        limit_type: "5h",
        n_dropped: 0,
        n_retained: 100,
        api_cost_usd: percentiles(999),
        typical_mix: [
          {
            model: "claude-sonnet-4-5",
            tokens: tokens(999),
          },
        ],
      },
    ],
  };
}

function codexCell(
  subscription_tier: BucketCell["subscription_tier"],
  region: BucketCell["region"],
  p50: number,
  nRetained: number,
  input: number,
): BucketCell {
  return {
    subscription_tier,
    harness: "codex",
    region,
    limit_type: "5h",
    n_dropped: 1,
    n_retained: nRetained,
    api_cost_usd: percentiles(p50),
    typical_mix: [
      {
        model: "gpt-5-codex",
        tokens: tokens(input),
      },
      {
        model: "gpt-5",
        tokens: tokens(0),
      },
    ],
  };
}

function tokens(input: number) {
  return {
    input_tokens: input,
    output_tokens: input / 2,
    cache_read_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
    ephemeral_1h_input_tokens: 0,
    cached_input_tokens: input / 4,
    reasoning_output_tokens: input / 8,
  };
}

function percentiles(p50: number): Percentiles {
  return {
    p10: p50 - 4,
    p25: p50 - 2,
    p50,
    p75: p50 + 2,
    p90: p50 + 4,
  };
}
