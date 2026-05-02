//! Codex session parser (D-59 + RESEARCH section 2).

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::io::{BufRead, BufReader, Cursor};
use std::path::{Path, PathBuf};

use event_schema::Model;

#[derive(Debug, Clone)]
pub struct CodexEvent {
    pub timestamp_utc: DateTime<Utc>,
    pub model: Model,
    pub input: u32,
    pub output: u32,
    pub cached_read: u32,
}

pub fn parse_codex_session(
    _lines: impl Iterator<Item = Result<String, std::io::Error>>,
) -> (Vec<CodexEvent>, u32) {
    (Vec::new(), 0)
}

pub fn discover_session_files(
    _codex_home: &Path,
    _window_start: DateTime<Utc>,
    _window_end: DateTime<Utc>,
) -> Result<Vec<PathBuf>> {
    Ok(Vec::new())
}

pub fn open_rollout(_path: &Path) -> Result<Box<dyn BufRead>> {
    Ok(Box::new(BufReader::new(Cursor::new(Vec::<u8>::new()))))
}

pub fn walk(
    _codex_home: &Path,
    _window_start: DateTime<Utc>,
    _window_end: DateTime<Utc>,
) -> Result<(Vec<CodexEvent>, u32)> {
    Ok((Vec::new(), 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::fs;
    use std::io::Read;

    fn lines(raw: &[String]) -> impl Iterator<Item = Result<String, std::io::Error>> + '_ {
        raw.iter().cloned().map(Ok)
    }

    fn turn_context(model: &str) -> String {
        format!(r#"{{"type":"turn_context","payload":{{"model":"{model}"}}}}"#)
    }

    fn token_count(input: u32, output: u32, reasoning: u32, cached_read: u32) -> String {
        format!(
            r#"{{
                "type":"event_msg",
                "timestamp":"2026-01-01T12:00:00Z",
                "payload":{{
                    "type":"token_count",
                    "info":{{
                        "last_token_usage":{{
                            "input_tokens":{input},
                            "output_tokens":{output},
                            "reasoning_output_tokens":{reasoning},
                            "cached_input_tokens":{cached_read}
                        }}
                    }}
                }}
            }}"#
        )
    }

    fn token_count_with_usage_key(usage_key: &str) -> String {
        format!(
            r#"{{
                "type":"event_msg",
                "timestamp":"2026-01-01T12:00:00Z",
                "payload":{{
                    "type":"token_count",
                    "info":{{
                        "{usage_key}":{{
                            "input_tokens":10,
                            "output_tokens":20,
                            "cached_input_tokens":30
                        }}
                    }}
                }}
            }}"#
        )
    }

    #[test]
    fn parse_codex_session_happy_path() {
        let raw = vec![
            r#"{"type":"session_meta","payload":{"cli_version":"0.128.0"}}"#.to_string(),
            turn_context("gpt-5.5"),
            token_count(1, 2, 3, 4),
            token_count(5, 6, 7, 8),
            token_count(9, 10, 11, 12),
        ];

        let (events, failures) = parse_codex_session(lines(&raw));

        assert_eq!(failures, 0);
        assert_eq!(events.len(), 3);
        assert!(events.iter().all(|event| event.model == Model::Gpt55));
    }

    #[test]
    fn null_info_is_skip_not_failure() {
        let raw = vec![
            turn_context("gpt-5"),
            r#"{"type":"event_msg","timestamp":"2026-01-01T12:00:00Z","payload":{"type":"token_count","info":null}}"#
                .to_string(),
        ];

        let (events, failures) = parse_codex_session(lines(&raw));

        assert!(events.is_empty());
        assert_eq!(failures, 0);
    }

    #[test]
    fn model_tracks_most_recent_turn_context() {
        let raw = vec![
            turn_context("gpt-5"),
            token_count(1, 1, 0, 0),
            turn_context("gpt-5.5"),
            token_count(2, 2, 0, 0),
        ];

        let (events, _) = parse_codex_session(lines(&raw));

        assert_eq!(events[0].model, Model::Gpt5);
        assert_eq!(events[1].model, Model::Gpt55);
    }

    #[test]
    fn token_count_before_turn_context_is_skipped() {
        let raw = vec![token_count(1, 1, 0, 0)];

        let (events, failures) = parse_codex_session(lines(&raw));

        assert!(events.is_empty());
        assert_eq!(failures, 0);
    }

    #[test]
    fn cumulative_usage_shape_without_delta_is_skipped() {
        let usage_key = ["total", "token", "usage"].join("_");
        let raw = vec![
            turn_context("gpt-5"),
            token_count_with_usage_key(&usage_key),
        ];

        let (events, failures) = parse_codex_session(lines(&raw));

        assert!(events.is_empty());
        assert_eq!(failures, 0);
    }

    #[test]
    fn reasoning_output_tokens_are_added_to_output() {
        let raw = vec![turn_context("gpt-5.5"), token_count(10, 20, 5, 7)];

        let (events, _) = parse_codex_session(lines(&raw));

        assert_eq!(events[0].output, 25);
    }

    #[test]
    fn codex_event_has_no_cached_write_field() {
        let raw = vec![turn_context("gpt-5"), token_count(1, 1, 0, 9)];

        let (events, _) = parse_codex_session(lines(&raw));

        assert_eq!(events[0].cached_read, 9);
    }

    #[test]
    fn zst_rollout_decodes_to_same_lines() {
        let body = [turn_context("gpt-5"), token_count(1, 2, 3, 4)].join("\n");
        let path = std::env::temp_dir().join(format!(
            "bloclawd-codex-test-{}.jsonl.zst",
            std::process::id()
        ));
        let compressed = zstd::encode_all(body.as_bytes(), 0).expect("compress test fixture");
        fs::write(&path, compressed).expect("write compressed fixture");

        let mut decoded = String::new();
        open_rollout(&path)
            .expect("open rollout")
            .read_to_string(&mut decoded)
            .expect("read rollout");

        let _ = fs::remove_file(&path);
        assert_eq!(decoded, body);
    }

    #[test]
    fn gpt_5_5_deserializes_from_codex_model_id() {
        let raw = vec![turn_context("gpt-5.5"), token_count(1, 1, 0, 0)];

        let (events, _) = parse_codex_session(lines(&raw));

        assert_eq!(events[0].model, Model::Gpt55);
    }

    #[test]
    fn timestamp_parses_to_utc() {
        let raw = vec![turn_context("gpt-5"), token_count(1, 1, 0, 0)];

        let (events, _) = parse_codex_session(lines(&raw));

        assert_eq!(
            events[0].timestamp_utc,
            Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).single().unwrap()
        );
    }
}
