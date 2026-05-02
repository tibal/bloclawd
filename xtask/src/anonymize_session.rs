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
