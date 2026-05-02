use crate::enums::{Harness, Model, Region, Tier};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const TOKEN_COUNT_MAX: u32 = 100_000_000;

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
    pub input_5min: u32,
    pub output_5min: u32,
    pub cached_read_5min: u32,
    pub cached_write_5min: u32,
    pub input_5h: u32,
    pub output_5h: u32,
    pub cached_read_5h: u32,
    pub cached_write_5h: u32,
}

impl EventPayload {
    /// Hand-rolled bound checks. Per RESEARCH.md Don't Hand-Roll: garde adds 30+ kB
    /// WASM weight for what is 8 lines of validation. INGE-07 is satisfied here plus
    /// serde's native rejection of unknown enum values (closed enum sets).
    pub fn validate(&self) -> Result<(), String> {
        if self.v != 1 {
            return Err(format!("unsupported v: {} (expected 1)", self.v));
        }
        let t = &self.tokens;
        for (name, val) in [
            ("input_5min", t.input_5min),
            ("output_5min", t.output_5min),
            ("cached_read_5min", t.cached_read_5min),
            ("cached_write_5min", t.cached_write_5min),
            ("input_5h", t.input_5h),
            ("output_5h", t.output_5h),
            ("cached_read_5h", t.cached_read_5h),
            ("cached_write_5h", t.cached_write_5h),
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
                input_5min: 1,
                output_5min: 2,
                cached_read_5min: 3,
                cached_write_5min: 4,
                input_5h: 5,
                output_5h: 6,
                cached_read_5h: 7,
                cached_write_5h: 8,
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
        payload.tokens.input_5h = TOKEN_COUNT_MAX + 1;
        let err = payload.validate().unwrap_err();
        assert!(err.contains("input_5h"));
    }

    #[test]
    fn validate_accepts_high_real_world_cache_reads() {
        let mut payload = sample_payload();
        payload.tokens.cached_read_5h = 10_378_233;
        assert!(payload.validate().is_ok());
    }

    #[test]
    fn validate_accepts_valid_payload() {
        assert!(sample_payload().validate().is_ok());
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
                "input_5min": 1,
                "output_5min": 2,
                "cached_read_5min": 3,
                "cached_write_5min": 4,
                "input_5h": 5,
                "output_5h": 6,
                "cached_read_5h": 7,
                "cached_write_5h": 8
            },
            "extra": "x"
        }"#;
        assert!(serde_json::from_str::<EventPayload>(raw).is_err());
    }
}
