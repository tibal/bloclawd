//! Compat shim over `catalog`. Pricing data lives in `catalog::MODELS` per
//! `ModelInfo::prices`. This module preserves the `model_price_lookup` API and
//! exposes a flattened `MODEL_PRICES` table for code that prefers the tuple form.

use crate::catalog::MODELS;
use crate::enums::{Model, TokenType};

/// `(Model, TokenType) -> usd_per_token`. Exact contents match
/// `catalog::MODELS` flattened in declaration order.
pub fn lookup(model: Model, token_type: TokenType) -> Option<f64> {
    model.price(token_type)
}

/// Lazy-built flat tuple table for callers that walk the cartesian product.
/// Built once on first access from the catalog.
pub static MODEL_PRICES: std::sync::LazyLock<Vec<(Model, TokenType, f64)>> =
    std::sync::LazyLock::new(|| {
        let mut rows = Vec::new();
        for info in MODELS {
            for price in info.prices {
                rows.push((info.model, price.token_type, price.usd_per_token));
            }
        }
        rows
    });

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
    const ALL_TOKEN_TYPES: &[TokenType] = &[
        TokenType::InputTokens,
        TokenType::OutputTokens,
        TokenType::CacheReadInputTokens,
        TokenType::Ephemeral5mInputTokens,
        TokenType::Ephemeral1hInputTokens,
        TokenType::CachedInputTokens,
        TokenType::ReasoningOutputTokens,
    ];

    #[test]
    fn every_model_token_type_tuple_has_exactly_one_row() {
        for model in ALL_MODELS {
            for token_type in ALL_TOKEN_TYPES {
                let count = MODEL_PRICES
                    .iter()
                    .filter(|(m, tt, _)| m == model && tt == token_type)
                    .count();
                assert_eq!(
                    count, 1,
                    "expected exactly one price row for {model:?} {token_type:?}"
                );
            }
        }
    }

    #[test]
    fn prices_are_finite_and_positive() {
        for (_, _, price) in MODEL_PRICES.iter() {
            assert!(price.is_finite(), "price should be finite");
            assert!(*price > 0.0, "price should be positive");
        }
    }

    #[test]
    fn lookup_returns_positive_price_for_known_combo() {
        let price = lookup(Model::ClaudeSonnet45, TokenType::InputTokens)
            .expect("known combo should have a price");
        assert!(price > 0.0);
    }
}
