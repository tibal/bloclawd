#![cfg(feature = "staging-smoke")]

// End-to-end happy-path proof for Phase 2 (D-46).
//
// GATED:
//   - cargo feature `staging-smoke` (declared in apps/worker/Cargo.toml)
//   - ignored test attribute (excluded from default cargo test)
//
// RUN:
//   BLOCLAWD_STAGING_URL='https://bloclawd-worker-staging.<account>.workers.dev' \
//   PLANETSCALE_STAGING_URL='postgres://...staging-branch...' \
//     cargo test -p bloclawd-worker --features staging-smoke -- --ignored happy_path
//
// NEVER in CI. Manual invocation by an operator after a staging deploy.
// Documented in apps/worker/README.md section "End-to-end smoke test".

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use pow::{ChallengeId, K_V1, PayloadHash};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[path = "../../../crates/event-schema/tests/fixtures.rs"]
mod event_schema_fixtures;

use event_schema_fixtures::sample_event_payload;

fn require_env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| {
        panic!(
            "{key} not set. Run via:\n  BLOCLAWD_STAGING_URL='...' PLANETSCALE_STAGING_URL='...' \\\n    cargo test -p bloclawd-worker --features staging-smoke -- --ignored happy_path"
        )
    })
}

fn tls_connector() -> tokio_postgres_rustls::MakeRustlsConnect {
    let native_certs = rustls_native_certs::load_native_certs();
    let mut root_store = rustls::RootCertStore::empty();
    let (added, _ignored) = root_store.add_parsable_certificates(native_certs.certs);
    assert!(
        added > 0,
        "native certificate store must include at least one trusted root"
    );

    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    tokio_postgres_rustls::MakeRustlsConnect::new(config)
}

#[tokio::test]
#[ignore]
async fn happy_path() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let url = require_env("BLOCLAWD_STAGING_URL")
        .trim_end_matches('/')
        .to_string();
    let pg_url = require_env("PLANETSCALE_STAGING_URL");

    let client = reqwest::Client::new();
    let challenge: serde_json::Value = client
        .get(format!("{url}/challenge"))
        .send()
        .await
        .expect("GET /challenge succeeds")
        .json()
        .await
        .expect("/challenge body is JSON");

    let cid_b64 = challenge["challenge_id"]
        .as_str()
        .expect("challenge_id field");
    let sig_b64 = challenge["sig"].as_str().expect("sig field");
    let difficulty = challenge["difficulty"].as_u64().expect("difficulty field") as u32;
    let expires_in = challenge["expires_in"].as_u64().expect("expires_in field") as u32;
    assert_eq!(difficulty, K_V1, "difficulty must be K=22");
    assert_eq!(expires_in, 60, "expires_in must be 60s");

    let payload = sample_event_payload();
    payload.validate().expect("sample payload is valid");
    let payload_value = serde_json::to_value(&payload).expect("payload serializes");
    let canonical = event_schema::canonical_bytes(&payload).expect("payload canonicalizes");
    let payload_hash_bytes: [u8; 32] = Sha256::digest(&canonical).into();
    let ph = PayloadHash(payload_hash_bytes);

    let cid_bytes_vec = URL_SAFE_NO_PAD
        .decode(cid_b64)
        .expect("cid base64url-no-pad");
    let cid_bytes: [u8; 32] = cid_bytes_vec
        .as_slice()
        .try_into()
        .expect("cid is 32 bytes");
    assert_eq!(URL_SAFE_NO_PAD.encode(cid_bytes), cid_b64);
    let cid = ChallengeId(cid_bytes);
    let deadline = Instant::now() + Duration::from_secs(30);
    let (nonce, _solved_hash) =
        pow::solve(&cid, &ph, K_V1, 0, deadline).expect("PoW solves within 30s");

    let event_id = Uuid::new_v4();
    let event_id_b64 = URL_SAFE_NO_PAD.encode(event_id.as_bytes());

    let body = serde_json::json!({
        "event_id": event_id_b64,
        "challenge_id": cid_b64,
        "sig": sig_b64,
        "nonce": URL_SAFE_NO_PAD.encode(nonce.0),
        "payload": payload_value,
    });
    let response = client
        .post(format!("{url}/event"))
        .json(&body)
        .send()
        .await
        .expect("POST /event succeeds");

    assert_eq!(response.status().as_u16(), 200, "expect 200 on happy path");
    let response_body: serde_json::Value = response.json().await.expect("/event body is JSON");
    assert_eq!(response_body["ok"], serde_json::Value::Bool(true));
    let bucket_ts_str = response_body["bucket_ts"]
        .as_str()
        .expect("bucket_ts field is a string");
    assert!(
        bucket_ts_str.len() == 20 && bucket_ts_str.ends_with('Z'),
        "bucket_ts looks like second-precision RFC 3339 UTC: {bucket_ts_str}"
    );

    let (pg_client, pg_conn) = tokio_postgres_native::connect(&pg_url, tls_connector())
        .await
        .expect("connect to PlanetScale staging branch");
    tokio::spawn(async move {
        let _ = pg_conn.await;
    });
    let row = pg_client
        .query_one(
            "SELECT bucket_ts FROM events WHERE event_id = $1",
            &[&event_id],
        )
        .await
        .expect("row visible in PlanetScale staging");
    let actual_bucket_ts: SystemTime = row.get(0);
    let actual_str = format_system_time_rfc3339(actual_bucket_ts);
    assert_eq!(
        actual_str, bucket_ts_str,
        "DB bucket_ts ({actual_str}) matches /event response bucket_ts ({bucket_ts_str})"
    );

    let response2 = client
        .post(format!("{url}/event"))
        .json(&body)
        .send()
        .await
        .expect("second POST /event succeeds");
    assert_eq!(response2.status().as_u16(), 200, "duplicate is 200 (D-47)");
    let body2: serde_json::Value = response2.json().await.expect("body");
    assert_eq!(body2["ok"], serde_json::Value::Bool(true));
    assert_eq!(
        body2["bucket_ts"].as_str(),
        Some(bucket_ts_str),
        "duplicate returns same bucket_ts"
    );
}

fn format_system_time_rfc3339(t: SystemTime) -> String {
    let secs = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, m, d, h, mi, s) = epoch_to_civil(secs);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

fn epoch_to_civil(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let s = secs as i64;
    let days = s.div_euclid(86_400);
    let tod = s.rem_euclid(86_400);
    let h = (tod / 3600) as u32;
    let mi = ((tod % 3600) / 60) as u32;
    let sec = (tod % 60) as u32;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = (if m <= 2 { y + 1 } else { y }) as i32;
    (y, m, d, h, mi, sec)
}
