//! Compat shim over `catalog`. Pricing data lives in `catalog::MODELS` per
//! `ModelInfo::prices`. This module preserves the `model_price_lookup` API
//! that the cron weight-fit calls and exposes a flattened `MODEL_PRICES` table
//! for code that prefers the tuple form.

use crate::catalog::MODELS;
use crate::enums::{Model, TokenType, Window};

/// `(Model, TokenType, Window) -> usd_per_token`. Exact contents match
/// `catalog::MODELS` flattened in declaration order.
pub fn lookup(model: Model, token_type: TokenType, window: Window) -> Option<f64> {
    model.price(token_type, window)
}

/// Lazy-built flat tuple table for callers that walk the cartesian product.
/// Built once on first access from the catalog.
pub static MODEL_PRICES: std::sync::LazyLock<Vec<(Model, TokenType, Window, f64)>> =
    std::sync::LazyLock::new(|| {
        let mut rows = Vec::new();
        for info in MODELS {
            for price in info.prices {
                rows.push((
                    info.model,
                    price.token_type,
                    price.window,
                    price.usd_per_token,
                ));
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
        TokenType::Input,
        TokenType::Output,
        TokenType::CachedRead,
        TokenType::CachedWrite,
    ];
    const ALL_WINDOWS: &[Window] = &[Window::FiveMin, Window::FiveH];

    #[test]
    fn every_model_token_type_window_tuple_has_exactly_one_row() {
        for model in ALL_MODELS {
            for token_type in ALL_TOKEN_TYPES {
                for window in ALL_WINDOWS {
                    let count = MODEL_PRICES
                        .iter()
                        .filter(|(m, tt, w, _)| m == model && tt == token_type && w == window)
                        .count();
                    assert_eq!(
                        count, 1,
                        "expected exactly one price row for {model:?} {token_type:?} {window:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn prices_are_finite_and_positive() {
        for (_, _, _, price) in MODEL_PRICES.iter() {
            assert!(price.is_finite(), "price should be finite");
            assert!(*price > 0.0, "price should be positive");
        }
    }

    #[test]
    fn lookup_returns_positive_price_for_known_combo() {
        let price = lookup(Model::ClaudeSonnet45, TokenType::Input, Window::FiveMin)
            .expect("known combo should have a price");
        assert!(price > 0.0);
    }
}
