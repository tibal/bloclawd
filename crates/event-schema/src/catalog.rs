//! Single source of truth for providers, plans, models, and per-model prices.
//!
//! All filter cascading on the dashboard, all API-cost aggregation pricing,
//! and all "what does the UI show" lists derive from the data declared here.
//! To add a new provider, plan, model, harness, or limit type:
//!
//! 1. Add the variant to the relevant enum in this file (or in `enums.rs`).
//! 2. Add or update the corresponding `ModelInfo` / `PlanInfo` entry below.
//! 3. Run `cargo run -p xtask -- gen-catalog` to refresh the TS catalog.
//! 4. Update tests if the new entry must be exhaustive.
//!
//! Wire compatibility: this module does NOT alter the canonical event schema.
//! `Tier`, `Model`, `Harness`, `Region`, `LimitType`, `TokenType`, `Window` keep
//! their existing JSON encodings. `Provider` and `Plan` are new and only travel
//! through the generated TS catalog.

use serde::Serialize;
use ts_rs::TS;

use crate::enums::{Harness, LimitType, Model, Region, Tier, TokenType, Window};

/// Inference / hosting provider behind a model and plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    OpenAI,
}

/// Subscription plan a user can buy. Plans are provider-scoped: name carries
/// the provider so the enum stays flat and TS-friendly. The wire schema's
/// `Tier` enum is still the price-bucket dimension that lands on R2; `Plan`
/// is a richer descriptor used by the UI and cost helpers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, TS)]
#[ts(export)]
pub enum Plan {
    #[serde(rename = "anthropic-pro")]
    AnthropicPro,
    #[serde(rename = "anthropic-max5")]
    AnthropicMax5,
    #[serde(rename = "anthropic-max20")]
    AnthropicMax20,
    #[serde(rename = "openai-plus")]
    OpenAIPlus,
    #[serde(rename = "openai-pro")]
    OpenAIPro,
}

/// USD per token for a given (TokenType, Window) on a given model.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct PricePoint {
    pub token_type: TokenType,
    pub window: Window,
    pub usd_per_token: f64,
}

/// Static description of a model: identity, provider, display name, prices.
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub struct ModelInfo {
    pub model: Model,
    pub provider: Provider,
    pub display_name: &'static str,
    pub prices: &'static [PricePoint],
}

/// Static description of a plan: identity, provider, harnesses it powers,
/// pricing, the models a subscriber can use, and which limit types apply.
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub struct PlanInfo {
    pub plan: Plan,
    pub provider: Provider,
    pub display_name: &'static str,
    pub monthly_cost_usd: f64,
    pub harnesses: &'static [Harness],
    pub models: &'static [Model],
    pub limit_types: &'static [LimitType],
    /// Mapping back to the wire `Tier` field so the dashboard can resolve a
    /// plan selection into an R2 cell filter. `None` for plans that do not
    /// (yet) appear in the published aggregates.
    pub tier_alias: Option<Tier>,
}

/// Static description of a published limit cadence. `windows_per_month` lets
/// UI cost comparisons convert subscription monthly pricing into a per-window
/// reference without duplicating cadence math in TypeScript.
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub struct LimitInfo {
    pub limit_type: LimitType,
    pub display_name: &'static str,
    pub windows_per_month: f64,
}

// --- model price tables -----------------------------------------------------

const fn full_window_prices(
    input: f64,
    output: f64,
    cached_read: f64,
    cached_write: f64,
) -> [PricePoint; 8] {
    [
        PricePoint {
            token_type: TokenType::Input,
            window: Window::FiveMin,
            usd_per_token: input,
        },
        PricePoint {
            token_type: TokenType::Output,
            window: Window::FiveMin,
            usd_per_token: output,
        },
        PricePoint {
            token_type: TokenType::CachedRead,
            window: Window::FiveMin,
            usd_per_token: cached_read,
        },
        PricePoint {
            token_type: TokenType::CachedWrite,
            window: Window::FiveMin,
            usd_per_token: cached_write,
        },
        PricePoint {
            token_type: TokenType::Input,
            window: Window::FiveH,
            usd_per_token: input,
        },
        PricePoint {
            token_type: TokenType::Output,
            window: Window::FiveH,
            usd_per_token: output,
        },
        PricePoint {
            token_type: TokenType::CachedRead,
            window: Window::FiveH,
            usd_per_token: cached_read,
        },
        PricePoint {
            token_type: TokenType::CachedWrite,
            window: Window::FiveH,
            usd_per_token: cached_write,
        },
    ]
}

// Hand-curated per-model per-token prices.
// Source: anthropic.com/pricing + openai.com/api/pricing, captured 2026-05-02.
// USD per token. Used by cron to compute public API-equivalent costs.
const OPUS47_PRICES: [PricePoint; 8] = full_window_prices(5e-6, 25e-6, 0.5e-6, 6.25e-6);
const SONNET46_PRICES: [PricePoint; 8] = full_window_prices(3e-6, 15e-6, 0.3e-6, 3.75e-6);
const SONNET45_PRICES: [PricePoint; 8] = full_window_prices(3e-6, 15e-6, 0.3e-6, 3.75e-6);
const HAIKU45_PRICES: [PricePoint; 8] = full_window_prices(1e-6, 5e-6, 0.1e-6, 1.25e-6);
const GPT5_PRICES: [PricePoint; 8] = full_window_prices(1.25e-6, 10e-6, 0.125e-6, 1.25e-6);
const GPT55_PRICES: [PricePoint; 8] = full_window_prices(5e-6, 30e-6, 0.5e-6, 5e-6);
const GPT5_CODEX_PRICES: [PricePoint; 8] = full_window_prices(1.25e-6, 10e-6, 0.125e-6, 1.25e-6);

/// Every supported model, in canonical declaration order. Indexed lookups
/// (`Model::info`) walk this list.
pub const MODELS: &[ModelInfo] = &[
    ModelInfo {
        model: Model::ClaudeOpus47,
        provider: Provider::Anthropic,
        display_name: "Claude Opus 4.7",
        prices: &OPUS47_PRICES,
    },
    ModelInfo {
        model: Model::ClaudeSonnet46,
        provider: Provider::Anthropic,
        display_name: "Claude Sonnet 4.6",
        prices: &SONNET46_PRICES,
    },
    ModelInfo {
        model: Model::ClaudeSonnet45,
        provider: Provider::Anthropic,
        display_name: "Claude Sonnet 4.5",
        prices: &SONNET45_PRICES,
    },
    ModelInfo {
        model: Model::ClaudeHaiku45,
        provider: Provider::Anthropic,
        display_name: "Claude Haiku 4.5",
        prices: &HAIKU45_PRICES,
    },
    ModelInfo {
        model: Model::Gpt5,
        provider: Provider::OpenAI,
        display_name: "GPT-5",
        prices: &GPT5_PRICES,
    },
    ModelInfo {
        model: Model::Gpt55,
        provider: Provider::OpenAI,
        display_name: "GPT-5.5",
        prices: &GPT55_PRICES,
    },
    ModelInfo {
        model: Model::Gpt5Codex,
        provider: Provider::OpenAI,
        display_name: "GPT-5 Codex",
        prices: &GPT5_CODEX_PRICES,
    },
];

// --- plan tables ------------------------------------------------------------

// Anthropic plans: Pro is the entry tier; Max5 / Max20 are the higher-usage
// tiers branded by Anthropic as 5x and 20x Pro usage. Model gating per plan
// matches the public claude.ai matrix as of 2026-05; refresh when Anthropic
// changes plan inclusions. Limit types are the cadences Bloclawd publishes.
const ANTHROPIC_PRO_MODELS: &[Model] = &[
    Model::ClaudeSonnet46,
    Model::ClaudeSonnet45,
    Model::ClaudeHaiku45,
];
const ANTHROPIC_MAX5_MODELS: &[Model] = &[
    Model::ClaudeOpus47,
    Model::ClaudeSonnet46,
    Model::ClaudeSonnet45,
    Model::ClaudeHaiku45,
];
const ANTHROPIC_MAX20_MODELS: &[Model] = ANTHROPIC_MAX5_MODELS;

// OpenAI plans: Plus and Pro currently include Codex CLI access. Plus gates
// to GPT-5 only; Pro adds GPT-5.5 and GPT-5-Codex. Refresh when OpenAI
// updates plan inclusions.
const OPENAI_PLUS_MODELS: &[Model] = &[Model::Gpt5];
const OPENAI_PRO_MODELS: &[Model] = &[Model::Gpt5, Model::Gpt55, Model::Gpt5Codex];

const ANTHROPIC_HARNESSES: &[Harness] = &[Harness::ClaudeCode];
const OPENAI_HARNESSES: &[Harness] = &[Harness::Codex];

const STANDARD_LIMITS: &[LimitType] = &[LimitType::FiveH, LimitType::Weekly];

/// Every supported plan, in canonical declaration order.
pub const PLANS: &[PlanInfo] = &[
    PlanInfo {
        plan: Plan::AnthropicPro,
        provider: Provider::Anthropic,
        display_name: "Pro",
        monthly_cost_usd: 20.0,
        harnesses: ANTHROPIC_HARNESSES,
        models: ANTHROPIC_PRO_MODELS,
        limit_types: STANDARD_LIMITS,
        tier_alias: Some(Tier::Pro),
    },
    PlanInfo {
        plan: Plan::AnthropicMax5,
        provider: Provider::Anthropic,
        display_name: "Max 5x",
        monthly_cost_usd: 100.0,
        harnesses: ANTHROPIC_HARNESSES,
        models: ANTHROPIC_MAX5_MODELS,
        limit_types: STANDARD_LIMITS,
        tier_alias: Some(Tier::Max5),
    },
    PlanInfo {
        plan: Plan::AnthropicMax20,
        provider: Provider::Anthropic,
        display_name: "Max 20x",
        monthly_cost_usd: 200.0,
        harnesses: ANTHROPIC_HARNESSES,
        models: ANTHROPIC_MAX20_MODELS,
        limit_types: STANDARD_LIMITS,
        tier_alias: Some(Tier::Max20),
    },
    PlanInfo {
        plan: Plan::OpenAIPlus,
        provider: Provider::OpenAI,
        display_name: "ChatGPT Plus",
        monthly_cost_usd: 20.0,
        harnesses: OPENAI_HARNESSES,
        models: OPENAI_PLUS_MODELS,
        limit_types: STANDARD_LIMITS,
        tier_alias: None,
    },
    PlanInfo {
        plan: Plan::OpenAIPro,
        provider: Provider::OpenAI,
        display_name: "ChatGPT Pro",
        monthly_cost_usd: 200.0,
        harnesses: OPENAI_HARNESSES,
        models: OPENAI_PRO_MODELS,
        limit_types: STANDARD_LIMITS,
        tier_alias: None,
    },
];

// --- catalog envelope -------------------------------------------------------

/// Whole catalog as a single serializable document. Used by xtask to emit
/// `apps/web/src/generated/catalog.json`; consumed by the frontend for
/// cascading filter logic.
#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub struct Catalog {
    pub providers: &'static [Provider],
    pub plans: &'static [PlanInfo],
    pub models: &'static [ModelInfo],
    pub tiers: &'static [Tier],
    pub harnesses: &'static [Harness],
    pub regions: &'static [Region],
    pub limits: &'static [LimitInfo],
    pub limit_types: &'static [LimitType],
    pub token_types: &'static [TokenType],
    pub windows: &'static [Window],
}

const ALL_PROVIDERS: &[Provider] = &[Provider::Anthropic, Provider::OpenAI];
const ALL_TIERS: &[Tier] = &[Tier::Pro, Tier::Max5, Tier::Max20];
const ALL_HARNESSES: &[Harness] = &[Harness::ClaudeCode, Harness::Codex];
const ALL_REGIONS: &[Region] = &[
    Region::Na,
    Region::Eu,
    Region::As,
    Region::Sa,
    Region::Oc,
    Region::Af,
    Region::An,
];
const ALL_LIMIT_TYPES: &[LimitType] = &[LimitType::FiveH, LimitType::Weekly];
pub const LIMITS: &[LimitInfo] = &[
    LimitInfo {
        limit_type: LimitType::FiveH,
        display_name: "5h",
        windows_per_month: (30.0 * 24.0) / 5.0,
    },
    LimitInfo {
        limit_type: LimitType::Weekly,
        display_name: "weekly",
        windows_per_month: 4.0,
    },
];
const ALL_TOKEN_TYPES: &[TokenType] = &[
    TokenType::Input,
    TokenType::Output,
    TokenType::CachedRead,
    TokenType::CachedWrite,
];
const ALL_WINDOWS: &[Window] = &[Window::FiveMin, Window::FiveH];

pub const CATALOG: Catalog = Catalog {
    providers: ALL_PROVIDERS,
    plans: PLANS,
    models: MODELS,
    tiers: ALL_TIERS,
    harnesses: ALL_HARNESSES,
    regions: ALL_REGIONS,
    limits: LIMITS,
    limit_types: ALL_LIMIT_TYPES,
    token_types: ALL_TOKEN_TYPES,
    windows: ALL_WINDOWS,
};

// --- accessors --------------------------------------------------------------

impl Provider {
    pub fn plans(self) -> impl Iterator<Item = &'static PlanInfo> {
        PLANS.iter().filter(move |p| p.provider == self)
    }

    pub fn models(self) -> impl Iterator<Item = &'static ModelInfo> {
        MODELS.iter().filter(move |m| m.provider == self)
    }

    pub fn harnesses(self) -> impl Iterator<Item = Harness> {
        // Distinct harnesses across this provider's plans, in declaration order.
        let mut seen: Vec<Harness> = Vec::new();
        PLANS
            .iter()
            .filter(move |p| p.provider == self)
            .flat_map(|p| p.harnesses.iter().copied())
            .filter(move |h| {
                if seen.contains(h) {
                    false
                } else {
                    seen.push(*h);
                    true
                }
            })
    }
}

impl Plan {
    pub fn info(self) -> &'static PlanInfo {
        PLANS
            .iter()
            .find(|p| p.plan == self)
            .expect("every Plan variant has a PlanInfo entry; CATALOG must stay exhaustive")
    }

    pub fn provider(self) -> Provider {
        self.info().provider
    }

    pub fn models(self) -> &'static [Model] {
        self.info().models
    }

    pub fn includes_model(self, model: Model) -> bool {
        self.info().models.contains(&model)
    }
}

impl Model {
    pub fn info(self) -> &'static ModelInfo {
        MODELS
            .iter()
            .find(|m| m.model == self)
            .expect("every Model variant has a ModelInfo entry; MODELS must stay exhaustive")
    }

    pub fn provider(self) -> Provider {
        self.info().provider
    }

    pub fn price(self, token_type: TokenType, window: Window) -> Option<f64> {
        self.info()
            .prices
            .iter()
            .find(|p| p.token_type == token_type && p.window == window)
            .map(|p| p.usd_per_token)
    }

    /// Plans whose subscription includes this model.
    pub fn plans(self) -> impl Iterator<Item = &'static PlanInfo> {
        PLANS.iter().filter(move |p| p.models.contains(&self))
    }
}

impl Harness {
    /// Plans that drive this harness.
    pub fn plans(self) -> impl Iterator<Item = &'static PlanInfo> {
        PLANS.iter().filter(move |p| p.harnesses.contains(&self))
    }
}

impl LimitType {
    pub fn info(self) -> &'static LimitInfo {
        LIMITS
            .iter()
            .find(|limit| limit.limit_type == self)
            .expect("every LimitType variant has a LimitInfo entry; CATALOG must stay exhaustive")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_MODELS: &[Model] = &[
        Model::ClaudeOpus47,
        Model::ClaudeSonnet46,
        Model::ClaudeSonnet45,
        Model::ClaudeHaiku45,
        Model::Gpt5,
        Model::Gpt55,
        Model::Gpt5Codex,
    ];
    const ALL_PLANS: &[Plan] = &[
        Plan::AnthropicPro,
        Plan::AnthropicMax5,
        Plan::AnthropicMax20,
        Plan::OpenAIPlus,
        Plan::OpenAIPro,
    ];
    const ALL_TIERS: &[Tier] = &[Tier::Pro, Tier::Max5, Tier::Max20];
    const ALL_REGIONS: &[Region] = &[
        Region::Na,
        Region::Eu,
        Region::As,
        Region::Sa,
        Region::Oc,
        Region::Af,
        Region::An,
    ];
    const ALL_LIMIT_TYPES: &[LimitType] = &[LimitType::FiveH, LimitType::Weekly];

    #[test]
    fn every_model_variant_has_a_model_info_row() {
        for model in ALL_MODELS {
            let info = model.info();
            assert_eq!(info.model, *model);
            assert!(!info.display_name.is_empty());
        }
    }

    #[test]
    fn every_plan_variant_has_a_plan_info_row() {
        for plan in ALL_PLANS {
            let info = plan.info();
            assert_eq!(info.plan, *plan);
            assert!(!info.display_name.is_empty());
            assert!(info.monthly_cost_usd > 0.0);
            assert!(!info.harnesses.is_empty());
            assert!(!info.models.is_empty());
            assert!(!info.limit_types.is_empty());
        }
    }

    #[test]
    fn every_tier_variant_is_in_catalog() {
        assert_eq!(CATALOG.tiers, ALL_TIERS);
    }

    #[test]
    fn every_region_variant_is_in_catalog() {
        assert_eq!(CATALOG.regions, ALL_REGIONS);
    }

    #[test]
    fn every_limit_type_has_limit_info() {
        for limit_type in ALL_LIMIT_TYPES {
            let info = limit_type.info();
            assert_eq!(info.limit_type, *limit_type);
            assert!(!info.display_name.is_empty());
            assert!(info.windows_per_month.is_finite());
            assert!(info.windows_per_month > 0.0);
        }
    }

    #[test]
    fn every_model_token_type_window_tuple_has_a_price() {
        for model in ALL_MODELS {
            for token_type in [
                TokenType::Input,
                TokenType::Output,
                TokenType::CachedRead,
                TokenType::CachedWrite,
            ] {
                for window in [Window::FiveMin, Window::FiveH] {
                    let price = model.price(token_type, window).unwrap_or_else(|| {
                        panic!("missing price for {model:?} {token_type:?} {window:?}")
                    });
                    assert!(price.is_finite() && price > 0.0);
                }
            }
        }
    }

    #[test]
    fn anthropic_cached_read_is_cheaper_than_input() {
        for model in ALL_MODELS {
            if model.provider() != Provider::Anthropic {
                continue;
            }
            for window in [Window::FiveMin, Window::FiveH] {
                let cached = model.price(TokenType::CachedRead, window).unwrap();
                let input = model.price(TokenType::Input, window).unwrap();
                assert!(cached < input, "{model:?} {window:?}");
            }
        }
    }

    #[test]
    fn plan_models_belong_to_plan_provider() {
        for plan in ALL_PLANS {
            let info = plan.info();
            for model in info.models {
                assert_eq!(
                    model.provider(),
                    info.provider,
                    "{plan:?} lists {model:?} from a different provider"
                );
            }
        }
    }

    #[test]
    fn plan_harnesses_are_consistent_with_provider() {
        for plan in ALL_PLANS {
            let info = plan.info();
            for harness in info.harnesses {
                let valid = match (info.provider, harness) {
                    (Provider::Anthropic, Harness::ClaudeCode) => true,
                    (Provider::OpenAI, Harness::Codex) => true,
                    _ => false,
                };
                assert!(
                    valid,
                    "{plan:?} harness {harness:?} mismatched with provider"
                );
            }
        }
    }

    #[test]
    fn provider_plans_are_partitioned() {
        let total: usize = [Provider::Anthropic, Provider::OpenAI]
            .iter()
            .map(|p| p.plans().count())
            .sum();
        assert_eq!(total, PLANS.len());
    }

    #[test]
    fn provider_models_are_partitioned() {
        let total: usize = [Provider::Anthropic, Provider::OpenAI]
            .iter()
            .map(|p| p.models().count())
            .sum();
        assert_eq!(total, MODELS.len());
    }

    #[test]
    fn anthropic_pro_excludes_opus() {
        assert!(!Plan::AnthropicPro.includes_model(Model::ClaudeOpus47));
    }

    #[test]
    fn anthropic_max_plans_include_opus() {
        assert!(Plan::AnthropicMax5.includes_model(Model::ClaudeOpus47));
        assert!(Plan::AnthropicMax20.includes_model(Model::ClaudeOpus47));
    }

    #[test]
    fn openai_plus_is_gpt5_only() {
        assert_eq!(Plan::OpenAIPlus.models(), &[Model::Gpt5]);
    }

    #[test]
    fn anthropic_plans_alias_to_wire_tier() {
        assert_eq!(Plan::AnthropicPro.info().tier_alias, Some(Tier::Pro));
        assert_eq!(Plan::AnthropicMax5.info().tier_alias, Some(Tier::Max5));
        assert_eq!(Plan::AnthropicMax20.info().tier_alias, Some(Tier::Max20));
    }

    #[test]
    fn openai_plans_have_no_wire_tier_yet() {
        assert!(Plan::OpenAIPlus.info().tier_alias.is_none());
        assert!(Plan::OpenAIPro.info().tier_alias.is_none());
    }

    #[test]
    fn provider_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&Provider::Anthropic).unwrap(),
            r#""anthropic""#
        );
        assert_eq!(
            serde_json::to_string(&Provider::OpenAI).unwrap(),
            r#""openai""#
        );
    }

    #[test]
    fn plan_serializes_with_provider_prefix() {
        assert_eq!(
            serde_json::to_string(&Plan::AnthropicPro).unwrap(),
            r#""anthropic-pro""#
        );
        assert_eq!(
            serde_json::to_string(&Plan::OpenAIPro).unwrap(),
            r#""openai-pro""#
        );
    }

    #[test]
    fn catalog_top_level_serializes() {
        let json = serde_json::to_string(&CATALOG).unwrap();
        assert!(json.contains(r#""anthropic-pro""#));
        assert!(json.contains(r#""claude-opus-4-7""#));
        assert!(json.contains(r#""gpt-5""#));
        assert!(json.contains(r#""tiers""#));
        assert!(json.contains(r#""regions""#));
        assert!(json.contains(r#""5h""#));
        assert!(json.contains(r#""weekly""#));
        assert!(json.contains(r#""windows_per_month""#));
    }
}
