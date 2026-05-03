//! Single render layer for dry-run human output and machine JSON.

use anyhow::Result;
use bloclawd_schema::SubmittedEvent;
use serde::Serialize;
use serde_json::Value;

use crate::canonical::canonicalize;

pub fn render_dry_run(group_id: &str, events: &[SubmittedEvent]) -> Result<String> {
    let group_short = &group_id[..group_id.len().min(8)];
    let mut out = String::new();
    out.push_str(&format!(
        "bloclawd dry-run - group {group_short}... - {} events\n\n",
        events.len()
    ));

    if events.is_empty() {
        out.push_str("(no events)\n");
        return Ok(out);
    }

    let header = format!(
        "| {:<22} | {:>10} | {:>11} | {:>16} | {:>17} | {:>10} | {:>10} | {:>15} | {:>15} |",
        "model",
        "input_5min",
        "output_5min",
        "cached_read_5min",
        "cached_write_5min",
        "input_5h",
        "output_5h",
        "cached_read_5h",
        "cached_write_5h"
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
            "| {:<22} | {:>10} | {:>11} | {:>16} | {:>17} | {:>10} | {:>10} | {:>15} | {:>15} |",
            model_name(event)?,
            tokens.input_5min,
            tokens.output_5min,
            tokens.cached_read_5min,
            tokens.cached_write_5min,
            tokens.input_5h,
            tokens.output_5h,
            tokens.cached_read_5h,
            tokens.cached_write_5h
        );
        out.push_str(&row);
        out.push('\n');
    }

    out.push_str(&sep);
    out.push('\n');
    out.push('\n');

    for (index, event) in events.iter().enumerate() {
        out.push_str(&format!("--- event {}/{} ---\n", index + 1, events.len()));
        out.push_str(&canonical_pretty_event(event)?);
        out.push('\n');
    }

    Ok(out)
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
    let value = serde_json::to_value(event.payload.model)?;
    Ok(value.as_str().unwrap_or("?").to_string())
}

fn canonical_pretty_event(event: &SubmittedEvent) -> Result<String> {
    let canonical_payload = canonicalize(&event.payload)?;
    let payload_value: Value = serde_json::from_slice(&canonical_payload)?;
    let canonical_event = bloclawd_schema::canonical_bytes(event)?;
    let mut event_value: Value = serde_json::from_slice(&canonical_event)?;
    if let Some(object) = event_value.as_object_mut() {
        object.insert("payload".to_string(), payload_value);
    }
    pretty_json_four_spaces(&event_value)
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
                    input_5min: 10 + index as u64,
                    output_5min: 20 + index as u64,
                    cached_read_5min: 30 + index as u64,
                    cached_write_5min: 40 + index as u64,
                    input_5h: 100 + index as u64,
                    output_5h: 200 + index as u64,
                    cached_read_5h: 300 + index as u64,
                    cached_write_5h: 400 + index as u64,
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

    fn event_json_blocks(rendered: &str) -> Vec<String> {
        let mut blocks = Vec::new();
        let mut current: Option<String> = None;
        for line in rendered.lines() {
            if line.starts_with("--- event ") {
                if let Some(block) = current.take() {
                    blocks.push(block);
                }
                current = Some(String::new());
                continue;
            }
            if let Some(block) = current.as_mut() {
                if !block.is_empty() {
                    block.push('\n');
                }
                block.push_str(line);
            }
        }
        if let Some(block) = current {
            blocks.push(block);
        }
        blocks
    }

    #[test]
    fn dry_run_header_contains_group_short_and_event_count() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");

        assert!(output.contains("bloclawd dry-run"));
        assert!(output.contains("12345678"));
        assert!(output.contains("3 events"));
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
    fn dry_run_contains_dividers_and_four_space_pretty_json() {
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &sample_events())
            .expect("render succeeds");

        assert!(output.contains("--- event 1/3 ---"));
        assert!(output.contains("--- event 2/3 ---"));
        assert!(output.contains("--- event 3/3 ---"));
        assert!(output.contains("\n    \"event_id\""));
        assert_eq!(event_json_blocks(&output).len(), 3);
    }

    #[test]
    fn dry_run_event_blocks_preserve_canonical_request_bytes() {
        let events = sample_events();
        let output = render_dry_run("12345678-1234-1234-1234-123456789012", &events)
            .expect("render succeeds");
        let blocks = event_json_blocks(&output);

        for (block, event) in blocks.iter().zip(events.iter()) {
            let parsed: Value = serde_json::from_str(block).expect("block is JSON");
            let rendered = bloclawd_schema::canonical_bytes(&parsed).expect("block canonicalizes");
            let expected = bloclawd_schema::canonical_bytes(event).expect("event canonicalizes");
            assert_eq!(rendered, expected);
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
        assert!(output.contains("0 events"));
        assert!(output.contains("no events"));
    }
}
