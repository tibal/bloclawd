//! Min-version assertion via JSONL field-shape heuristic (D-67 + D-68).

use serde_json::Value;

pub const MIN_CC_VERSION: &str = "0.0.0";
pub const MIN_CODEX_VERSION: &str = "0.0.0";

pub fn cc_first_line_passes_field_shape(_line: &Value) -> bool {
    false
}

pub fn codex_first_token_count_passes_field_shape(_line: &Value) -> bool {
    false
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
        assert_eq!(MIN_CC_VERSION, "2.1.89");
    }

    #[test]
    fn min_codex_version_is_pinned() {
        assert_eq!(MIN_CODEX_VERSION, "0.125.0");
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
