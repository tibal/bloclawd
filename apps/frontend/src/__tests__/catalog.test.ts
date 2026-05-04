import { describe, expect, it } from "vitest";

import {
  CATALOG,
  cascade,
  modelOptions,
  planOptions,
  providerOptions,
  tierOptions,
} from "@/lib/catalog";

describe("catalog", () => {
  it("declares two providers", () => {
    expect(CATALOG.providers).toEqual(["anthropic", "openai"]);
  });

  it("declares anthropic and openai plans with non-empty model lists", () => {
    expect(CATALOG.plans.length).toBeGreaterThan(0);
    for (const plan of CATALOG.plans) {
      expect(plan.models.length).toBeGreaterThan(0);
      expect(plan.harnesses.length).toBeGreaterThan(0);
      expect(plan.limit_types.length).toBeGreaterThan(0);
      expect(plan.monthly_cost_usd).toBeGreaterThan(0);
    }
  });

  it("anthropic plans alias to wire tier and openai plans do not", () => {
    for (const plan of CATALOG.plans) {
      if (plan.provider === "anthropic") {
        expect(plan.tier_alias).not.toBeNull();
      } else {
        expect(plan.tier_alias).toBeNull();
      }
    }
  });

  it("every plan model belongs to the plan provider", () => {
    for (const plan of CATALOG.plans) {
      for (const modelName of plan.models) {
        const info = CATALOG.models.find((m) => m.model === modelName);
        expect(info).toBeDefined();
        expect(info!.provider).toBe(plan.provider);
      }
    }
  });

  it("every model has a price for every (token type, window)", () => {
    for (const model of CATALOG.models) {
      for (const tt of CATALOG.token_types) {
        for (const w of CATALOG.windows) {
          const price = model.prices.find(
            (p) => p.token_type === tt && p.window === w,
          );
          expect(price).toBeDefined();
          expect(price!.usd_per_token).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("cascade", () => {
  it("setting plan forces provider and tier", () => {
    const next = cascade({}, { plan: "anthropic-max20" });
    expect(next.plan).toBe("anthropic-max20");
    expect(next.provider).toBe("anthropic");
    expect(next.tier).toBe("max20");
  });

  it("setting plan clears an incompatible model", () => {
    const next = cascade(
      { plan: "anthropic-max20", model: "gpt-5" },
      { plan: "anthropic-pro" },
    );
    expect(next.plan).toBe("anthropic-pro");
    expect(next.model).toBeUndefined();
  });

  it("setting provider clears a plan from a different provider", () => {
    const next = cascade(
      { plan: "openai-pro", provider: "openai" },
      { provider: "anthropic" },
    );
    expect(next.provider).toBe("anthropic");
    expect(next.plan).toBeUndefined();
    expect(next.tier).toBeUndefined();
  });

  it("setting model forces provider and clears incompatible plan", () => {
    const next = cascade(
      { plan: "anthropic-pro" },
      { model: "claude-opus-4-7" },
    );
    expect(next.provider).toBe("anthropic");
    // Pro excludes Opus, so the plan must clear.
    expect(next.plan).toBeUndefined();
  });

  it("setting tier clears a plan with a different tier alias", () => {
    const next = cascade({ plan: "anthropic-max20" }, { tier: "pro" });
    expect(next.tier).toBe("pro");
    expect(next.plan).toBeUndefined();
  });
});

describe("filter options", () => {
  it("provider options list both providers", () => {
    expect(providerOptions().map((o) => o.value)).toEqual([
      "anthropic",
      "openai",
    ]);
  });

  it("plan options narrow when provider is set", () => {
    const all = planOptions({});
    const anthropicOnly = planOptions({ provider: "anthropic" });
    expect(all.length).toBeGreaterThan(anthropicOnly.length);
    expect(anthropicOnly.every((o) => o.value.startsWith("anthropic-"))).toBe(
      true,
    );
  });

  it("model options narrow when plan is set", () => {
    const proOnly = modelOptions({ plan: "anthropic-pro" });
    expect(proOnly.map((o) => o.value)).not.toContain("claude-opus-4-7");
  });

  it("tier options expose every wire tier alias", () => {
    expect(tierOptions().map((o) => o.value).sort()).toEqual([
      "max20",
      "max5",
      "pro",
    ]);
  });
});
