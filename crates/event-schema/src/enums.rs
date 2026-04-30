use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
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
    #[serde(rename = "gpt-5-codex")]
    Gpt5Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Tier {
    #[serde(rename = "pro")]
    Pro,
    #[serde(rename = "max5")]
    Max5,
    #[serde(rename = "max20")]
    Max20,
    #[serde(rename = "plus")]
    Plus,
    #[serde(rename = "pro_codex")]
    ProCodex,
    #[serde(rename = "business")]
    Business,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Harness {
    #[serde(rename = "claude-code")]
    ClaudeCode,
    #[serde(rename = "codex")]
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_roundtrip_claude_sonnet_4_5() {
        let parsed: Model = serde_json::from_str(r#""claude-sonnet-4-5""#).unwrap();
        assert_eq!(parsed, Model::ClaudeSonnet45);
        assert_eq!(serde_json::to_string(&parsed).unwrap(), r#""claude-sonnet-4-5""#);
    }

    #[test]
    fn model_rejects_unknown() {
        assert!(serde_json::from_str::<Model>(r#""bogus""#).is_err());
    }

    #[test]
    fn tier_pro_codex_is_snake_case() {
        assert_eq!(serde_json::to_string(&Tier::ProCodex).unwrap(), r#""pro_codex""#);
    }
}
