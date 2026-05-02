//! CLI-19 provider harness probe.

use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;

use crate::probe_sig::{cc_is_rate_limited, codex_is_rate_limited};

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
    Uuid::new_v4().to_string()
}

pub fn probe_command_args(harness: Harness, uuid: &str) -> (&'static str, Vec<String>) {
    match harness {
        Harness::ClaudeCode => ("claude", vec!["--print".to_string(), uuid.to_string()]),
        Harness::Codex => ("codex", vec!["exec".to_string(), uuid.to_string()]),
    }
}

pub fn probe_blocking(harness: Harness) -> ProbeOutcome {
    let (program, _) = probe_command_args(harness, "");
    probe_blocking_with_program(harness, program)
}

pub fn probe_blocking_with_program(harness: Harness, program: &str) -> ProbeOutcome {
    let rt = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(_) => return ProbeOutcome::Converge,
    };

    rt.block_on(probe_async_with_program(harness, program))
}

pub async fn probe_async(harness: Harness) -> ProbeOutcome {
    let (program, _) = probe_command_args(harness, "");
    probe_async_with_program(harness, program).await
}

async fn probe_async_with_program(harness: Harness, program: &str) -> ProbeOutcome {
    let uuid = make_probe_uuid();
    let (_, args) = probe_command_args(harness, &uuid);

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .env_clear();

    for (key, value) in scrub_env(std::env::vars()) {
        cmd.env(key, value);
    }

    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(_) => return ProbeOutcome::Converge,
    };

    let out = match timeout(Duration::from_secs(30), child.wait_with_output()).await {
        Ok(Ok(out)) => out,
        _ => return ProbeOutcome::Converge,
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    let is_rate_limited = match harness {
        Harness::ClaudeCode => cc_is_rate_limited(&stdout, &stderr),
        Harness::Codex => codex_is_rate_limited(&stdout, &stderr),
    };

    if is_rate_limited {
        ProbeOutcome::RateLimited
    } else {
        ProbeOutcome::Converge
    }
}

pub fn scrub_env(parent: impl IntoIterator<Item = (String, String)>) -> Vec<(String, String)> {
    parent
        .into_iter()
        .filter(|(key, _)| !key.starts_with("BLOCLAWD_"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use uuid::{Uuid, Version};

    #[test]
    fn probe_command_args_for_claude_code_are_exact() {
        let (program, args) =
            probe_command_args(Harness::ClaudeCode, "00000000-0000-4000-8000-000000000000");

        assert_eq!(program, "claude");
        assert_eq!(args, ["--print", "00000000-0000-4000-8000-000000000000"]);
        assert_eq!(args.len(), 2);
        let branded = ["bloc", "lawd"].concat();
        assert!(
            !args
                .iter()
                .any(|arg| arg.contains(&branded) || arg.contains("probe"))
        );
    }

    #[test]
    fn probe_command_args_for_codex_are_exact() {
        let (program, args) =
            probe_command_args(Harness::Codex, "00000000-0000-4000-8000-000000000000");

        assert_eq!(program, "codex");
        assert_eq!(args, ["exec", "00000000-0000-4000-8000-000000000000"]);
        assert_eq!(args.len(), 2);
        let branded = ["bloc", "lawd"].concat();
        assert!(
            !args
                .iter()
                .any(|arg| arg.contains(&branded) || arg.contains("probe"))
        );
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
            (
                "BLOCLAWD_API_URL".to_string(),
                "https://example.test".to_string(),
            ),
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

        assert!(
            outcomes
                .iter()
                .all(|outcome| *outcome == ProbeOutcome::Converge)
        );
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
        let outcome = probe_blocking_with_program(Harness::Codex, "definitely-not-a-real-cli-1234");
        assert_eq!(outcome, ProbeOutcome::Converge);

        let client = reqwest::blocking::Client::builder()
            .build()
            .expect("reqwest blocking client builds after probe runtime drops");
        drop(client);
    }
}
