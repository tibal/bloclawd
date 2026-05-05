use crate::enums::{Harness, Model, Region, Tier};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const TOKEN_COUNT_MAX: u64 = 1_000_000_000_000;

fn is_zero_u64(value: &u64) -> bool {
    *value == 0
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(deny_unknown_fields)]
pub struct EventPayload {
    pub v: u8,
    pub model: Model,
    pub tier: Tier,
    pub harness: Harness,
    pub region: Region,
    pub tokens: TokenCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(deny_unknown_fields)]
pub struct TokenCounts {
    #[ts(type = "number")]
    pub input_tokens: u64,
    #[ts(type = "number")]
    pub output_tokens: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    #[ts(type = "number")]
    pub cache_read_input_tokens: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    #[ts(type = "number")]
    pub ephemeral_5m_input_tokens: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    #[ts(type = "number")]
    pub ephemeral_1h_input_tokens: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    #[ts(type = "number")]
    pub cached_input_tokens: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    #[ts(type = "number")]
    pub reasoning_output_tokens: u64,
}

impl EventPayload {
    /// Hand-rolled bound checks keep the Worker WASM small for simple numeric
    /// validation while serde rejects unknown enum values.
    pub fn validate(&self) -> Result<(), String> {
        if self.v != 1 {
            return Err(format!("unsupported v: {} (expected 1)", self.v));
        }
        let t = &self.tokens;
        for (name, val) in [
            ("input_tokens", t.input_tokens),
            ("output_tokens", t.output_tokens),
            ("cache_read_input_tokens", t.cache_read_input_tokens),
            ("ephemeral_5m_input_tokens", t.ephemeral_5m_input_tokens),
            ("ephemeral_1h_input_tokens", t.ephemeral_1h_input_tokens),
            ("cached_input_tokens", t.cached_input_tokens),
            ("reasoning_output_tokens", t.reasoning_output_tokens),
        ] {
            if val > TOKEN_COUNT_MAX {
                return Err(format!("tokens.{name} = {val} exceeds {TOKEN_COUNT_MAX}"));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::ClaudeSonnet45,
            tier: Tier::Pro,
            harness: Harness::ClaudeCode,
            region: Region::Na,
            tokens: TokenCounts {
                input_tokens: 1,
                output_tokens: 2,
                cache_read_input_tokens: 3,
                ephemeral_5m_input_tokens: 4,
                ephemeral_1h_input_tokens: 5,
                cached_input_tokens: 0,
                reasoning_output_tokens: 0,
            },
        }
    }

    #[test]
    fn validate_rejects_unsupported_version() {
        let mut payload = sample_payload();
        payload.v = 0;
        let err = payload.validate().unwrap_err();
        assert!(err.contains("v"));
    }

    #[test]
    fn validate_rejects_token_field_above_limit_with_field_name() {
        let mut payload = sample_payload();
        payload.tokens.input_tokens = TOKEN_COUNT_MAX + 1;
        let err = payload.validate().unwrap_err();
        assert!(err.contains("input_tokens"));
    }

    #[test]
    fn validate_accepts_high_real_world_cache_reads() {
        let mut payload = sample_payload();
        payload.tokens.cache_read_input_tokens = 10_378_233;
        assert!(payload.validate().is_ok());
    }

    #[test]
    fn validate_accepts_high_real_world_codex_inputs() {
        let mut payload = sample_payload();
        payload.model = Model::Gpt55;
        payload.harness = Harness::Codex;
        payload.tokens.input_tokens = 2_064_887_608;
        payload.tokens.cached_input_tokens = 1_630_864_859;
        assert!(payload.validate().is_ok());
    }

    #[test]
    fn validate_accepts_valid_payload() {
        assert!(sample_payload().validate().is_ok());
    }

    #[test]
    fn serde_defaults_provider_specific_absent_fields_to_zero() {
        let raw = r#"{
            "v": 1,
            "model": "claude-sonnet-4-5",
            "tier": "pro",
            "harness": "claude-code",
            "region": "NA",
            "tokens": {
                "input_tokens": 1,
                "output_tokens": 2
            }
        }"#;
        let payload: EventPayload = serde_json::from_str(raw).expect("payload parses");
        assert_eq!(payload.tokens.cache_read_input_tokens, 0);
        assert_eq!(payload.tokens.ephemeral_5m_input_tokens, 0);
        assert_eq!(payload.tokens.ephemeral_1h_input_tokens, 0);
        assert_eq!(payload.tokens.cached_input_tokens, 0);
        assert_eq!(payload.tokens.reasoning_output_tokens, 0);
    }

    #[test]
    fn serde_rejects_unknown_top_level_field() {
        let raw = r#"{
            "v": 1,
            "model": "claude-sonnet-4-5",
            "tier": "pro",
            "harness": "claude-code",
            "region": "NA",
            "tokens": {
                "input_tokens": 1,
                "output_tokens": 2,
                "cache_read_input_tokens": 3,
                "ephemeral_5m_input_tokens": 4,
                "ephemeral_1h_input_tokens": 5
            },
            "extra": "x"
        }"#;
        assert!(serde_json::from_str::<EventPayload>(raw).is_err());
    }
}
