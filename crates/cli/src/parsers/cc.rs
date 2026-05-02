//! CC session parser (D-58 + RESEARCH section 1).

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::{Path, PathBuf};

use event_schema::Model;

#[derive(Debug, Clone)]
pub struct CcEvent {
    pub timestamp_utc: DateTime<Utc>,
    pub request_id: String,
    pub model: Model,
    pub input: u32,
    pub output: u32,
    pub cached_read: u32,
    pub cached_write: u32,
}

pub fn parse_cc_line(_line: &str) -> Option<CcEvent> {
    None
}

pub fn dedup_by_request_id(_events: Vec<CcEvent>) -> Vec<CcEvent> {
    Vec::new()
}

pub fn discover_session_files(
    _claude_home: &Path,
    _window_start: DateTime<Utc>,
) -> Result<Vec<PathBuf>> {
    Ok(Vec::new())
}

pub fn parse_session_file(
    _path: &Path,
    _window_start: DateTime<Utc>,
    _window_end: DateTime<Utc>,
) -> (Vec<CcEvent>, u32) {
    (Vec::new(), 0)
}

pub fn walk(
    _claude_home: &Path,
    _window_start: DateTime<Utc>,
    _window_end: DateTime<Utc>,
) -> Result<(Vec<CcEvent>, u32)> {
    Ok((Vec::new(), 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(offset_minutes: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0)
            .single()
            .unwrap()
            + chrono::Duration::minutes(offset_minutes)
    }

    fn cc_line(model: &str, cache_fields: bool, timestamp: &str) -> String {
        let cache = if cache_fields {
            r#","cache_read_input_tokens":30,"cache_creation_input_tokens":40"#
        } else {
            ""
        };
        format!(
            r#"{{
                "type":"assistant",
                "timestamp":"{timestamp}",
                "version":"2.1.126",
                "requestId":"req_123",
                "message":{{
                    "model":"{model}",
                    "usage":{{
                        "input_tokens":10,
                        "output_tokens":20{cache}
                    }}
                }}
            }}"#
        )
    }

    #[test]
    fn parse_cc_line_happy_path() {
        let event = parse_cc_line(&cc_line("claude-sonnet-4-5", true, "2026-01-01T12:00:00Z"))
            .expect("assistant usage parses");
        assert_eq!(event.model, Model::ClaudeSonnet45);
        assert_eq!(event.request_id, "req_123");
        assert_eq!(event.input, 10);
        assert_eq!(event.output, 20);
        assert_eq!(event.cached_read, 30);
        assert_eq!(event.cached_write, 40);
    }

    #[test]
    fn skip_non_assistant_line() {
        assert!(parse_cc_line(r#"{"type":"user"}"#).is_none());
    }

    #[test]
    fn skip_synthetic_model() {
        assert!(parse_cc_line(&cc_line("<synthetic>", true, "2026-01-01T12:00:00Z")).is_none());
    }

    #[test]
    fn skip_unknown_line_types() {
        for kind in [
            "queue-operation",
            "file-history-snapshot",
            "system",
            "attachment",
            "last-prompt",
        ] {
            assert!(parse_cc_line(&format!(r#"{{"type":"{kind}"}}"#)).is_none());
        }
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse_cc_line("{").is_none());
    }

    #[test]
    fn dedup_by_request_id_keeps_one_event() {
        let base = CcEvent {
            timestamp_utc: ts(0),
            request_id: "req_same".to_string(),
            model: Model::ClaudeSonnet45,
            input: 1,
            output: 2,
            cached_read: 3,
            cached_write: 4,
        };
        let mut events = vec![base.clone(), base.clone(), base];
        events[2].output = 9;

        let deduped = dedup_by_request_id(events);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].output, 9);
    }

    #[test]
    fn window_filter_keeps_only_inclusive_range() {
        let events = vec![
            CcEvent { timestamp_utc: ts(-2), request_id: "a".into(), model: Model::ClaudeSonnet45, input: 1, output: 1, cached_read: 0, cached_write: 0 },
            CcEvent { timestamp_utc: ts(-1), request_id: "b".into(), model: Model::ClaudeSonnet45, input: 1, output: 1, cached_read: 0, cached_write: 0 },
            CcEvent { timestamp_utc: ts(0), request_id: "c".into(), model: Model::ClaudeSonnet45, input: 1, output: 1, cached_read: 0, cached_write: 0 },
            CcEvent { timestamp_utc: ts(1), request_id: "d".into(), model: Model::ClaudeSonnet45, input: 1, output: 1, cached_read: 0, cached_write: 0 },
            CcEvent { timestamp_utc: ts(2), request_id: "e".into(), model: Model::ClaudeSonnet45, input: 1, output: 1, cached_read: 0, cached_write: 0 },
        ];

        let filtered: Vec<_> = events
            .into_iter()
            .filter(|e| e.timestamp_utc >= ts(-1) && e.timestamp_utc <= ts(1))
            .collect();

        assert_eq!(filtered.len(), 3);
    }

    #[test]
    fn timestamps_parse_z_and_offsets_to_utc() {
        let z = parse_cc_line(&cc_line("claude-sonnet-4-5", true, "2026-01-01T12:00:00Z"))
            .expect("z timestamp parses");
        let offset = parse_cc_line(&cc_line(
            "claude-sonnet-4-5",
            true,
            "2026-01-01T14:00:00+02:00",
        ))
        .expect("offset timestamp parses");

        assert_eq!(z.timestamp_utc, offset.timestamp_utc);
    }

    #[test]
    fn missing_cache_fields_default_to_zero() {
        let event = parse_cc_line(&cc_line("claude-sonnet-4-5", false, "2026-01-01T12:00:00Z"))
            .expect("assistant usage parses");
        assert_eq!(event.cached_read, 0);
        assert_eq!(event.cached_write, 0);
    }
}
