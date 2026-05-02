//! CLI-19 provider harness probe.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Harness {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeOutcome {
    RateLimited,
    Converge,
}

pub fn make_probe_uuid() -> String {
    "not-a-uuid".to_string()
}

pub fn probe_command_args(_harness: Harness, _uuid: &str) -> (&'static str, Vec<String>) {
    ("", Vec::new())
}

pub fn probe_blocking(_harness: Harness) -> ProbeOutcome {
    ProbeOutcome::RateLimited
}

pub fn probe_blocking_with_program(_harness: Harness, _program: &str) -> ProbeOutcome {
    ProbeOutcome::RateLimited
}

pub async fn probe_async(_harness: Harness) -> ProbeOutcome {
    ProbeOutcome::RateLimited
}

pub fn scrub_env(parent: impl IntoIterator<Item = (String, String)>) -> Vec<(String, String)> {
    parent.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use uuid::{Uuid, Version};

    #[test]
    fn probe_command_args_for_claude_code_are_exact() {
        let (program, args) = probe_command_args(
            Harness::ClaudeCode,
            "00000000-0000-4000-8000-000000000000",
        );

        assert_eq!(program, "claude");
        assert_eq!(args, ["--print", "00000000-0000-4000-8000-000000000000"]);
        assert_eq!(args.len(), 2);
        assert!(!args.iter().any(|arg| arg.contains("bloclawd") || arg.contains("probe")));
    }

    #[test]
    fn probe_command_args_for_codex_are_exact() {
        let (program, args) =
            probe_command_args(Harness::Codex, "00000000-0000-4000-8000-000000000000");

        assert_eq!(program, "codex");
        assert_eq!(args, ["exec", "00000000-0000-4000-8000-000000000000"]);
        assert_eq!(args.len(), 2);
        assert!(!args.iter().any(|arg| arg.contains("bloclawd") || arg.contains("probe")));
    }

    #[test]
    fn make_probe_uuid_generates_uuid_v4() {
        let value = make_probe_uuid();
        let parsed = Uuid::parse_str(&value).expect("probe prompt parses as UUID");
        assert_eq!(parsed.get_version(), Some(Version::Random));
    }

    #[test]
    fn scrub_env_removes_only_prefixed_vars() {
        let scrubbed = scrub_env([
            ("PATH".to_string(), "/bin".to_string()),
            ("HOME".to_string(), "/home/tester".to_string()),
            ("BLOCLAWD_API_URL".to_string(), "https://example.test".to_string()),
            ("BLOCLAWD_COUNTRY".to_string(), "US".to_string()),
            ("USER".to_string(), "tester".to_string()),
        ]);
        let map: BTreeMap<_, _> = scrubbed.into_iter().collect();

        assert_eq!(map.get("PATH").map(String::as_str), Some("/bin"));
        assert_eq!(map.get("HOME").map(String::as_str), Some("/home/tester"));
        assert_eq!(map.get("USER").map(String::as_str), Some("tester"));
        assert!(!map.contains_key("BLOCLAWD_API_URL"));
        assert!(!map.contains_key("BLOCLAWD_COUNTRY"));
    }

    #[test]
    fn converge_is_single_probe_failure_variant() {
        let outcomes = [
            ProbeOutcome::Converge,
            ProbeOutcome::Converge,
            ProbeOutcome::Converge,
            ProbeOutcome::Converge,
        ];

        assert!(outcomes.iter().all(|outcome| *outcome == ProbeOutcome::Converge));
    }

    #[test]
    fn probe_blocking_with_missing_binary_returns_converge() {
        assert_eq!(
            probe_blocking_with_program(Harness::ClaudeCode, "definitely-not-a-real-cli-1234"),
            ProbeOutcome::Converge
        );
    }

    #[test]
    fn probe_blocking_runtime_drops_before_reqwest_blocking_client() {
        let outcome =
            probe_blocking_with_program(Harness::Codex, "definitely-not-a-real-cli-1234");
        assert_eq!(outcome, ProbeOutcome::Converge);

        let client = reqwest::blocking::Client::builder()
            .build()
            .expect("reqwest blocking client builds after probe runtime drops");
        drop(client);
    }
}
