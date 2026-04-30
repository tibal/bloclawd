use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Model {
    ClaudeOpus47,
    ClaudeSonnet46,
    ClaudeSonnet45,
    ClaudeHaiku45,
    Gpt5,
    Gpt5Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Tier {
    Pro,
    Max5,
    Max20,
    Plus,
    ProCodex,
    Business,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Harness {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
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
