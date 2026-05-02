//! Per-window-per-model token aggregator (CLI-06 + D-50).
//!
//! `TokenCounts` has two fixed slots. In Phase 3, `_5min` is the densest
//! rolling 5-minute burst inside the selected window, while `_5h` is the total
//! over that selected window. The submit path supports only `WindowKind::FiveHour`
//! in v1; the dry-run layer may still reuse these counters for longer windows.

use chrono::{DateTime, Utc};
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
    cc_events: &[CcEvent],
    codex_events: &[CodexEvent],
    window_kind: WindowKind,
) -> Result<HashMap<Model, TokenCounts>, AggregateError> {
    if window_kind == WindowKind::Week {
        return Err(AggregateError::WeekModeNotSupported);
    }

    let mut by_model: HashMap<Model, Vec<EventTokens>> = HashMap::new();
    for event in cc_events {
        by_model.entry(event.model).or_default().push(EventTokens {
            timestamp_utc: event.timestamp_utc,
            input: event.input,
            output: event.output,
            cached_read: event.cached_read,
            cached_write: event.cached_write,
        });
    }
    for event in codex_events {
        by_model.entry(event.model).or_default().push(EventTokens {
            timestamp_utc: event.timestamp_utc,
            input: event.input,
            output: event.output,
            cached_read: event.cached_read,
            cached_write: 0,
        });
    }

    let mut out = HashMap::new();
    for (model, mut events) in by_model {
        events.sort_by_key(|event| event.timestamp_utc);
        let counts = compute_counts(&events);
        if counts.input_5h == 0
            && counts.output_5h == 0
            && counts.cached_read_5h == 0
            && counts.cached_write_5h == 0
        {
            continue;
        }
        out.insert(model, counts);
    }

    Ok(out)
}

#[derive(Debug, Clone, Copy)]
struct EventTokens {
    timestamp_utc: DateTime<Utc>,
    input: u32,
    output: u32,
    cached_read: u32,
    cached_write: u32,
}

fn compute_counts(events: &[EventTokens]) -> TokenCounts {
    let mut input_5h = 0u64;
    let mut output_5h = 0u64;
    let mut cached_read_5h = 0u64;
    let mut cached_write_5h = 0u64;

    for event in events {
        input_5h = input_5h.saturating_add(event.input as u64);
        output_5h = output_5h.saturating_add(event.output as u64);
        cached_read_5h = cached_read_5h.saturating_add(event.cached_read as u64);
        cached_write_5h = cached_write_5h.saturating_add(event.cached_write as u64);
    }

    let (input_5min, output_5min, cached_read_5min, cached_write_5min) =
        max_5min_burst(events);

    TokenCounts {
        input_5min: clamp_u32(input_5min),
        output_5min: clamp_u32(output_5min),
        cached_read_5min: clamp_u32(cached_read_5min),
        cached_write_5min: clamp_u32(cached_write_5min),
        input_5h: clamp_u32(input_5h),
        output_5h: clamp_u32(output_5h),
        cached_read_5h: clamp_u32(cached_read_5h),
        cached_write_5h: clamp_u32(cached_write_5h),
    }
}

fn max_5min_burst(events: &[EventTokens]) -> (u64, u64, u64, u64) {
    let window = chrono::Duration::minutes(5);
    let mut best = (0u64, 0u64, 0u64, 0u64);

    for (idx, anchor) in events.iter().enumerate() {
        let cutoff = anchor.timestamp_utc + window;
        let mut input = 0u64;
        let mut output = 0u64;
        let mut cached_read = 0u64;
        let mut cached_write = 0u64;

        for event in &events[idx..] {
            if event.timestamp_utc > cutoff {
                break;
            }
            input = input.saturating_add(event.input as u64);
            output = output.saturating_add(event.output as u64);
            cached_read = cached_read.saturating_add(event.cached_read as u64);
            cached_write = cached_write.saturating_add(event.cached_write as u64);
        }

        if input + output + cached_read + cached_write > best.0 + best.1 + best.2 + best.3 {
            best = (input, output, cached_read, cached_write);
        }
    }

    best
}

fn clamp_u32(value: u64) -> u32 {
    value.min(u32::MAX as u64) as u32
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
