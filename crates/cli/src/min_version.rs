//! Min-version assertion via JSONL field-shape heuristic.

use serde_json::Value;

pub const MIN_CC_VERSION: &str = "2.1.89";
pub const MIN_CODEX_VERSION: &str = "0.125.0";

pub fn cc_first_line_passes_field_shape(line: &Value) -> bool {
    if line.get("type").and_then(Value::as_str) != Some("assistant") {
        return false;
    }
    let msg = match line.get("message") {
        Some(msg) => msg,
        None => return false,
    };
    let model = match msg.get("model").and_then(Value::as_str) {
        Some(model) => model,
        None => return false,
    };
    if model == "<synthetic>" {
        return false;
    }
    let usage = match msg.get("usage") {
        Some(usage) => usage,
        None => return false,
    };

    let has_split_cache_creation = usage
        .get("cache_creation")
        .and_then(|creation| creation.get("ephemeral_5m_input_tokens"))
        .and_then(Value::as_u64)
        .is_some()
        && usage
            .get("cache_creation")
            .and_then(|creation| creation.get("ephemeral_1h_input_tokens"))
            .and_then(Value::as_u64)
            .is_some();
    let has_legacy_cache_creation = usage
        .get("cache_creation_input_tokens")
        .and_then(Value::as_u64)
        .is_some();

    usage.get("input_tokens").and_then(Value::as_u64).is_some()
        && usage.get("output_tokens").and_then(Value::as_u64).is_some()
        && usage
            .get("cache_read_input_tokens")
            .and_then(Value::as_u64)
            .is_some()
        && (has_split_cache_creation || has_legacy_cache_creation)
}

pub fn codex_first_token_count_passes_field_shape(line: &Value) -> bool {
    if line.get("type").and_then(Value::as_str) != Some("event_msg") {
        return false;
    }
    let payload = match line.get("payload") {
        Some(payload) => payload,
        None => return false,
    };
    if payload.get("type").and_then(Value::as_str) != Some("token_count") {
        return false;
    }
    let info = match payload.get("info") {
        Some(info) if !info.is_null() => info,
        _ => return false,
    };
    let last = match info.get("last_token_usage") {
        Some(last) => last,
        None => return false,
    };

    last.get("input_tokens").and_then(Value::as_u64).is_some()
        && last.get("output_tokens").and_then(Value::as_u64).is_some()
        && last
            .get("cached_input_tokens")
            .and_then(Value::as_u64)
            .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cc_value() -> Value {
        json!({
            "type": "assistant",
            "timestamp": "2026-01-01T12:00:00Z",
            "version": "2.1.126",
            "requestId": "req_123",
            "message": {
                "model": "claude-sonnet-4-5",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 20,
                    "cache_read_input_tokens": 30,
                    "cache_creation_input_tokens": 40
                }
            }
        })
    }

    fn codex_value() -> Value {
        json!({
            "type": "event_msg",
            "timestamp": "2026-01-01T12:00:00Z",
            "payload": {
                "type": "token_count",
                "info": {
                    "last_token_usage": {
                        "input_tokens": 10,
                        "output_tokens": 20,
                        "cached_input_tokens": 30,
                        "reasoning_output_tokens": 5
                    }
                }
            }
        })
    }

    #[test]
    fn min_cc_version_is_pinned() {
        assert_eq!(
            MIN_CC_VERSION.split('.').collect::<Vec<_>>(),
            ["2", "1", "89"]
        );
    }

    #[test]
    fn min_codex_version_is_pinned() {
        assert_eq!(
            MIN_CODEX_VERSION.split('.').collect::<Vec<_>>(),
            ["0", "125", "0"]
        );
    }

    #[test]
    fn cc_first_line_shape_happy_path() {
        assert!(cc_first_line_passes_field_shape(&cc_value()));
    }

    #[test]
    fn cc_first_line_shape_rejects_missing_input_tokens() {
        let mut v = cc_value();
        v["message"]["usage"]
            .as_object_mut()
            .unwrap()
            .remove("input_tokens");
        assert!(!cc_first_line_passes_field_shape(&v));
    }

    #[test]
    fn cc_first_line_shape_rejects_missing_model() {
        let mut v = cc_value();
        v["message"].as_object_mut().unwrap().remove("model");
        assert!(!cc_first_line_passes_field_shape(&v));
    }

    #[test]
    fn cc_first_line_shape_rejects_synthetic_model() {
        let mut v = cc_value();
        v["message"]["model"] = json!("<synthetic>");
        assert!(!cc_first_line_passes_field_shape(&v));
    }

    #[test]
    fn codex_first_token_count_shape_happy_path() {
        assert!(codex_first_token_count_passes_field_shape(&codex_value()));
    }

    #[test]
    fn codex_first_token_count_shape_rejects_null_info() {
        let mut v = codex_value();
        v["payload"]["info"] = Value::Null;
        assert!(!codex_first_token_count_passes_field_shape(&v));
    }

    #[test]
    fn codex_first_token_count_shape_rejects_missing_cached_input() {
        let mut v = codex_value();
        v["payload"]["info"]["last_token_usage"]
            .as_object_mut()
            .unwrap()
            .remove("cached_input_tokens");
        assert!(!codex_first_token_count_passes_field_shape(&v));
    }
}
