import { describe, expect, it } from "vitest";

import {
  analyzeRankReport,
  decodeRankReport,
  encodeRankReport,
  parseRankInput,
} from "@/lib/rank-report";

const DRY_RUN = `bloclawd dry-run - group 10000000... - 1 model

Limit card: claude-code / max20 / NA / 5h
Paste the block below into https://bloclawd.com/rank

--- bloclawd rank input ---
{
    "bloclawd_rank_v": 1,
    "harness": "claude-code",
    "limit_type": "5h",
    "models": [
        {
            "model": "claude-sonnet-4-5",
            "tokens": {
                "cache_read_input_tokens": 14,
                "ephemeral_5m_input_tokens": 8,
                "input_tokens": 150,
                "output_tokens": 275
            }
        }
    ],
    "region": "NA",
    "tier": "max20"
}
--- end bloclawd rank input ---`;

describe("rank report parsing", () => {
  it("parses the human dry-run rank block", () => {
    const report = parseRankInput(DRY_RUN);

    expect(report.harness).toBe("claude-code");
    expect(report.tier).toBe("max20");
    expect(report.region).toBe("NA");
    expect(report.limit_type).toBe("5h");
    expect(report.models).toHaveLength(1);
    expect(report.models[0]?.model).toBe("claude-sonnet-4-5");
    expect(report.models[0]?.tokens.output_tokens).toBe(275);
  });

  it("round-trips through the URL snapshot", () => {
    const report = parseRankInput(DRY_RUN);
    const encoded = encodeRankReport(report);
    const decoded = decodeRankReport(encoded);

    expect(decoded).toEqual(report);
  });

  it("normalizes submitted-event JSON into a report", () => {
    const report = parseRankInput(`{
      "event_id": "event",
      "challenge_id": "",
      "sig": "",
      "nonce": "",
      "submission_group_id": "group",
      "limit_type": "5h",
      "payload": {
        "v": 1,
        "harness": "codex",
        "model": "gpt-5.5",
        "region": "EU",
        "tier": "max5",
        "tokens": {
          "input_tokens": 500,
          "output_tokens": 75,
          "cached_input_tokens": 48,
          "reasoning_output_tokens": 15
        }
      }
    }`);

    expect(report.harness).toBe("codex");
    expect(report.region).toBe("EU");
    expect(report.models[0]?.tokens.cached_input_tokens).toBe(48);
  });
});

describe("rank analysis", () => {
  it("classifies ratio and recommendations from cohort percentiles", () => {
    const report = parseRankInput(DRY_RUN);
    const analysis = analyzeRankReport(report, {
      harness: "claude-code",
      region: "NA",
      subscription_tier: "max20",
      limit_type: "5h",
      api_cost_usd: { p10: 0.001, p25: 0.003, p50: 0.005, p75: 0.008, p90: 0.012 },
      n_dropped: 0,
      n_retained: 10,
      typical_mix: report.models,
      cell_count: 1,
    });

    expect(analysis.apiCostUsd).toBeGreaterThan(0);
    expect(analysis.ratioToMedian).not.toBeNull();
    expect(analysis.segment).toMatch(/headroom|limit|wall/i);
    expect(analysis.recommendations.length).toBeGreaterThanOrEqual(2);
  });
});
