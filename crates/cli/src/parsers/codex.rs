//! Codex session parser (D-59 + RESEARCH section 2).

use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, Utc};
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};
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
    lines: impl Iterator<Item = Result<String, std::io::Error>>,
) -> (Vec<CodexEvent>, u32) {
    let mut current_model: Option<Model> = None;
    let mut events = Vec::new();
    let mut failures = 0u32;

    for line in lines {
        let line = match line {
            Ok(line) => line,
            Err(_) => {
                failures = failures.saturating_add(1);
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                failures = failures.saturating_add(1);
                continue;
            }
        };

        match value.get("type").and_then(Value::as_str) {
            Some("turn_context") => {
                let Some(model_str) = value
                    .get("payload")
                    .and_then(|payload| payload.get("model"))
                    .and_then(Value::as_str)
                else {
                    continue;
                };
                if let Ok(model) =
                    serde_json::from_value::<Model>(Value::String(model_str.to_string()))
                {
                    current_model = Some(model);
                }
            }
            Some("event_msg") => {
                let Some(payload) = value.get("payload") else {
                    continue;
                };
                if payload.get("type").and_then(Value::as_str) != Some("token_count") {
                    continue;
                }
                let Some(info) = payload.get("info").filter(|info| !info.is_null()) else {
                    continue;
                };
                let Some(last) = info.get("last_token_usage") else {
                    continue;
                };
                let Some(model) = current_model else {
                    continue;
                };
                let Some(ts) = value.get("timestamp").and_then(Value::as_str) else {
                    continue;
                };
                let Ok(timestamp_utc) =
                    DateTime::parse_from_rfc3339(ts).map(|ts| ts.with_timezone(&Utc))
                else {
                    continue;
                };

                let input = last
                    .get("input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                let output = last
                    .get("output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                let reasoning = last
                    .get("reasoning_output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                let cached_read = last
                    .get("cached_input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;

                events.push(CodexEvent {
                    timestamp_utc,
                    model,
                    input,
                    output: output.saturating_add(reasoning),
                    cached_read,
                });
            }
            _ => continue,
        }
    }

    (events, failures)
}

pub fn discover_session_files(
    codex_home: &Path,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Result<Vec<PathBuf>> {
    let sessions = codex_home.join("sessions");
    if !sessions.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let mut day = (window_start - chrono::Duration::days(1)).date_naive();
    let last_day = (window_end + chrono::Duration::days(1)).date_naive();

    while day <= last_day {
        let dir = sessions
            .join(format!("{:04}", day.year()))
            .join(format!("{:02}", day.month()))
            .join(format!("{:02}", day.day()));
        if dir.exists() {
            for entry in
                std::fs::read_dir(&dir).with_context(|| format!("read_dir {}", dir.display()))?
            {
                let entry = entry?;
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                if name.starts_with("rollout-")
                    && (name.ends_with(".jsonl") || name.ends_with(".jsonl.zst"))
                {
                    out.push(path);
                }
            }
        }

        let Some(next) = day.succ_opt() else {
            break;
        };
        day = next;
    }

    Ok(out)
}

pub fn open_rollout(path: &Path) -> Result<Box<dyn BufRead>> {
    let file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    if path.extension().and_then(|ext| ext.to_str()) == Some("zst") {
        let decoder = zstd::stream::Decoder::new(file)
            .with_context(|| format!("zstd decode {}", path.display()))?;
        return Ok(Box::new(BufReader::new(decoder)));
    }
    Ok(Box::new(BufReader::new(file)))
}

pub fn walk(
    codex_home: &Path,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Result<(Vec<CodexEvent>, u32)> {
    let files = discover_session_files(codex_home, window_start, window_end)?;
    let mut all = Vec::new();
    let mut total_failures = 0u32;

    for path in files {
        let reader = match open_rollout(&path) {
            Ok(reader) => reader,
            Err(_) => {
                total_failures = total_failures.saturating_add(1);
                continue;
            }
        };
        let (mut events, failures) = parse_codex_session(reader.lines());
        events.retain(|event| {
            event.timestamp_utc >= window_start && event.timestamp_utc <= window_end
        });
        all.extend(events);
        total_failures = total_failures.saturating_add(failures);
    }

    Ok((all, total_failures))
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
