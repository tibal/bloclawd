//! In-process fixture lock.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bloclawd::aggregate::WindowKind;
use bloclawd::parsers::{cc, codex};
use bloclawd::{Args, IngestCliError, run_inner_with_output};
use clap::Parser;
use bloclawd_schema::{LimitType, Model, TokenCounts};
use serde_json::{Map, Value};
use uuid::{Uuid, Version};

const REGEN_ENV: &str = "BLOCLAWD_REGEN_FIXTURES";

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> MutexGuard<'static, ()> {
    ENV_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct EnvGuard {
    home_prev: Option<std::ffi::OsString>,
    codex_prev: Option<std::ffi::OsString>,
    country_prev: Option<std::ffi::OsString>,
    api_prev: Option<std::ffi::OsString>,
    root: PathBuf,
}

impl EnvGuard {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "bloclawd-fixtures-e2e-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create temp root");

        let guard = Self {
            home_prev: std::env::var_os("HOME"),
            codex_prev: std::env::var_os("CODEX_HOME"),
            country_prev: std::env::var_os("BLOCLAWD_COUNTRY"),
            api_prev: std::env::var_os("BLOCLAWD_API_URL"),
            root,
        };
        unsafe {
            std::env::set_var("HOME", guard.root.join("home"));
            std::env::set_var("BLOCLAWD_COUNTRY", "US");
            std::env::remove_var("CODEX_HOME");
            std::env::set_var("BLOCLAWD_API_URL", "https://127.0.0.1:9");
        }
        guard
    }

    fn home(&self) -> PathBuf {
        self.root.join("home")
    }

    fn codex_home(&self) -> PathBuf {
        self.root.join("codex-home")
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        restore_env("HOME", &self.home_prev);
        restore_env("CODEX_HOME", &self.codex_prev);
        restore_env("BLOCLAWD_COUNTRY", &self.country_prev);
        restore_env("BLOCLAWD_API_URL", &self.api_prev);
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn restore_env(key: &str, value: &Option<std::ffi::OsString>) {
    match value {
        Some(value) => unsafe {
            std::env::set_var(key, value);
        },
        None => unsafe {
            std::env::remove_var(key);
        },
    }
}

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn regen_fixtures() -> bool {
    std::env::var_os(REGEN_ENV).is_some()
}

fn write_if_regen(path: &Path, contents: &str) {
    if regen_fixtures() {
        fs::write(path, contents).expect("regenerate fixture");
    }
}

fn model_name(model: Model) -> String {
    serde_json::to_value(model)
        .expect("model serializes")
        .as_str()
        .expect("model serializes to string")
        .to_string()
}

fn token_counts_to_value(counts: HashMap<Model, TokenCounts>) -> Value {
    let mut out = Map::new();
    for (model, counts) in counts {
        out.insert(
            model_name(model),
            serde_json::to_value(counts).expect("counts serialize"),
        );
    }
    Value::Object(out)
}

fn expected_fixture_json(counts: HashMap<Model, TokenCounts>, limit_type: LimitType) -> Value {
    let mut out = Map::new();
    out.insert(
        "limit_type".into(),
        serde_json::to_value(limit_type).expect("limit type serializes"),
    );
    out.insert("tokens".into(), token_counts_to_value(counts));
    Value::Object(out)
}

fn pretty_json(value: &Value) -> String {
    let mut out = serde_json::to_string_pretty(value).expect("fixture JSON formats");
    out.push('\n');
    out
}

fn cc_events_from_fixture() -> (Vec<cc::CcEvent>, u32) {
    let text = fs::read_to_string(fixture_dir().join("cc/sample.jsonl")).expect("read cc fixture");
    let mut failures = 0;
    let mut events = Vec::new();
    for line in text.lines() {
        if serde_json::from_str::<Value>(line).is_err() {
            failures += 1;
            continue;
        }
        if let Some(event) = cc::parse_cc_line(line) {
            events.push(event);
        }
    }
    (cc::dedup_by_request_id(events), failures)
}

fn codex_events_from_fixture() -> (Vec<codex::CodexEvent>, u32) {
    let text =
        fs::read_to_string(fixture_dir().join("codex/sample.jsonl")).expect("read codex fixture");
    let lines = text.lines().map(|line| Ok(line.to_string()));
    codex::parse_codex_session(lines)
}

fn copy_cc_fixture_to_home(home: &Path) {
    let dst = home.join(".claude/projects/redacted-project/sample.jsonl");
    fs::create_dir_all(dst.parent().expect("cc fixture parent")).expect("mkdir cc fixture parent");
    fs::copy(fixture_dir().join("cc/sample.jsonl"), dst).expect("copy cc fixture");
}

fn copy_codex_fixture_to_home(codex_home: &Path) {
    let dst = codex_home.join("sessions/2026/01/01/rollout-sample.jsonl");
    fs::create_dir_all(dst.parent().expect("codex fixture parent"))
        .expect("mkdir codex fixture parent");
    fs::copy(fixture_dir().join("codex/sample.jsonl"), dst).expect("copy codex fixture");
    unsafe {
        std::env::set_var("CODEX_HOME", codex_home);
    }
}

fn args(argv: &[&str]) -> Args {
    Args::parse_from(argv)
}

fn uuid_provider(values: Vec<Uuid>) -> Box<dyn FnMut() -> Uuid> {
    let mut iter = values.into_iter();
    Box::new(move || iter.next().expect("enough deterministic event UUIDs"))
}

fn run_to_string(
    args: Args,
    group: Uuid,
    events: Vec<Uuid>,
) -> Result<(i32, String), IngestCliError> {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let code = run_inner_with_output(args, group, uuid_provider(events), &mut stdout, &mut stderr)?;
    assert!(
        String::from_utf8(stderr)
            .expect("stderr utf8")
            .contains("local-tz:"),
        "orchestration should emit local-tz diagnostic to stderr"
    );
    Ok((code, String::from_utf8(stdout).expect("stdout utf8")))
}

fn event_blocks(rendered: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let mut current: Option<String> = None;
    for line in rendered.lines() {
        if line.starts_with("--- event ") {
            if let Some(block) = current.take() {
                out.push(serde_json::from_str(&block).expect("event JSON block parses"));
            }
            current = Some(String::new());
            continue;
        }
        if let Some(block) = current.as_mut() {
            if !block.is_empty() {
                block.push('\n');
            }
            block.push_str(line);
        }
    }
    if let Some(block) = current {
        out.push(serde_json::from_str(&block).expect("event JSON block parses"));
    }
    out
}

#[test]
fn cc_fixture_parses_cleanly_with_zero_failures() {
    let (events, failures) = cc_events_from_fixture();

    assert_eq!(failures, 0);
    assert_eq!(events.len(), 2);
}

#[test]
fn cc_fixture_token_totals_match_expected() {
    let (events, failures) = cc_events_from_fixture();
    assert_eq!(failures, 0);
    let counts =
        bloclawd::aggregate::aggregate(&events, &[], WindowKind::FiveHour).expect("aggregate");
    let expected_path = fixture_dir().join("cc/sample.expected.json");
    let generated = expected_fixture_json(counts, LimitType::FiveH);
    write_if_regen(&expected_path, &pretty_json(&generated));
    let expected: Value =
        serde_json::from_str(&fs::read_to_string(expected_path).expect("read expected"))
            .expect("expected JSON parses");

    assert_eq!(generated, expected);
}

#[test]
fn cc_fixture_dryrun_snapshot_locks() {
    let _env = env_lock();
    let guard = EnvGuard::new("cc-dryrun");
    copy_cc_fixture_to_home(&guard.home());

    let (code, output) = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000001").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000001").unwrap()],
    )
    .expect("dry-run succeeds");

    assert_eq!(code, 0);
    let expected_path = fixture_dir().join("cc/sample.expected.dryrun.txt");
    write_if_regen(&expected_path, &output);
    assert_eq!(
        output,
        fs::read_to_string(expected_path).expect("read expected dryrun")
    );
}

#[test]
fn codex_fixture_parses_cleanly_with_zero_failures() {
    let (events, failures) = codex_events_from_fixture();

    assert_eq!(failures, 0);
    assert_eq!(events.len(), 2);
}

#[test]
fn codex_fixture_token_totals_match_expected() {
    let (events, failures) = codex_events_from_fixture();
    assert_eq!(failures, 0);
    let counts =
        bloclawd::aggregate::aggregate(&[], &events, WindowKind::FiveHour).expect("aggregate");
    let expected_path = fixture_dir().join("codex/sample.expected.json");
    let generated = expected_fixture_json(counts, LimitType::FiveH);
    write_if_regen(&expected_path, &pretty_json(&generated));
    let expected: Value =
        serde_json::from_str(&fs::read_to_string(expected_path).expect("read expected"))
            .expect("expected JSON parses");

    assert_eq!(generated, expected);
}

#[test]
fn codex_fixture_dryrun_snapshot_locks() {
    let _env = env_lock();
    let guard = EnvGuard::new("codex-dryrun");
    copy_codex_fixture_to_home(&guard.codex_home());

    let (code, output) = run_to_string(
        args(&[
            "bloclawd",
            "--codex",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000002").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000002").unwrap()],
    )
    .expect("dry-run succeeds");

    assert_eq!(code, 0);
    let expected_path = fixture_dir().join("codex/sample.expected.dryrun.txt");
    write_if_regen(&expected_path, &output);
    assert_eq!(
        output,
        fs::read_to_string(expected_path).expect("read expected dryrun")
    );
}

#[test]
fn tier_from_flag_writes_config_before_no_events_error() {
    let _env = env_lock();
    let guard = EnvGuard::new("tier-save");

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "pro",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000003").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000003").unwrap()],
    )
    .expect_err("empty fixture returns no events");

    assert_eq!(err, IngestCliError::NoEvents);
    let cfg = fs::read_to_string(guard.home().join(".config/bloclawd/config.toml"))
        .expect("config written");
    assert!(cfg.contains("tier = \"pro\""));
}

#[test]
fn tier_from_config_allows_absent_tier_flag() {
    let _env = env_lock();
    let guard = EnvGuard::new("tier-load");
    let config = guard.home().join(".config/bloclawd/config.toml");
    fs::create_dir_all(config.parent().unwrap()).expect("mkdir config");
    fs::write(&config, "tier = \"max20\"\n").expect("write config");

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000004").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000004").unwrap()],
    )
    .expect_err("empty fixture returns no events after loading tier");

    assert_eq!(err, IngestCliError::NoEvents);
}

#[test]
fn missing_tier_is_user_error() {
    let _env = env_lock();
    let _guard = EnvGuard::new("tier-missing");

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000005").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000005").unwrap()],
    )
    .expect_err("missing tier fails");

    assert_eq!(err.exit_code(), 1);
    assert!(err.to_string().contains("--tier"));
}

#[test]
fn codex_accepts_individual_max20_tier() {
    let _env = env_lock();
    let _guard = EnvGuard::new("codex-max20-tier");

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--codex",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000006").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000006").unwrap()],
    )
    .expect_err("empty fixture returns no events");

    assert_eq!(err, IngestCliError::NoEvents);
}

#[test]
fn week_submit_is_user_error_but_week_dry_run_is_allowed() {
    let _env = env_lock();
    let guard = EnvGuard::new("week");
    copy_cc_fixture_to_home(&guard.home());

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--week",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000007").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000007").unwrap()],
    )
    .expect_err("week submit fails");
    assert!(err.to_string().contains("--week submit not supported"));

    let (code, output) = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--week",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000008").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000008").unwrap()],
    )
    .expect("week dry-run succeeds");
    assert_eq!(code, 0);
    assert!(output.contains("bloclawd dry-run"));
}

#[test]
fn dry_run_returns_before_probe_or_network_and_event_id_is_uuidv4() {
    let _env = env_lock();
    let guard = EnvGuard::new("dryrun-no-network");
    copy_cc_fixture_to_home(&guard.home());

    let (_, output) = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000009").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000009").unwrap()],
    )
    .expect("dry-run succeeds without contacting BLOCLAWD_API_URL");

    let blocks = event_blocks(&output);
    assert_eq!(blocks.len(), 1);
    let event_id = blocks[0]["event_id"].as_str().expect("event id string");
    let event_uuid_bytes = URL_SAFE_NO_PAD.decode(event_id).expect("event id base64");
    let event_uuid = Uuid::from_slice(&event_uuid_bytes).expect("event id uuid");
    assert_eq!(event_uuid.get_version(), Some(Version::Random));
}

#[test]
fn no_events_found_is_exit_2() {
    let _env = env_lock();
    let _guard = EnvGuard::new("no-events");

    let err = run_to_string(
        args(&[
            "bloclawd",
            "--cc",
            "--tier",
            "max20",
            "--end",
            "2026-01-01T06:00:00",
            "--5h",
            "--dry-run",
        ]),
        Uuid::parse_str("10000000-0000-4000-8000-000000000010").unwrap(),
        vec![Uuid::parse_str("20000000-0000-4000-8000-000000000010").unwrap()],
    )
    .expect_err("empty fixture returns no events");

    assert_eq!(err, IngestCliError::NoEvents);
    assert_eq!(err.exit_code(), 2);
}
