//! Rate-limit signature classifiers.
//!
//! Matching uses the lowercased union of stdout and stderr. Do not log inputs:
//! they may contain user prompt content.

pub static CC_RATE_LIMIT_TOKENS: &[&str] = &[
    "usage limit reached",
    "5-hour limit reached",
    "weekly limit reached",
    "limit reached",
    "rate limit reached",
];

pub static CC_RATE_LIMIT_EXCLUSIONS: &[&str] =
    &["server is temporarily limiting", "anthropic_api_key"];

pub static CODEX_RATE_LIMIT_TOKENS: &[&str] = &[
    "hit your usage limit",
    "usage limit reached",
    "rate limit reached",
];

pub static CODEX_RATE_LIMIT_EXCLUSIONS: &[&str] = &["openai_api_key"];

pub fn cc_is_rate_limited(stdout: &str, stderr: &str) -> bool {
    let combined = format!("{stdout}\n{stderr}").to_lowercase();
    if CC_RATE_LIMIT_EXCLUSIONS
        .iter()
        .any(|token| combined.contains(token))
    {
        return false;
    }

    CC_RATE_LIMIT_TOKENS
        .iter()
        .any(|token| combined.contains(token))
}

pub fn codex_is_rate_limited(stdout: &str, stderr: &str) -> bool {
    let combined = format!("{stdout}\n{stderr}").to_lowercase();
    if CODEX_RATE_LIMIT_EXCLUSIONS
        .iter()
        .any(|token| combined.contains(token))
    {
        return false;
    }

    CODEX_RATE_LIMIT_TOKENS
        .iter()
        .any(|token| combined.contains(token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cc_matches_usage_limit_reached() {
        assert!(cc_is_rate_limited(
            "Claude usage limit reached. Your limit will reset at 16:00 (PST)",
            ""
        ));
    }

    #[test]
    fn cc_matches_five_hour_limit_reached() {
        assert!(cc_is_rate_limited(
            "5-hour limit reached - resets 14:30",
            ""
        ));
    }

    #[test]
    fn cc_matches_weekly_limit_reached() {
        assert!(cc_is_rate_limited("weekly limit reached", ""));
    }

    #[test]
    fn cc_matches_rate_limit_reached_case_insensitive() {
        assert!(cc_is_rate_limited("API Error: Rate limit reached", ""));
    }

    #[test]
    fn cc_rejects_server_temporarily_limiting_exclusion() {
        assert!(!cc_is_rate_limited(
            "Server is temporarily limiting requests. Rate limited.",
            ""
        ));
    }

    #[test]
    fn cc_rejects_anthropic_api_key_error() {
        assert!(!cc_is_rate_limited("ANTHROPIC_API_KEY error", ""));
    }

    #[test]
    fn cc_rejects_unrelated_text() {
        assert!(!cc_is_rate_limited("hello world", ""));
    }

    #[test]
    fn codex_matches_hit_your_usage_limit() {
        assert!(codex_is_rate_limited("You've hit your usage limit.", ""));
    }

    #[test]
    fn codex_matches_usage_limit_reached() {
        assert!(codex_is_rate_limited("usage limit reached", ""));
    }

    #[test]
    fn codex_rejects_openai_api_key_error() {
        assert!(!codex_is_rate_limited("OPENAI_API_KEY is missing", ""));
    }

    #[test]
    fn classifiers_are_case_insensitive() {
        assert!(cc_is_rate_limited("USAGE LIMIT REACHED", ""));
        assert!(codex_is_rate_limited("RATE LIMIT REACHED", ""));
    }

    #[test]
    fn classifiers_match_tokens_in_stderr() {
        assert!(cc_is_rate_limited("", "weekly limit reached"));
        assert!(codex_is_rate_limited("", "You've hit your usage limit."));
    }
}
