use anyhow::{Context, Result, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use bloclawd_pow::{ChallengeId, Hash, Nonce, PayloadHash, leading_zero_bits, pow_hash, solve};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

mod anonymize_session;

const FIXTURE_PATH: &str = "spec/pow-fixtures.json";

#[derive(Clone, Copy)]
enum ChallengeIdPattern {
    AllZero,
    AllFf,
    Deterministic(u8),
}

#[derive(Clone, Copy)]
enum NonceStrategy {
    Fixed(u64),
    SolveAt { k: u32, start: u64 },
}

struct Seed {
    name: &'static str,
    payload: Value,
    challenge_id_pattern: ChallengeIdPattern,
    nonce_strategy: NonceStrategy,
}

#[derive(Serialize)]
struct Vector {
    name: String,
    challenge_id_b64: String,
    payload_canonical_b64: String,
    payload_hash_b64: String,
    nonce_b64: String,
    expected_hash_b64: String,
    leading_zero_bits: u32,
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        usage();
        return Ok(());
    };

    match cmd.as_str() {
        "gen-fixtures" => {
            let check = args.any(|arg| arg == "--check");
            gen_fixtures(check)
        }
        "gen-canonical-fixture" => {
            let input = args.next();
            if matches!(input.as_deref(), Some("--help" | "-h")) {
                usage();
                return Ok(());
            }
            let input = input.ok_or_else(|| anyhow::anyhow!("input json path required"))?;
            let output = args
                .next()
                .ok_or_else(|| anyhow::anyhow!("output bytes path required"))?;
            if let Some(extra) = args.next() {
                bail!("unexpected gen-canonical-fixture arg `{extra}`");
            }
            gen_canonical_fixture(Path::new(&input), Path::new(&output))
        }
        "anonymize-session" => {
            let mut harness = None;
            let mut input = None;
            let mut output = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--harness" => harness = args.next(),
                    "--input" => input = args.next().map(std::path::PathBuf::from),
                    "--output" => output = args.next().map(std::path::PathBuf::from),
                    other => bail!("unknown anonymize-session flag `{other}`"),
                }
            }
            let harness = harness.ok_or_else(|| anyhow::anyhow!("--harness required"))?;
            let input = input.ok_or_else(|| anyhow::anyhow!("--input required"))?;
            let output = output.ok_or_else(|| anyhow::anyhow!("--output required"))?;
            anonymize_session::run(&harness, &input, &output)
        }
        "--help" | "-h" | "help" => {
            usage();
            Ok(())
        }
        other => bail!("unknown command `{other}`"),
    }
}

fn usage() {
    eprintln!("usage:");
    eprintln!("  cargo run -p xtask -- gen-fixtures");
    eprintln!("  cargo run -p xtask -- gen-fixtures --check");
    eprintln!("  cargo run -p xtask -- gen-canonical-fixture <input.json> <output.bytes.txt>");
    eprintln!(
        "  cargo run -p xtask -- anonymize-session --harness <cc|codex> --input <path> --output <path>"
    );
}

fn gen_canonical_fixture(input: &Path, output: &Path) -> Result<()> {
    let file = fs::File::open(input).with_context(|| format!("open {}", input.display()))?;
    let raw: Value =
        serde_json::from_reader(file).with_context(|| format!("parse {}", input.display()))?;
    let payload = raw
        .get("payload")
        .ok_or_else(|| anyhow::anyhow!("input json must have top-level `payload` field"))?;
    let typed: bloclawd_schema::EventPayload =
        serde_json::from_value(payload.clone()).context("deserialize payload as EventPayload")?;
    let bytes = bloclawd_schema::canonical_bytes(&typed).context("canonicalize EventPayload")?;
    let hex_encoded = hex::encode(bytes);

    if let Some(parent) = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    fs::write(output, hex_encoded).with_context(|| format!("write {}", output.display()))?;
    println!("wrote {}", output.display());
    Ok(())
}

fn gen_fixtures(check: bool) -> Result<()> {
    let rendered = render_vectors()?;
    if check {
        let existing = fs::read_to_string(FIXTURE_PATH)
            .with_context(|| format!("read committed {FIXTURE_PATH}"))?;
        if existing == rendered {
            println!("OK");
            return Ok(());
        }
        eprintln!("fixture drift detected in {FIXTURE_PATH}");
        emit_line_diff(&existing, &rendered);
        bail!("{FIXTURE_PATH} differs from deterministic xtask output");
    }

    if let Some(parent) = Path::new(FIXTURE_PATH).parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    fs::write(FIXTURE_PATH, rendered).with_context(|| format!("write {FIXTURE_PATH}"))?;
    println!("wrote {FIXTURE_PATH}");
    Ok(())
}

fn render_vectors() -> Result<String> {
    let vectors = seeds()
        .into_iter()
        .map(vector_from_seed)
        .collect::<Result<Vec<_>>>()?;
    let mut rendered = serde_json::to_string_pretty(&vectors)?;
    rendered.push('\n');
    Ok(rendered)
}

fn seeds() -> Vec<Seed> {
    vec![
        Seed {
            name: "k0-trivial",
            payload: json!({}),
            challenge_id_pattern: ChallengeIdPattern::AllZero,
            nonce_strategy: NonceStrategy::Fixed(0),
        },
        Seed {
            name: "k1-trivial",
            payload: json!({}),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(1),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
        Seed {
            name: "k22-empty-payload",
            payload: json!({}),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(22),
            nonce_strategy: NonceStrategy::SolveAt {
                k: 22,
                start: 1_948_000,
            },
        },
        Seed {
            name: "k23-empty-payload",
            payload: json!({}),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(23),
            nonce_strategy: NonceStrategy::SolveAt {
                k: 23,
                start: 12_769_000,
            },
        },
        Seed {
            name: "k0-all-zero-challenge",
            payload: json!({ "v": 1, "x": 1 }),
            challenge_id_pattern: ChallengeIdPattern::AllZero,
            nonce_strategy: NonceStrategy::Fixed(0),
        },
        Seed {
            name: "k0-all-ff-challenge",
            payload: json!({ "v": 1, "x": 1 }),
            challenge_id_pattern: ChallengeIdPattern::AllFf,
            nonce_strategy: NonceStrategy::Fixed(0),
        },
        Seed {
            name: "k1-unicode-nfc",
            payload: json!({ "k": "café" }),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(7),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
        Seed {
            name: "k1-key-ordering",
            payload: json!({ "b": 2, "a": 1 }),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(8),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
        Seed {
            name: "k1-number-formatting",
            payload: json!({ "k": 1.0 }),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(9),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
        Seed {
            name: "k1-realistic-payload",
            payload: json!({
                "v": 1,
                "model": "claude-sonnet-4-5",
                "tier": "max20",
                "harness": "claude-code",
                "region": "NA",
                "tokens": {
                    "input_5min": 1234,
                    "output_5min": 2345,
                    "cached_read_5min": 0,
                    "cached_write_5min": 0,
                    "input_5h": 12345,
                    "output_5h": 23456,
                    "cached_read_5h": 1000,
                    "cached_write_5h": 500
                }
            }),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(10),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
        Seed {
            name: "k1-max-size-payload",
            payload: json!({ "blob": "a".repeat(3500) }),
            challenge_id_pattern: ChallengeIdPattern::Deterministic(11),
            nonce_strategy: NonceStrategy::SolveAt { k: 1, start: 0 },
        },
    ]
}

fn vector_from_seed(seed: Seed) -> Result<Vector> {
    let cid = challenge_id(seed.challenge_id_pattern);
    let canonical = serde_jcs::to_vec(&seed.payload)
        .with_context(|| format!("JCS canonicalize {}", seed.name))?;
    let ph: [u8; 32] = Sha256::digest(&canonical).into();
    let nonce = match seed.nonce_strategy {
        NonceStrategy::Fixed(n) => Nonce(n.to_be_bytes()),
        NonceStrategy::SolveAt { k, start } => {
            solve(
                &ChallengeId(cid),
                &PayloadHash(ph),
                k,
                start,
                Instant::now() + Duration::from_secs(30),
            )
            .with_context(|| format!("solve {}", seed.name))?
            .0
        }
    };
    let expected = pow_hash(&ChallengeId(cid), &PayloadHash(ph), &nonce);

    Ok(Vector {
        name: seed.name.to_string(),
        challenge_id_b64: b64u(&cid),
        payload_canonical_b64: b64u(&canonical),
        payload_hash_b64: b64u(&ph),
        nonce_b64: b64u(&nonce.0),
        expected_hash_b64: b64u(&expected.0),
        leading_zero_bits: leading_zero_bits(&Hash(expected.0)),
    })
}

fn challenge_id(pattern: ChallengeIdPattern) -> [u8; 32] {
    match pattern {
        ChallengeIdPattern::AllZero => [0_u8; 32],
        ChallengeIdPattern::AllFf => [0xff_u8; 32],
        ChallengeIdPattern::Deterministic(seed) => {
            let input = format!("bloclawd-fixture-{seed}");
            Sha256::digest(input.as_bytes()).into()
        }
    }
}

fn b64u(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn emit_line_diff(expected: &str, actual: &str) {
    eprintln!("--- expected");
    eprintln!("+++ actual");
    let expected_lines: Vec<_> = expected.lines().collect();
    let actual_lines: Vec<_> = actual.lines().collect();
    let max = expected_lines.len().max(actual_lines.len());
    for idx in 0..max {
        match (expected_lines.get(idx), actual_lines.get(idx)) {
            (Some(left), Some(right)) if left == right => {}
            (Some(left), Some(right)) => {
                eprintln!("-{left}");
                eprintln!("+{right}");
            }
            (Some(left), None) => eprintln!("-{left}"),
            (None, Some(right)) => eprintln!("+{right}"),
            (None, None) => {}
        }
    }
}
