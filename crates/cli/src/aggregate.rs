//! Per-window-per-model token aggregator (CLI-06 + D-50).

use std::collections::HashMap;

use event_schema::{Model, TokenCounts};
use thiserror::Error;

use crate::parsers::cc::CcEvent;
use crate::parsers::codex::CodexEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    FiveHour,
    Week,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AggregateError {
    #[error("--week submit not supported in v1; use --dry-run only")]
    WeekModeNotSupported,
}

pub fn aggregate(
    _cc_events: &[CcEvent],
    _codex_events: &[CodexEvent],
    _window_kind: WindowKind,
) -> Result<HashMap<Model, TokenCounts>, AggregateError> {
    Ok(HashMap::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(minute: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).single().unwrap()
            + chrono::Duration::minutes(minute)
    }

    fn cc_event(model: Model, minute: i64, input: u32, output: u32) -> CcEvent {
        CcEvent {
            timestamp_utc: ts(minute),
            request_id: format!("req_{minute}"),
            model,
            input,
            output,
            cached_read: 3,
            cached_write: 4,
        }
    }

    fn codex_event(model: Model, minute: i64, input: u32, output: u32) -> CodexEvent {
        CodexEvent {
            timestamp_utc: ts(minute),
            model,
            input,
            output,
            cached_read: 2,
        }
    }

    #[test]
    fn week_mode_is_rejected_for_submit_aggregation() {
        assert_eq!(
            aggregate(&[], &[], WindowKind::Week),
            Err(AggregateError::WeekModeNotSupported)
        );
    }

    #[test]
    fn five_hour_mode_accepts_empty_input() {
        let counts = aggregate(&[], &[], WindowKind::FiveHour).expect("five-hour accepted");
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

        let counts = aggregate(&events, &[], WindowKind::FiveHour).unwrap();
        let sonnet = counts.get(&Model::ClaudeSonnet45).expect("sonnet counts");

        assert_eq!(sonnet.input_5h, 50);
        assert_eq!(sonnet.output_5h, 100);
        assert_eq!(sonnet.cached_read_5h, 15);
        assert_eq!(sonnet.cached_write_5h, 20);
        assert_eq!(sonnet.input_5min, 30);
        assert_eq!(sonnet.output_5min, 60);
    }

    #[test]
    fn codex_events_have_zero_cached_write() {
        let events = vec![
            codex_event(Model::Gpt55, 0, 10, 20),
            codex_event(Model::Gpt55, 1, 10, 20),
        ];

        let counts = aggregate(&[], &events, WindowKind::FiveHour).unwrap();
        let gpt = counts.get(&Model::Gpt55).expect("gpt counts");

        assert_eq!(gpt.cached_read_5h, 4);
        assert_eq!(gpt.cached_write_5h, 0);
        assert_eq!(gpt.cached_write_5min, 0);
    }

    #[test]
    fn per_model_fanout_emits_three_models() {
        let cc_events = vec![
            cc_event(Model::ClaudeSonnet45, 0, 1, 1),
            cc_event(Model::ClaudeOpus47, 0, 1, 1),
        ];
        let codex_events = vec![codex_event(Model::Gpt55, 0, 1, 1)];

        let counts = aggregate(&cc_events, &codex_events, WindowKind::FiveHour).unwrap();

        assert_eq!(counts.len(), 3);
    }

    #[test]
    fn zero_token_model_is_skipped() {
        let mut event = cc_event(Model::ClaudeSonnet45, 0, 0, 0);
        event.cached_read = 0;
        event.cached_write = 0;

        let counts = aggregate(&[event], &[], WindowKind::FiveHour).unwrap();

        assert!(!counts.contains_key(&Model::ClaudeSonnet45));
    }

    #[test]
    fn five_minute_rolling_burst_uses_densest_subwindow() {
        let events = vec![
            cc_event(Model::ClaudeSonnet45, 0, 10, 1),
            cc_event(Model::ClaudeSonnet45, 1, 10, 1),
            cc_event(Model::ClaudeSonnet45, 2, 10, 1),
            cc_event(Model::ClaudeSonnet45, 3, 10, 1),
            cc_event(Model::ClaudeSonnet45, 4, 10, 1),
            cc_event(Model::ClaudeSonnet45, 10, 10, 1),
        ];

        let counts = aggregate(&events, &[], WindowKind::FiveHour).unwrap();
        let sonnet = counts.get(&Model::ClaudeSonnet45).expect("sonnet counts");

        assert_eq!(sonnet.input_5h, 60);
        assert_eq!(sonnet.input_5min, 50);
    }
}
