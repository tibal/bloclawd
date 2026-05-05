//! Per-model raw token aggregator.

use std::collections::HashMap;

use bloclawd_schema::{Model, TokenCounts};

use crate::parsers::cc::CcEvent;
use crate::parsers::codex::CodexEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    FiveHour,
    Week,
}

pub fn aggregate(
    cc_events: &[CcEvent],
    codex_events: &[CodexEvent],
    _window_kind: WindowKind,
) -> HashMap<Model, TokenCounts> {
    let mut by_model: HashMap<Model, TokenCounts> = HashMap::new();
    for event in cc_events {
        add_counts(
            by_model.entry(event.model).or_insert_with(zero_counts),
            TokenCounts {
                input_tokens: event.input_tokens,
                output_tokens: event.output_tokens,
                cache_read_input_tokens: event.cache_read_input_tokens,
                ephemeral_5m_input_tokens: event.ephemeral_5m_input_tokens,
                ephemeral_1h_input_tokens: event.ephemeral_1h_input_tokens,
                cached_input_tokens: 0,
                reasoning_output_tokens: 0,
            },
        );
    }
    for event in codex_events {
        add_counts(
            by_model.entry(event.model).or_insert_with(zero_counts),
            TokenCounts {
                input_tokens: event.input_tokens,
                output_tokens: event.output_tokens,
                cache_read_input_tokens: 0,
                ephemeral_5m_input_tokens: 0,
                ephemeral_1h_input_tokens: 0,
                cached_input_tokens: event.cached_input_tokens,
                reasoning_output_tokens: event.reasoning_output_tokens,
            },
        );
    }

    by_model.retain(|_, counts| !is_zero(counts));
    by_model
}

fn zero_counts() -> TokenCounts {
    TokenCounts {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        ephemeral_5m_input_tokens: 0,
        ephemeral_1h_input_tokens: 0,
        cached_input_tokens: 0,
        reasoning_output_tokens: 0,
    }
}

fn add_counts(total: &mut TokenCounts, next: TokenCounts) {
    total.input_tokens = total.input_tokens.saturating_add(next.input_tokens);
    total.output_tokens = total.output_tokens.saturating_add(next.output_tokens);
    total.cache_read_input_tokens = total
        .cache_read_input_tokens
        .saturating_add(next.cache_read_input_tokens);
    total.ephemeral_5m_input_tokens = total
        .ephemeral_5m_input_tokens
        .saturating_add(next.ephemeral_5m_input_tokens);
    total.ephemeral_1h_input_tokens = total
        .ephemeral_1h_input_tokens
        .saturating_add(next.ephemeral_1h_input_tokens);
    total.cached_input_tokens = total
        .cached_input_tokens
        .saturating_add(next.cached_input_tokens);
    total.reasoning_output_tokens = total
        .reasoning_output_tokens
        .saturating_add(next.reasoning_output_tokens);
}

fn is_zero(counts: &TokenCounts) -> bool {
    counts.input_tokens == 0
        && counts.output_tokens == 0
        && counts.cache_read_input_tokens == 0
        && counts.ephemeral_5m_input_tokens == 0
        && counts.ephemeral_1h_input_tokens == 0
        && counts.cached_input_tokens == 0
        && counts.reasoning_output_tokens == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(minute: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).single().unwrap()
            + chrono::Duration::minutes(minute)
    }

    fn cc_event(model: Model, minute: i64, input: u64, output: u64) -> CcEvent {
        CcEvent {
            timestamp_utc: ts(minute),
            request_id: format!("req_{minute}"),
            model,
            input_tokens: input,
            output_tokens: output,
            cache_read_input_tokens: 3,
            ephemeral_5m_input_tokens: 4,
            ephemeral_1h_input_tokens: 0,
        }
    }

    fn codex_event(model: Model, minute: i64, input: u64, output: u64) -> CodexEvent {
        CodexEvent {
            timestamp_utc: ts(minute),
            model,
            input_tokens: input,
            output_tokens: output,
            cached_input_tokens: 2,
            reasoning_output_tokens: 1,
        }
    }

    #[test]
    fn week_mode_uses_the_same_raw_token_aggregation() {
        let counts = aggregate(&[], &[], WindowKind::Week);
        assert!(counts.is_empty());
    }

    #[test]
    fn five_hour_mode_accepts_empty_input() {
        let counts = aggregate(&[], &[], WindowKind::FiveHour);
        assert!(counts.is_empty());
    }

    #[test]
    fn aggregates_cc_events_into_token_counts() {
        let events = vec![
            cc_event(Model::ClaudeSonnet45, 0, 10, 20),
            cc_event(Model::ClaudeSonnet45, 1, 10, 20),
            cc_event(Model::ClaudeSonnet45, 2, 10, 20),
            cc_event(Model::ClaudeSonnet45, 10, 10, 20),
            cc_event(Model::ClaudeSonnet45, 11, 10, 20),
        ];

        let counts = aggregate(&events, &[], WindowKind::FiveHour);
        let sonnet = counts.get(&Model::ClaudeSonnet45).expect("sonnet counts");

        assert_eq!(sonnet.input_tokens, 50);
        assert_eq!(sonnet.output_tokens, 100);
        assert_eq!(sonnet.cache_read_input_tokens, 15);
        assert_eq!(sonnet.ephemeral_5m_input_tokens, 20);
        assert_eq!(sonnet.ephemeral_1h_input_tokens, 0);
    }

    #[test]
    fn aggregates_split_claude_cache_creation_ttls() {
        let mut five_minute = cc_event(Model::ClaudeOpus47, 0, 10, 1);
        five_minute.ephemeral_5m_input_tokens = 5;
        five_minute.ephemeral_1h_input_tokens = 7;

        let mut one_hour = cc_event(Model::ClaudeOpus47, 10, 10, 1);
        one_hour.ephemeral_5m_input_tokens = 0;
        one_hour.ephemeral_1h_input_tokens = 30;

        let counts = aggregate(&[five_minute, one_hour], &[], WindowKind::FiveHour);
        let opus = counts.get(&Model::ClaudeOpus47).expect("opus counts");

        assert_eq!(opus.ephemeral_5m_input_tokens, 5);
        assert_eq!(opus.ephemeral_1h_input_tokens, 37);
    }

    #[test]
    fn codex_events_keep_codex_token_terms() {
        let events = vec![
            codex_event(Model::Gpt55, 0, 10, 20),
            codex_event(Model::Gpt55, 1, 10, 20),
        ];

        let counts = aggregate(&[], &events, WindowKind::FiveHour);
        let gpt = counts.get(&Model::Gpt55).expect("gpt counts");

        assert_eq!(gpt.input_tokens, 20);
        assert_eq!(gpt.output_tokens, 40);
        assert_eq!(gpt.cached_input_tokens, 4);
        assert_eq!(gpt.reasoning_output_tokens, 2);
        assert_eq!(gpt.cache_read_input_tokens, 0);
    }

    #[test]
    fn drops_zero_token_models() {
        let mut event = cc_event(Model::ClaudeSonnet45, 0, 0, 0);
        event.cache_read_input_tokens = 0;
        event.ephemeral_5m_input_tokens = 0;
        event.ephemeral_1h_input_tokens = 0;

        let counts = aggregate(&[event], &[], WindowKind::FiveHour);
        assert!(counts.is_empty());
    }
}
