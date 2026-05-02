//! Dry-run and JSON render layer.

use anyhow::Result;
use event_schema::SubmittedEvent;

pub fn render_dry_run(_group_id: &str, _events: &[SubmittedEvent]) -> Result<String> {
    Ok("bloclawd dry-run\n".to_string())
}

pub fn render_json(
    _group_id: &str,
    _ended_at: &str,
    _parse_failures: (u32, u32),
    _requests: &[SubmittedEvent],
    _responses: &[(String, u16, serde_json::Value)],
    _exit_code: i32,
) -> Result<String> {
    Ok("{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};
    use serde_json::Value;

    fn sample_event(index: usize, model: Model) -> SubmittedEvent {
        SubmittedEvent {
            event_id: format!("event-{index}"),
            challenge_id: format!("challenge-{index}"),
            sig: format!("sig-{index}"),
            nonce: format!("nonce-{index}"),
            submission_group_id: "group".to_string(),
            payload: EventPayload {
                v: 1,
                model,
                tier: Tier::Max20,
                harness: Harness::ClaudeCode,
                region: Region::Na,
                tokens: TokenCounts {
                    input_5min: 10 + index as u32,
                    output_5min: 20 + index as u32,
                    cached_read_5min: 30 + index as u32,
                    cached_write_5min: 40 + index as u32,
                    input_5h: 100 + index as u32,
                    output_5h: 200 + index as u32,
                    cached_read_5h: 300 + index as u32,
                    cached_write_5h: 400 + index as u32,
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
        let output = render_dry_run(
            "12345678-1234-1234-1234-123456789012",
            &sample_events(),
        )
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
        assert!(!output.as_bytes().windows(2).any(|window| window == [27, b'[']));
        for line in output.lines().filter(|line| line.starts_with('+')) {
            assert!(
                line.chars()
                    .all(|ch| matches!(ch, '+' | '-' | '|' | ' '))
            );
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
            let rendered = event_schema::canonical_bytes(&parsed).expect("block canonicalizes");
            let expected = event_schema::canonical_bytes(event).expect("event canonicalizes");
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
            let got = event_schema::canonical_bytes(request).expect("request canonicalizes");
            let expected = event_schema::canonical_bytes(event).expect("event canonicalizes");
            assert_eq!(got, expected);
        }
    }

    #[test]
    fn render_json_dry_run_has_empty_responses() {
        let rendered = render_json("group", "2026-05-02T00:00:00Z", (0, 0), &sample_events(), &[], 0)
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
        let rendered = render_json("group", "2026-05-02T00:00:00Z", (0, 0), &sample_events(), &[], 0)
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
