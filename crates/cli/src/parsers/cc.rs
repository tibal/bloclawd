//! Claude Code session parser.
//!
//! Defensive: upstream JSONL is parsed with `serde_json::Value` and `.get()`
//! chains only. Strict wire structs are for the Worker side, not this surface.

use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use event_schema::Model;

use crate::min_version::{MIN_CC_VERSION, cc_first_line_passes_field_shape};

#[derive(Debug, Clone)]
pub struct CcEvent {
    pub timestamp_utc: DateTime<Utc>,
    pub request_id: String,
    pub model: Model,
    pub input: u64,
    pub output: u64,
    pub cached_read: u64,
    pub cached_write: u64,
}

pub fn parse_cc_line(line: &str) -> Option<CcEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "assistant" {
        return None;
    }

    let ts = v.get("timestamp")?.as_str()?;
    let timestamp_utc = DateTime::parse_from_rfc3339(ts).ok()?.with_timezone(&Utc);

    let request_id = v.get("requestId")?.as_str()?.to_string();
    let msg = v.get("message")?;
    let model_str = msg.get("model")?.as_str()?;
    if model_str == "<synthetic>" {
        return None;
    }

    let model: Model = serde_json::from_value(Value::String(model_str.to_string())).ok()?;

    let usage = msg.get("usage")?;
    let input = usage.get("input_tokens")?.as_u64()?;
    let output = usage.get("output_tokens")?.as_u64()?;
    let cached_read = usage
        .get("cache_read_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cached_write = usage
        .get("cache_creation_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);

    Some(CcEvent {
        timestamp_utc,
        request_id,
        model,
        input,
        output,
        cached_read,
        cached_write,
    })
}

pub fn dedup_by_request_id(events: Vec<CcEvent>) -> Vec<CcEvent> {
    let mut out: HashMap<String, CcEvent> = HashMap::new();
    for event in events {
        match out.entry(event.request_id.clone()) {
            Entry::Vacant(slot) => {
                slot.insert(event);
            }
            Entry::Occupied(mut slot) => {
                if event.timestamp_utc >= slot.get().timestamp_utc {
                    slot.insert(event);
                }
            }
        }
    }
    out.into_values().collect()
}

pub fn filter_window(
    events: Vec<CcEvent>,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Vec<CcEvent> {
    events
        .into_iter()
        .filter(|event| event.timestamp_utc >= window_start && event.timestamp_utc <= window_end)
        .collect()
}

pub fn discover_session_files(
    claude_home: &Path,
    window_start: DateTime<Utc>,
) -> Result<Vec<PathBuf>> {
    let projects = claude_home.join("projects");
    if !projects.exists() {
        return Ok(Vec::new());
    }
    let cutoff = window_start - chrono::Duration::minutes(30);

    let mut out = Vec::new();
    collect_jsonl_files(&projects, cutoff, &mut out)?;
    out.sort();
    Ok(out)
}

fn collect_jsonl_files(dir: &Path, cutoff: DateTime<Utc>, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in std::fs::read_dir(dir).with_context(|| format!("read_dir {}", dir.display()))? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_jsonl_files(&path, cutoff, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        let mtime = entry.metadata()?.modified()?;
        let mtime_utc: DateTime<Utc> = mtime.into();
        if mtime_utc >= cutoff {
            out.push(path);
        }
    }
    Ok(())
}

pub fn parse_session_file(
    path: &Path,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Result<(Vec<CcEvent>, u32)> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return Ok((Vec::new(), 1)),
    };
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    let mut failures: u32 = 0;
    let mut checked_shape = false;

    for line in reader.lines() {
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
        if value.get("type").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        if value
            .get("message")
            .and_then(|message| message.get("model"))
            .and_then(Value::as_str)
            == Some("<synthetic>")
        {
            continue;
        }
        if !checked_shape {
            checked_shape = true;
            if !cc_first_line_passes_field_shape(&value) {
                return Err(anyhow!(
                    "Claude Code session format is unsupported; bloclawd requires Claude Code >= {MIN_CC_VERSION} with assistant message.usage input_tokens, output_tokens, cache_read_input_tokens, and cache_creation_input_tokens"
                ));
            }
        }

        match parse_cc_line(&line) {
            Some(event)
                if event.timestamp_utc >= window_start && event.timestamp_utc <= window_end =>
            {
                events.push(event);
            }
            Some(_) => {}
            None => failures = failures.saturating_add(1),
        }
    }

    Ok((events, failures))
}

pub fn walk(
    claude_home: &Path,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Result<(Vec<CcEvent>, u32)> {
    let files = discover_session_files(claude_home, window_start)?;
    let mut all = Vec::new();
    let mut total_failures: u32 = 0;
    for path in &files {
        let (events, failures) = parse_session_file(path, window_start, window_end)
            .with_context(|| format!("parse {}", path.display()))?;
        all.extend(events);
        total_failures = total_failures.saturating_add(failures);
    }
    Ok((dedup_by_request_id(all), total_failures))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn ts(offset_minutes: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).single().unwrap()
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

    fn temp_root(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "bloclawd-cc-{name}-{}-{unique}",
            std::process::id()
        ))
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
    fn dedup_by_request_id_keeps_latest_streaming_snapshot() {
        let older = CcEvent {
            timestamp_utc: ts(2),
            request_id: "req_same".to_string(),
            model: Model::ClaudeSonnet45,
            input: 1,
            output: 9,
            cached_read: 3,
            cached_write: 4,
        };
        let newer = CcEvent {
            timestamp_utc: ts(3),
            request_id: "req_same".to_string(),
            model: Model::ClaudeSonnet45,
            input: 1,
            output: 99,
            cached_read: 3,
            cached_write: 4,
        };

        let deduped = dedup_by_request_id(vec![newer.clone(), older]);

        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].timestamp_utc, newer.timestamp_utc);
        assert_eq!(deduped[0].output, 99);
    }

    #[test]
    fn window_filter_keeps_only_inclusive_range() {
        let events = vec![
            CcEvent {
                timestamp_utc: ts(-2),
                request_id: "a".into(),
                model: Model::ClaudeSonnet45,
                input: 1,
                output: 1,
                cached_read: 0,
                cached_write: 0,
            },
            CcEvent {
                timestamp_utc: ts(-1),
                request_id: "b".into(),
                model: Model::ClaudeSonnet45,
                input: 1,
                output: 1,
                cached_read: 0,
                cached_write: 0,
            },
            CcEvent {
                timestamp_utc: ts(0),
                request_id: "c".into(),
                model: Model::ClaudeSonnet45,
                input: 1,
                output: 1,
                cached_read: 0,
                cached_write: 0,
            },
            CcEvent {
                timestamp_utc: ts(1),
                request_id: "d".into(),
                model: Model::ClaudeSonnet45,
                input: 1,
                output: 1,
                cached_read: 0,
                cached_write: 0,
            },
            CcEvent {
                timestamp_utc: ts(2),
                request_id: "e".into(),
                model: Model::ClaudeSonnet45,
                input: 1,
                output: 1,
                cached_read: 0,
                cached_write: 0,
            },
        ];

        let filtered = filter_window(events, ts(-1), ts(1));

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

    #[test]
    fn discover_session_files_includes_nested_subagent_jsonl() {
        let root = temp_root("nested-discovery");
        let claude_home = root.join(".claude");
        let top = claude_home.join("projects/project-a/session.jsonl");
        let nested = claude_home.join("projects/project-a/session/subagents/agent.jsonl");
        let ignored = claude_home.join("projects/project-a/session/subagents/agent.txt");
        fs::create_dir_all(top.parent().expect("top parent")).expect("mkdir top");
        fs::create_dir_all(nested.parent().expect("nested parent")).expect("mkdir nested");
        fs::write(&top, "").expect("write top");
        fs::write(&nested, "").expect("write nested");
        fs::write(&ignored, "").expect("write ignored");

        let files = discover_session_files(&claude_home, ts(-1)).expect("discover files");
        let _ = fs::remove_dir_all(&root);

        let mut expected = vec![top, nested];
        expected.sort();
        assert_eq!(files, expected);
    }

    #[test]
    fn unsupported_first_assistant_shape_errors_with_min_version() {
        let root = temp_root("min-version");
        fs::create_dir_all(&root).expect("mkdir root");
        let path = root.join("session.jsonl");
        fs::write(
            &path,
            r#"{"type":"assistant","timestamp":"2026-01-01T12:00:00Z","version":"2.1.126","requestId":"req_123","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":10,"output_tokens":20}}}"#,
        )
        .expect("write fixture");

        let err = parse_session_file(&path, ts(-1), ts(1)).expect_err("shape error");
        let _ = fs::remove_dir_all(&root);
        let message = err.to_string();
        assert!(message.contains(MIN_CC_VERSION));
        assert!(message.contains("cache_read_input_tokens"));
    }
}
