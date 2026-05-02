use anyhow::{Context, Result, bail};
use chrono::{SecondsFormat, TimeZone, Utc};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputHarness {
    Cc,
    Codex,
}

pub fn parse_harness(value: &str) -> Result<InputHarness> {
    match value {
        "cc" => Ok(InputHarness::Cc),
        "codex" => Ok(InputHarness::Codex),
        other => bail!("--harness must be cc or codex; got {other}"),
    }
}

#[derive(Debug, Default)]
pub struct Anonymizer {
    uuid_map: HashMap<String, String>,
    path_map: HashMap<String, String>,
    prompt_idx: u32,
    toolarg_idx: u32,
    time_anchor: Option<chrono::DateTime<Utc>>,
}

impl Anonymizer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn rewrite_uuid(&mut self, original: &str) -> String {
        if let Some(existing) = self.uuid_map.get(original) {
            return existing.clone();
        }
        let replacement = format!("00000000-0000-4000-8000-{:012}", self.uuid_map.len() + 1);
        self.uuid_map
            .insert(original.to_string(), replacement.clone());
        replacement
    }

    pub fn rewrite_path(&mut self, original: &str) -> String {
        if let Some(existing) = self.path_map.get(original) {
            return existing.clone();
        }
        let replacement = format!("/path/redacted/{}", self.path_map.len() + 1);
        self.path_map
            .insert(original.to_string(), replacement.clone());
        replacement
    }

    pub fn rewrite_timestamp(&mut self, original: &str) -> Option<String> {
        let parsed = chrono::DateTime::parse_from_rfc3339(original)
            .ok()?
            .with_timezone(&Utc);
        let anchor = *self.time_anchor.get_or_insert(parsed);
        let delta = parsed - anchor;
        let base = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).single()?;
        Some((base + delta).to_rfc3339_opts(SecondsFormat::Secs, true))
    }

    fn prompt_placeholder(&mut self) -> String {
        self.prompt_idx += 1;
        format!("PROMPT_REDACTED_{}", self.prompt_idx)
    }

    fn toolarg_placeholder(&mut self) -> String {
        self.toolarg_idx += 1;
        format!("TOOL_ARG_REDACTED_{}", self.toolarg_idx)
    }

    pub fn anonymize_value(&mut self, value: &mut Value) {
        match value {
            Value::Object(map) => {
                let keys: Vec<String> = map.keys().cloned().collect();
                let mut recurse_later = Vec::new();
                for key in keys {
                    let Some(child) = map.get_mut(&key) else {
                        continue;
                    };
                    match key.as_str() {
                        "timestamp" if child.is_string() => {
                            let original = child.as_str().unwrap().to_string();
                            if let Some(rewritten) = self.rewrite_timestamp(&original) {
                                *child = Value::String(rewritten);
                            }
                        }
                        "requestId"
                        | "sessionId"
                        | "session_id"
                        | "id"
                        | "uuid"
                        | "event_id"
                        | "submission_group_id"
                            if child.is_string() =>
                        {
                            let original = child.as_str().unwrap().to_string();
                            if looks_like_uuid_or_token(&original) {
                                *child = Value::String(self.rewrite_uuid(&original));
                            }
                        }
                        "cwd" | "path" | "file_path" | "file" if child.is_string() => {
                            let original = child.as_str().unwrap().to_string();
                            *child = Value::String(self.rewrite_path(&original));
                        }
                        "prompt" | "text" | "content" | "output" | "stdout" | "stderr"
                            if child.is_string() =>
                        {
                            *child = Value::String(self.prompt_placeholder());
                        }
                        "tool_args" | "tool_input" | "arguments" if child.is_string() => {
                            *child = Value::String(self.toolarg_placeholder());
                        }
                        _ if child.is_array() || child.is_object() => recurse_later.push(key),
                        _ => {}
                    }
                }
                for key in recurse_later {
                    if let Some(child) = map.get_mut(&key) {
                        self.anonymize_value(child);
                    }
                }
            }
            Value::Array(items) => {
                for item in items {
                    self.anonymize_value(item);
                }
            }
            Value::String(s) => {
                if looks_like_absolute_path(s) {
                    let original = s.clone();
                    *s = self.rewrite_path(&original);
                }
            }
            _ => {}
        }
    }
}

fn looks_like_uuid_or_token(value: &str) -> bool {
    (value.len() == 36
        && value.chars().filter(|ch| *ch == '-').count() == 4
        && value.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-'))
        || (value.len() >= 22
            && value
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
}

fn looks_like_absolute_path(value: &str) -> bool {
    value.starts_with("/Users/") || value.starts_with("/home/") || value.starts_with("/tmp/")
}

pub fn run(harness: &str, input: &Path, output: &Path) -> Result<()> {
    let _harness = parse_harness(harness)?;
    let input = std::fs::canonicalize(input)
        .with_context(|| format!("canonicalize {}", input.display()))?;
    let file = File::open(&input).with_context(|| format!("open {}", input.display()))?;
    let reader: Box<dyn BufRead> = if input.extension().and_then(|ext| ext.to_str()) == Some("zst")
    {
        Box::new(BufReader::new(zstd::stream::Decoder::new(file)?))
    } else {
        Box::new(BufReader::new(file))
    };

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let tmp_path = output.with_extension("tmp");
    let mut tmp =
        File::create(&tmp_path).with_context(|| format!("create {}", tmp_path.display()))?;
    let mut anonymizer = Anonymizer::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let mut value: Value =
            serde_json::from_str(&line).with_context(|| "parse JSONL line before anonymizing")?;
        anonymizer.anonymize_value(&mut value);
        tmp.write_all(serde_json::to_string(&value)?.as_bytes())?;
        tmp.write_all(b"\n")?;
    }
    tmp.flush()?;
    drop(tmp);
    std::fs::rename(&tmp_path, output)
        .with_context(|| format!("rename {} to {}", tmp_path.display(), output.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str, extension: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "bloclawd-anonymize-{name}-{}-{unique}.{extension}",
            std::process::id()
        ))
    }

    fn read_first_json(path: &PathBuf) -> Value {
        let body = fs::read_to_string(path).expect("read output");
        serde_json::from_str(body.lines().next().expect("first line")).expect("json line")
    }

    #[test]
    fn invalid_harness_errors_with_valid_values() {
        let err = parse_harness("foobar").expect_err("invalid harness fails");
        let message = err.to_string();
        assert!(message.contains("cc"));
        assert!(message.contains("codex"));
    }

    #[test]
    fn uuid_rewrite_is_deterministic_and_monotonic() {
        let mut anon = Anonymizer::new();

        assert_eq!(
            anon.rewrite_uuid("11111111-1111-4111-8111-111111111111"),
            "00000000-0000-4000-8000-000000000001"
        );
        assert_eq!(
            anon.rewrite_uuid("22222222-2222-4222-8222-222222222222"),
            "00000000-0000-4000-8000-000000000002"
        );
        assert_eq!(
            anon.rewrite_uuid("11111111-1111-4111-8111-111111111111"),
            "00000000-0000-4000-8000-000000000001"
        );
    }

    #[test]
    fn timestamp_rewrite_preserves_deltas_from_2026_anchor() {
        let mut anon = Anonymizer::new();

        assert_eq!(
            anon.rewrite_timestamp("2025-05-02T10:00:00Z").unwrap(),
            "2026-01-01T00:00:00Z"
        );
        assert_eq!(
            anon.rewrite_timestamp("2025-05-02T10:05:00Z").unwrap(),
            "2026-01-01T00:05:00Z"
        );
    }

    #[test]
    fn run_replaces_prompts_paths_uuids_and_preserves_model_and_tokens() {
        let input = temp_path("plain-input", "jsonl");
        let output = temp_path("plain-output", "jsonl");
        fs::write(
            &input,
            r#"{"type":"assistant","timestamp":"2025-05-02T10:00:00Z","requestId":"11111111-1111-4111-8111-111111111111","cwd":"/Users/davinci/project","prompt":"secret prompt","message":{"model":"claude-sonnet-4-5","content":"secret output","usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":3,"cache_creation_input_tokens":4}}}"#,
        )
        .expect("write input");

        run("cc", &input, &output).expect("anonymize plain input");
        let value = read_first_json(&output);

        assert_eq!(value["timestamp"], "2026-01-01T00:00:00Z");
        assert_eq!(value["requestId"], "00000000-0000-4000-8000-000000000001");
        assert_eq!(value["cwd"], "/path/redacted/1");
        assert_eq!(value["prompt"], "PROMPT_REDACTED_1");
        assert_eq!(value["message"]["content"], "PROMPT_REDACTED_2");
        assert_eq!(value["message"]["model"], "claude-sonnet-4-5");
        assert_eq!(value["message"]["usage"]["input_tokens"], 10);
        assert_eq!(value["message"]["usage"]["output_tokens"], 20);

        let _ = fs::remove_file(input);
        let _ = fs::remove_file(output);
    }

    #[test]
    fn zst_input_decodes_to_plain_jsonl_output() {
        let input = temp_path("compressed-input", "jsonl.zst");
        let output = temp_path("compressed-output", "jsonl");
        let raw = br#"{"type":"event_msg","timestamp":"2025-05-02T10:00:00Z","uuid":"33333333-3333-4333-8333-333333333333","payload":{"model":"gpt-5.5","info":{"last_token_usage":{"input_tokens":5,"cached_input_tokens":2,"output_tokens":7,"reasoning_output_tokens":1}}}}"#;
        let compressed = zstd::encode_all(&raw[..], 0).expect("compress input");
        fs::write(&input, compressed).expect("write zst input");

        run("codex", &input, &output).expect("anonymize zst input");
        let body = fs::read_to_string(&output).expect("plain output");
        assert!(body.starts_with('{'));
        let value = read_first_json(&output);
        assert_eq!(value["uuid"], "00000000-0000-4000-8000-000000000001");
        assert_eq!(value["payload"]["model"], "gpt-5.5");
        assert_eq!(
            value["payload"]["info"]["last_token_usage"]["cached_input_tokens"],
            2
        );

        let _ = fs::remove_file(input);
        let _ = fs::remove_file(output);
    }
}
