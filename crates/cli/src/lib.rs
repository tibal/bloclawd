//! bloclawd CLI library, consumed by the bin entry and in-process tests.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::Utc;
use event_schema::{
    EventPayload, Harness as SchemaHarness, Region, SubmittedEvent, Tier, TokenCounts,
};
use std::io::{self, BufRead, Write};
use uuid::Uuid;

use crate::aggregate::WindowKind;
use crate::probe::{Harness as ProbeHarness, ProbeOutcome};

pub mod aggregate;
pub mod api;
pub mod canonical;
pub mod cli;
pub mod config;
pub mod min_version;
pub mod parsers;
pub mod probe;
pub mod probe_sig;
pub mod region;
pub mod render;
pub mod solve;
pub mod submit;
pub mod window;
pub mod wire_error;

pub use cli::{Args, CliTier};
pub use wire_error::IngestCliError;

/// Production entry: clap-parsed args -> orchestration with fresh UUIDs.
pub fn run(args: Args) -> Result<i32, IngestCliError> {
    let group_uuid = Uuid::new_v4();
    let event_uuid_provider: Box<dyn FnMut() -> Uuid> = Box::new(Uuid::new_v4);
    run_inner(args, group_uuid, event_uuid_provider)
}

/// Testable entry: deterministic submission group id and per-event id provider.
pub fn run_inner(
    args: Args,
    group_uuid: Uuid,
    event_uuid_provider: Box<dyn FnMut() -> Uuid>,
) -> Result<i32, IngestCliError> {
    let mut stdout = io::stdout().lock();
    let mut stderr = io::stderr().lock();
    run_inner_with_output(
        args,
        group_uuid,
        event_uuid_provider,
        &mut stdout,
        &mut stderr,
    )
}

/// Writer-backed orchestration entry for in-process tests.
pub fn run_inner_with_output<W: Write, E: Write>(
    args: Args,
    group_uuid: Uuid,
    mut event_uuid_provider: Box<dyn FnMut() -> Uuid>,
    stdout: &mut W,
    stderr: &mut E,
) -> Result<i32, IngestCliError> {
    if !args.cc && !args.codex {
        return Err(IngestCliError::UserError(
            "specify --cc or --codex (which harness to read)".into(),
        ));
    }

    if args.week && !args.dry_run {
        return Err(IngestCliError::UserError(
            "--week submit not supported in v1; use --dry-run only".into(),
        ));
    }

    let (tier, _) = resolve_tier(&args, stderr)?;

    let harness_schema = if args.cc {
        SchemaHarness::ClaudeCode
    } else {
        SchemaHarness::Codex
    };
    let harness_probe = if args.cc {
        ProbeHarness::ClaudeCode
    } else {
        ProbeHarness::Codex
    };

    let end_utc = window::parse_end(&args.end).map_err(IngestCliError::UserError)?;
    let (start_utc, end_utc) = window::window(end_utc, args.five_hour, args.week);
    writeln!(stderr, "local-tz: {}", chrono::Local::now().offset())
        .map_err(|_| IngestCliError::ServerUnavailable)?;

    let region: Region =
        region::resolve_region().map_err(|e| IngestCliError::UserError(e.to_string()))?;
    let home = std::env::var_os("HOME")
        .ok_or_else(|| IngestCliError::UserError("HOME env var not set".into()))?;
    let home = std::path::PathBuf::from(home);

    let (cc_events, cc_failures) = if args.cc {
        parsers::cc::walk(&home.join(".claude"), start_utc, end_utc)
            .map_err(|e| IngestCliError::UserError(format!("CC walk: {e}")))?
    } else {
        (Vec::new(), 0)
    };
    let (codex_events, codex_failures) = if args.codex {
        let codex_home = std::env::var_os("CODEX_HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".codex"));
        parsers::codex::walk(&codex_home, start_utc, end_utc)
            .map_err(|e| IngestCliError::UserError(format!("Codex walk: {e}")))?
    } else {
        (Vec::new(), 0)
    };

    let by_model = aggregate::aggregate(&cc_events, &codex_events, WindowKind::FiveHour)
        .map_err(|e| IngestCliError::UserError(e.to_string()))?;
    if by_model.is_empty() {
        return Err(IngestCliError::NoEvents);
    }

    let mut events = build_submitted_events(
        by_model,
        harness_schema,
        tier,
        region,
        group_uuid,
        &mut event_uuid_provider,
    )?;

    if args.json && args.dry_run {
        let json = render::render_json(
            &group_uuid.to_string(),
            &Utc::now().to_rfc3339(),
            (cc_failures, codex_failures),
            &events,
            &[],
            0,
        )
        .map_err(|_| IngestCliError::ServerUnavailable)?;
        writeln!(stdout, "{json}").map_err(|_| IngestCliError::ServerUnavailable)?;
        return Ok(0);
    }

    if !args.json {
        let dry_run = render::render_dry_run(&group_uuid.to_string(), &events)
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        write!(stdout, "{dry_run}").map_err(|_| IngestCliError::ServerUnavailable)?;
    }

    if args.dry_run {
        return Ok(0);
    }

    if !args.yes {
        write!(stderr, "\nSubmit {} event(s)? [y/N]: ", events.len())
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        stderr
            .flush()
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        let mut input = String::new();
        io::stdin()
            .lock()
            .read_line(&mut input)
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        if !input.trim().eq_ignore_ascii_case("y") {
            writeln!(stderr, "aborted").map_err(|_| IngestCliError::ServerUnavailable)?;
            return Ok(0);
        }
    }

    let client = submit::http_client().map_err(|_| IngestCliError::ServerUnavailable)?;
    let event_count = events.len();
    for (idx, event) in events.iter_mut().enumerate() {
        writeln!(stderr, "solving {}/{}", idx + 1, event_count)
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        let challenge = submit::fetch_challenge(&client)?;
        event.challenge_id = challenge.challenge_id_b64;
        event.sig = challenge.sig_b64;
        let (nonce, _payload_hash) =
            solve::solve_for_payload(&event.payload, &challenge.challenge_id)?;
        event.nonce = URL_SAFE_NO_PAD.encode(nonce.0);
    }

    writeln!(stderr, "probing provider rate-limit state")
        .map_err(|_| IngestCliError::ServerUnavailable)?;
    match probe::probe_blocking(harness_probe) {
        ProbeOutcome::RateLimited => {}
        ProbeOutcome::Converge => return Err(IngestCliError::ServerUnavailable),
    }

    let mut responses: Vec<(String, u16, serde_json::Value)> = Vec::new();
    let mut overall_exit = 0;
    for (idx, event) in events.iter().enumerate() {
        writeln!(stderr, "submitting {}/{}", idx + 1, event_count)
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        let model = model_name(event.payload.model);
        match submit::post_event(&client, event) {
            Ok(ok) => responses.push((
                model,
                200,
                serde_json::json!({ "ok": true, "bucket_ts": ok.bucket_ts }),
            )),
            Err(err) => {
                if overall_exit == 0 {
                    overall_exit = err.exit_code();
                }
                responses.push((model, 0, serde_json::json!({ "error": err.to_string() })));
            }
        }
    }

    if args.json {
        let json = render::render_json(
            &group_uuid.to_string(),
            &Utc::now().to_rfc3339(),
            (cc_failures, codex_failures),
            &events,
            &responses,
            overall_exit,
        )
        .map_err(|_| IngestCliError::ServerUnavailable)?;
        writeln!(stdout, "{json}").map_err(|_| IngestCliError::ServerUnavailable)?;
    } else {
        for (model, status, _body) in &responses {
            writeln!(stderr, "submitted {model}: status={status}")
                .map_err(|_| IngestCliError::ServerUnavailable)?;
        }
        if cc_failures > 0 || codex_failures > 0 {
            writeln!(
                stderr,
                "parsed events; {cc_failures} CC + {codex_failures} Codex parse failures"
            )
            .map_err(|_| IngestCliError::ServerUnavailable)?;
        }
    }

    Ok(overall_exit)
}

fn resolve_tier<E: Write>(args: &Args, stderr: &mut E) -> Result<(Tier, String), IngestCliError> {
    let tier_str = match args.tier {
        Some(cli_tier) => {
            let tier = Tier::from(cli_tier);
            let tier_str = tier_wire_name(tier).to_string();
            if let Err(err) = config::save_tier(&tier_str) {
                writeln!(stderr, "warning: could not persist tier: {err}")
                    .map_err(|_| IngestCliError::ServerUnavailable)?;
            }
            tier_str
        }
        None => match config::load_tier() {
            Ok(Some(tier)) => {
                let path = config::config_path()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| "<unknown>".to_string());
                writeln!(stderr, "loaded tier={tier} from {path}")
                    .map_err(|_| IngestCliError::ServerUnavailable)?;
                tier
            }
            Ok(None) => {
                return Err(IngestCliError::UserError(
                    "--tier <pro|max5|max20> is required (no config found)".into(),
                ));
            }
            Err(err) => return Err(IngestCliError::UserError(err.to_string())),
        },
    };

    let tier = serde_json::from_value::<Tier>(serde_json::Value::String(tier_str.clone()))
        .map_err(|_| IngestCliError::UserError(format!("invalid tier: {tier_str}")))?;
    Ok((tier, tier_str))
}

fn build_submitted_events(
    by_model: std::collections::HashMap<event_schema::Model, TokenCounts>,
    harness: SchemaHarness,
    tier: Tier,
    region: Region,
    group_uuid: Uuid,
    event_uuid_provider: &mut Box<dyn FnMut() -> Uuid>,
) -> Result<Vec<SubmittedEvent>, IngestCliError> {
    let mut rows: Vec<_> = by_model.into_iter().collect();
    rows.sort_by(|(left, _), (right, _)| model_name(*left).cmp(&model_name(*right)));
    let submission_group_id = URL_SAFE_NO_PAD.encode(group_uuid.as_bytes());
    let mut out = Vec::with_capacity(rows.len());

    for (model, tokens) in rows {
        let payload = EventPayload {
            v: 1,
            model,
            tier,
            harness,
            region,
            tokens,
        };
        payload
            .validate()
            .map_err(|e| IngestCliError::UserError(format!("payload invalid: {e}")))?;
        let event_uuid = event_uuid_provider();
        out.push(SubmittedEvent {
            event_id: URL_SAFE_NO_PAD.encode(event_uuid.as_bytes()),
            challenge_id: String::new(),
            sig: String::new(),
            nonce: String::new(),
            submission_group_id: submission_group_id.clone(),
            payload,
        });
    }

    Ok(out)
}

fn tier_wire_name(tier: Tier) -> &'static str {
    match tier {
        Tier::Pro => "pro",
        Tier::Max5 => "max5",
        Tier::Max20 => "max20",
    }
}

fn model_name(model: event_schema::Model) -> String {
    serde_json::to_value(model)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "?".to_string())
}

#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
