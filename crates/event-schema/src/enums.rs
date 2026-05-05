use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Model {
    #[serde(rename = "claude-opus-4-7")]
    ClaudeOpus47,
    #[serde(rename = "claude-sonnet-4-6")]
    ClaudeSonnet46,
    #[serde(rename = "claude-sonnet-4-5")]
    ClaudeSonnet45,
    #[serde(rename = "claude-haiku-4-5")]
    ClaudeHaiku45,
    #[serde(rename = "gpt-5")]
    Gpt5,
    #[serde(rename = "gpt-5.5")]
    Gpt55,
    #[serde(rename = "gpt-5-codex")]
    Gpt5Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Tier {
    #[serde(rename = "pro")]
    Pro,
    #[serde(rename = "max5")]
    Max5,
    #[serde(rename = "max20")]
    Max20,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Harness {
    #[serde(rename = "claude-code")]
    ClaudeCode,
    #[serde(rename = "codex")]
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "UPPERCASE")]
pub enum Region {
    Na,
    Eu,
    As,
    Sa,
    Oc,
    Af,
    An,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum LimitType {
    #[serde(rename = "5h")]
    FiveH,
    #[serde(rename = "weekly")]
    Weekly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TokenType {
    #[serde(rename = "input_tokens")]
    InputTokens,
    #[serde(rename = "output_tokens")]
    OutputTokens,
    #[serde(rename = "cache_read_input_tokens")]
    CacheReadInputTokens,
    #[serde(rename = "ephemeral_5m_input_tokens")]
    Ephemeral5mInputTokens,
    #[serde(rename = "ephemeral_1h_input_tokens")]
    Ephemeral1hInputTokens,
    #[serde(rename = "cached_input_tokens")]
    CachedInputTokens,
    #[serde(rename = "reasoning_output_tokens")]
    ReasoningOutputTokens,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_roundtrip_claude_sonnet_4_5() {
        let parsed: Model = serde_json::from_str(r#""claude-sonnet-4-5""#).unwrap();
        assert_eq!(parsed, Model::ClaudeSonnet45);
        assert_eq!(
            serde_json::to_string(&parsed).unwrap(),
            r#""claude-sonnet-4-5""#
        );
    }

    #[test]
    fn model_rejects_unknown() {
        assert!(serde_json::from_str::<Model>(r#""bogus""#).is_err());
    }

    #[test]
    fn model_roundtrip_gpt_5_5() {
        let parsed: Model = serde_json::from_str(r#""gpt-5.5""#).unwrap();
        assert_eq!(serde_json::to_string(&parsed).unwrap(), r#""gpt-5.5""#);
    }

    #[test]
    fn model_rejects_neighboring_gpt_versions() {
        let parsed: Model = serde_json::from_str(r#""gpt-5""#).unwrap();
        assert_eq!(parsed, Model::Gpt5);
        assert!(serde_json::from_str::<Model>(r#""gpt-5.6""#).is_err());
    }

    #[test]
    fn tiers_are_provider_neutral_price_buckets() {
        assert_eq!(serde_json::to_string(&Tier::Pro).unwrap(), r#""pro""#);
        assert_eq!(serde_json::to_string(&Tier::Max5).unwrap(), r#""max5""#);
        assert_eq!(serde_json::to_string(&Tier::Max20).unwrap(), r#""max20""#);
        assert!(serde_json::from_str::<Tier>(r#""business""#).is_err());
        assert!(serde_json::from_str::<Tier>(r#""pro_codex""#).is_err());
    }

    #[test]
    fn limit_types_round_trip() {
        assert_eq!(serde_json::to_string(&LimitType::FiveH).unwrap(), r#""5h""#);
        assert_eq!(
            serde_json::to_string(&LimitType::Weekly).unwrap(),
            r#""weekly""#
        );
        assert!(serde_json::from_str::<LimitType>(r#""5min""#).is_err());
        assert!(serde_json::from_str::<LimitType>(r#""daily""#).is_err());
        assert!(serde_json::from_str::<LimitType>(r#""FiveH""#).is_err());
        assert!(serde_json::from_str::<LimitType>(r#""5h_codex""#).is_err());
    }

    #[test]
    fn token_types_round_trip() {
        assert_eq!(
            serde_json::to_string(&TokenType::InputTokens).unwrap(),
            r#""input_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::OutputTokens).unwrap(),
            r#""output_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::CacheReadInputTokens).unwrap(),
            r#""cache_read_input_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::Ephemeral5mInputTokens).unwrap(),
            r#""ephemeral_5m_input_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::Ephemeral1hInputTokens).unwrap(),
            r#""ephemeral_1h_input_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::CachedInputTokens).unwrap(),
            r#""cached_input_tokens""#
        );
        assert_eq!(
            serde_json::to_string(&TokenType::ReasoningOutputTokens).unwrap(),
            r#""reasoning_output_tokens""#
        );
        assert!(serde_json::from_str::<TokenType>(r#""INPUT""#).is_err());
        assert!(serde_json::from_str::<TokenType>(r#""reads_cached""#).is_err());
    }
}
