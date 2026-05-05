//! Single render layer for dry-run human output and machine JSON.

use anyhow::Result;
use bloclawd_schema::SubmittedEvent;
use serde::Serialize;
use serde_json::Value;

pub fn render_dry_run(group_id: &str, events: &[SubmittedEvent]) -> Result<String> {
    let group_short = &group_id[..group_id.len().min(8)];
    let mut out = String::new();
    out.push_str(&format!(
        "bloclawd dry-run - group {group_short}... - {} model{}\n\n",
        events.len(),
        if events.len() == 1 { "" } else { "s" }
    ));

    if let Some(first) = events.first() {
        out.push_str(&format!(
            "Limit card: {} / {} / {} / {}\n",
            wire_name(first.payload.harness)?,
            wire_name(first.payload.tier)?,
            wire_name(first.payload.region)?,
            wire_name(first.limit_type)?,
        ));
        out.push_str("Paste the block below into https://bloclawd.com/rank\n\n");
    }

    if events.is_empty() {
        out.push_str("(no models)\n");
        return Ok(out);
    }

    out.push_str("Model token mix\n");

    let header = format!(
        "| {:<22} | {:>12} | {:>13} | {:>23} | {:>25} | {:>25} | {:>19} | {:>23} |",
        "model",
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "ephemeral_5m_input_tokens",
        "ephemeral_1h_input_tokens",
        "cached_input_tokens",
        "reasoning_output_tokens"
    );
    let sep: String = header
        .chars()
        .map(|ch| if ch == '|' { '+' } else { '-' })
        .collect();

    out.push_str(&sep);
    out.push('\n');
    out.push_str(&header);
    out.push('\n');
    out.push_str(&sep);
    out.push('\n');

    for event in events {
        let tokens = &event.payload.tokens;
        let row = format!(
            "| {:<22} | {:>12} | {:>13} | {:>23} | {:>25} | {:>25} | {:>19} | {:>23} |",
            model_name(event)?,
            tokens.input_tokens,
            tokens.output_tokens,
            tokens.cache_read_input_tokens,
            tokens.ephemeral_5m_input_tokens,
            tokens.ephemeral_1h_input_tokens,
            tokens.cached_input_tokens,
            tokens.reasoning_output_tokens
        );
        out.push_str(&row);
        out.push('\n');
    }

    out.push_str(&sep);
    out.push('\n');
    out.push('\n');
    out.push_str("--- bloclawd rank input ---\n");
    out.push_str(&rank_input_json(events)?);
    out.push('\n');
    out.push_str("--- end bloclawd rank input ---\n");

    Ok(out)
}

fn rank_input_json(events: &[SubmittedEvent]) -> Result<String> {
    let first = events
        .first()
        .ok_or_else(|| anyhow::anyhow!("rank input requires at least one event"))?;
    let models: Vec<Value> = events
        .iter()
        .map(|event| {
            Ok(serde_json::json!({
                "model": model_name(event)?,
                "tokens": &event.payload.tokens,
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    let value = serde_json::json!({
        "bloclawd_rank_v": 1,
        "harness": wire_name(first.payload.harness)?,
        "tier": wire_name(first.payload.tier)?,
        "region": wire_name(first.payload.region)?,
        "limit_type": wire_name(first.limit_type)?,
        "models": models,
    });

    pretty_json_four_spaces(&value)
}

pub fn render_json(
    group_id: &str,
    ended_at: &str,
    parse_failures: (u32, u32),
    requests: &[SubmittedEvent],
    responses: &[(String, u16, serde_json::Value)],
    exit_code: i32,
) -> Result<String> {
    let requests_json: Vec<Value> = requests
        .iter()
        .map(serde_json::to_value)
        .collect::<serde_json::Result<_>>()?;
    let responses_json: Vec<Value> = responses
        .iter()
        .map(|(model, status, body)| {
            serde_json::json!({
                "model": model,
                "status": status,
                "body": body,
            })
        })
        .collect();
    let value = serde_json::json!({
        "group_id": group_id,
        "ended_at": ended_at,
        "parse_failures": {
            "cc": parse_failures.0,
            "codex": parse_failures.1,
        },
        "requests": requests_json,
        "responses": responses_json,
        "exit_code": exit_code,
    });

    Ok(serde_json::to_string(&value)?)
}

fn model_name(event: &SubmittedEvent) -> Result<String> {
    wire_name(event.payload.model)
}

fn wire_name(value: impl Serialize) -> Result<String> {
    let value = serde_json::to_value(value)?;
    Ok(value.as_str().unwrap_or("?").to_string())
}

fn pretty_json_four_spaces(value: &impl Serialize) -> Result<String> {
    let mut bytes = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut bytes, formatter);
    value.serialize(&mut serializer)?;
    Ok(String::from_utf8(bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bloclawd_schema::{EventPayload, Harness, LimitType, Model, Region, Tier, TokenCounts};
    use serde_json::Value;

    fn sample_event(index: usize, model: Model) -> SubmittedEvent {
        SubmittedEvent {
            event_id: format!("event-{index}"),
            challenge_id: format!("challenge-{index}"),
            sig: format!("sig-{index}"),
            nonce: format!("nonce-{index}"),
            submission_group_id: "group".to_string(),
            limit_type: LimitType::FiveH,
            payload: EventPayload {
                v: 1,
                model,
                tier: Tier::Max20,
                harness: Harness::ClaudeCode,
                region: Region::Na,
                tokens: TokenCounts {
                    input_tokens: 100 + index as u64,
                    output_tokens: 200 + index as u64,
                    cache_read_input_tokens: 300 + index as u64,
                    ephemeral_5m_input_tokens: 40 + index as u64,
                    ephemeral_1h_input_tokens: 50 + index as u64,
                    cached_input_tokens: 0,
                    reasoning_output_tokens: 0,
                },
            },
        }
    }

    fn sample_events() -> Vec<SubmittedEvent> {
        vec![
            sample_event(0, Model::ClaudeSonnet45),
            sample_event(1, Model::Gpt5),
            sample_event(2, Model::Gpt55),
        ]
    }

    fn rank_input_block(rendered: &str) -> String {
        let mut current: Option<String> = None;
        for line in rendered.lines() {
            if line == "--- bloclawd rank input ---" {
                current = Some(String::new());
                continue;
            }
            if line == "--- end bloclawd rank input ---" {
                break;
            }
            if let Some(block) = current.as_mut() {
                if !block.is_empty() {
                    block.push('\n');
                }
                block.push_str(line);
            }
        }
        current.expect("rank input block exists")
    }

    #[test]
    fn dry_run_header_contains_group_short_and_event_count() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");

        assert!(output.contains("bloclawd dry-run"));
        assert!(output.contains("12345678"));
        assert!(output.contains("3 models"));
    }

    #[test]
    fn dry_run_is_plain_ascii_with_no_escape_sequences() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");

        assert!(output.is_ascii());
        assert!(
            !output
                .as_bytes()
                .windows(2)
                .any(|window| window == [27, b'['])
        );
        for line in output.lines().filter(|line| line.starts_with('+')) {
            assert!(line.chars().all(|ch| matches!(ch, '+' | '-' | '|' | ' ')));
        }
    }

    #[test]
    fn dry_run_table_has_one_data_row_per_event() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");
        let data_rows = output
            .lines()
            .filter(|line| line.starts_with("| ") && !line.contains("model"))
            .count();

        assert_eq!(data_rows, 3);
    }

    #[test]
    fn dry_run_contains_single_rank_input_and_four_space_pretty_json() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");

        assert!(output.contains("--- bloclawd rank input ---"));
        assert!(output.contains("--- end bloclawd rank input ---"));
        assert!(output.contains("\n    \"bloclawd_rank_v\""));
        assert_eq!(output.matches("--- bloclawd rank input ---").count(), 1);
    }

    #[test]
    fn dry_run_rank_input_preserves_payload_models_and_tokens() {
        let events = sample_events();
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &events)
            .expect("render succeeds");
        let block = rank_input_block(&output);
        let parsed: Value = serde_json::from_str(&block).expect("rank input block is JSON");
        let models = parsed["models"].as_array().expect("models array");

        assert_eq!(parsed["harness"], "claude-code");
        assert_eq!(parsed["tier"], "max20");
        assert_eq!(parsed["region"], "NA");
        assert_eq!(parsed["limit_type"], "5h");
        assert_eq!(models.len(), events.len());
        for (model, event) in models.iter().zip(events.iter()) {
            let expected_model =
                serde_json::to_value(event.payload.model).expect("model serializes");
            let expected_tokens =
                serde_json::to_value(&event.payload.tokens).expect("tokens serialize");
            assert_eq!(model["model"], expected_model);
            assert_eq!(model["tokens"], expected_tokens);
        }
    }

    #[test]
    fn render_json_single_object_shape() {
        let parsed: Value = serde_json::from_str(
            &render_json(
                "group",
                "2026-05-02T00:00:00Z",
                (2, 0),
                &sample_events(),
                &[("gpt-5".to_string(), 200, serde_json::json!({"ok": true}))],
                0,
            )
            .expect("render succeeds"),
        )
        .expect("json parses");

        assert_eq!(parsed["group_id"], "group");
        assert_eq!(parsed["ended_at"], "2026-05-02T00:00:00Z");
        assert!(parsed["parse_failures"].is_object());
        assert!(parsed["requests"].is_array());
        assert!(parsed["responses"].is_array());
        assert_eq!(parsed["exit_code"], 0);
    }

    #[test]
    fn render_json_requests_preserve_canonical_bytes() {
        let events = sample_events();
        let rendered = render_json("group", "2026-05-02T00:00:00Z", (0, 0), &events, &[], 0)
            .expect("render succeeds");
        let parsed: Value = serde_json::from_str(&rendered).expect("json parses");
        let requests = parsed["requests"].as_array().expect("requests array");

        for (request, event) in requests.iter().zip(events.iter()) {
            let got = bloclawd_schema::canonical_bytes(request).expect("request canonicalizes");
            let expected = bloclawd_schema::canonical_bytes(event).expect("event canonicalizes");
            assert_eq!(got, expected);
        }
    }

    #[test]
    fn render_json_dry_run_has_empty_responses() {
        let rendered = render_json(
            "group",
            "2026-05-02T00:00:00Z",
            (0, 0),
            &sample_events(),
            &[],
            0,
        )
        .expect("render succeeds");
        let parsed: Value = serde_json::from_str(&rendered).expect("json parses");

        assert_eq!(parsed["responses"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn render_json_includes_parse_failures() {
        let rendered = render_json("group", "2026-05-02T00:00:00Z", (2, 0), &[], &[], 0)
            .expect("render succeeds");
        let parsed: Value = serde_json::from_str(&rendered).expect("json parses");

        assert_eq!(parsed["parse_failures"]["cc"], 2);
        assert_eq!(parsed["parse_failures"]["codex"], 0);
    }

    #[test]
    fn render_json_has_no_escape_byte() {
        let rendered = render_json(
            "group",
            "2026-05-02T00:00:00Z",
            (0, 0),
            &sample_events(),
            &[],
            0,
        )
        .expect("render succeeds");

        assert!(!rendered.as_bytes().contains(&27));
    }

    #[test]
    fn dry_run_zero_events_returns_header_and_empty_body() {
        let output =
            render_dry_run("12345678-1234-1234-1234-123456789012", &[]).expect("render succeeds");

        assert!(output.contains("bloclawd dry-run"));
        assert!(output.contains("0 models"));
        assert!(output.contains("no models"));
    }
}
