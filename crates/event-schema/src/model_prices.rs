//! Hand-curated per-model per-token pricing priors (D-102).
//! Source: https://www.anthropic.com/pricing plus model release pages, and
//! https://openai.com/api/pricing/, captured 2026-05-02. USD per token.
//! Used as the ridge-regression prior for AGGR-15 weight fits.
//! Audited in PR; tunable post-staging-UAT (D-100 + AGGR-15).

use crate::enums::{Model, TokenType, Window};

/// (Model, TokenType, Window, price_USD_per_token).
/// Every (Model, TokenType, Window) tuple must appear exactly once.
#[rustfmt::skip]
pub const MODEL_PRICES: &[(Model, TokenType, Window, f64)] = &[
        (Model::ClaudeOpus47, TokenType::Input, Window::FiveMin, 5e-6),
        (Model::ClaudeOpus47, TokenType::Output, Window::FiveMin, 25e-6),
        (Model::ClaudeOpus47, TokenType::CachedRead, Window::FiveMin, 0.5e-6),
        (Model::ClaudeOpus47, TokenType::CachedWrite, Window::FiveMin, 6.25e-6),
        (Model::ClaudeOpus47, TokenType::Input, Window::FiveH, 5e-6),
        (Model::ClaudeOpus47, TokenType::Output, Window::FiveH, 25e-6),
        (Model::ClaudeOpus47, TokenType::CachedRead, Window::FiveH, 0.5e-6),
        (Model::ClaudeOpus47, TokenType::CachedWrite, Window::FiveH, 6.25e-6),
        (Model::ClaudeSonnet46, TokenType::Input, Window::FiveMin, 3e-6),
        (Model::ClaudeSonnet46, TokenType::Output, Window::FiveMin, 15e-6),
        (Model::ClaudeSonnet46, TokenType::CachedRead, Window::FiveMin, 0.3e-6),
        (Model::ClaudeSonnet46, TokenType::CachedWrite, Window::FiveMin, 3.75e-6),
        (Model::ClaudeSonnet46, TokenType::Input, Window::FiveH, 3e-6),
        (Model::ClaudeSonnet46, TokenType::Output, Window::FiveH, 15e-6),
        (Model::ClaudeSonnet46, TokenType::CachedRead, Window::FiveH, 0.3e-6),
        (Model::ClaudeSonnet46, TokenType::CachedWrite, Window::FiveH, 3.75e-6),
        (Model::ClaudeSonnet45, TokenType::Input, Window::FiveMin, 3e-6),
        (Model::ClaudeSonnet45, TokenType::Output, Window::FiveMin, 15e-6),
        (Model::ClaudeSonnet45, TokenType::CachedRead, Window::FiveMin, 0.3e-6),
        (Model::ClaudeSonnet45, TokenType::CachedWrite, Window::FiveMin, 3.75e-6),
        (Model::ClaudeSonnet45, TokenType::Input, Window::FiveH, 3e-6),
        (Model::ClaudeSonnet45, TokenType::Output, Window::FiveH, 15e-6),
        (Model::ClaudeSonnet45, TokenType::CachedRead, Window::FiveH, 0.3e-6),
        (Model::ClaudeSonnet45, TokenType::CachedWrite, Window::FiveH, 3.75e-6),
        (Model::ClaudeHaiku45, TokenType::Input, Window::FiveMin, 1e-6),
        (Model::ClaudeHaiku45, TokenType::Output, Window::FiveMin, 5e-6),
        (Model::ClaudeHaiku45, TokenType::CachedRead, Window::FiveMin, 0.1e-6),
        (Model::ClaudeHaiku45, TokenType::CachedWrite, Window::FiveMin, 1.25e-6),
        (Model::ClaudeHaiku45, TokenType::Input, Window::FiveH, 1e-6),
        (Model::ClaudeHaiku45, TokenType::Output, Window::FiveH, 5e-6),
        (Model::ClaudeHaiku45, TokenType::CachedRead, Window::FiveH, 0.1e-6),
        (Model::ClaudeHaiku45, TokenType::CachedWrite, Window::FiveH, 1.25e-6),
        (Model::Gpt5, TokenType::Input, Window::FiveMin, 1.25e-6),
        (Model::Gpt5, TokenType::Output, Window::FiveMin, 10e-6),
        (Model::Gpt5, TokenType::CachedRead, Window::FiveMin, 0.125e-6),
        (Model::Gpt5, TokenType::CachedWrite, Window::FiveMin, 1.25e-6),
        (Model::Gpt5, TokenType::Input, Window::FiveH, 1.25e-6),
        (Model::Gpt5, TokenType::Output, Window::FiveH, 10e-6),
        (Model::Gpt5, TokenType::CachedRead, Window::FiveH, 0.125e-6),
        (Model::Gpt5, TokenType::CachedWrite, Window::FiveH, 1.25e-6),
        (Model::Gpt55, TokenType::Input, Window::FiveMin, 5e-6),
        (Model::Gpt55, TokenType::Output, Window::FiveMin, 30e-6),
        (Model::Gpt55, TokenType::CachedRead, Window::FiveMin, 0.5e-6),
        (Model::Gpt55, TokenType::CachedWrite, Window::FiveMin, 5e-6),
        (Model::Gpt55, TokenType::Input, Window::FiveH, 5e-6),
        (Model::Gpt55, TokenType::Output, Window::FiveH, 30e-6),
        (Model::Gpt55, TokenType::CachedRead, Window::FiveH, 0.5e-6),
        (Model::Gpt55, TokenType::CachedWrite, Window::FiveH, 5e-6),
        (Model::Gpt5Codex, TokenType::Input, Window::FiveMin, 1.25e-6),
        (Model::Gpt5Codex, TokenType::Output, Window::FiveMin, 10e-6),
        (Model::Gpt5Codex, TokenType::CachedRead, Window::FiveMin, 0.125e-6),
        (Model::Gpt5Codex, TokenType::CachedWrite, Window::FiveMin, 1.25e-6),
        (Model::Gpt5Codex, TokenType::Input, Window::FiveH, 1.25e-6),
        (Model::Gpt5Codex, TokenType::Output, Window::FiveH, 10e-6),
        (Model::Gpt5Codex, TokenType::CachedRead, Window::FiveH, 0.125e-6),
        (Model::Gpt5Codex, TokenType::CachedWrite, Window::FiveH, 1.25e-6),
];

pub fn lookup(model: Model, token_type: TokenType, window: Window) -> Option<f64> {
    MODEL_PRICES
        .iter()
        .find(|(m, tt, w, _)| *m == model && *tt == token_type && *w == window)
        .map(|(_, _, _, price)| *price)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enums::{Model, TokenType, Window};

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
    const ANTHROPIC_MODELS: &[Model] = &[
        Model::ClaudeOpus47,
        Model::ClaudeSonnet46,
        Model::ClaudeSonnet45,
        Model::ClaudeHaiku45,
    ];

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
        for (_, _, _, price) in MODEL_PRICES {
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

    #[test]
    fn cached_read_is_cheaper_than_input() {
        for model in ANTHROPIC_MODELS {
            for window in ALL_WINDOWS {
                let cached_read = lookup(*model, TokenType::CachedRead, *window)
                    .expect("cached read price exists");
                let input = lookup(*model, TokenType::Input, *window).expect("input price exists");
                assert!(
                    cached_read < input,
                    "{model:?} cached read should be cheaper than input for {window:?}"
                );
            }
        }
    }
}
