#![cfg(feature = "staging-smoke")]

//! Cron -> R2 staging proof.
//!
//! GATED:
//!   - cargo feature `staging-smoke`
//!   - ignored test attribute (excluded from default cargo test)
//!
//! RUN:
//!   PLANETSCALE_STAGING_URL='postgres://...staging-branch-direct-url...' \
//!   STAGING_R2_BASE_URL='https://bloclawd-reports-staging.<account-hash>.r2.dev' \
//!     cargo test -p bloclawd-worker --features staging-smoke --locked --test cron_e2e_staging -- --ignored --nocapture
//!
//! NEVER in CI. Manual invocation by an operator after applying aggregation
//! migrations, provisioning R2, and deploying the staging worker.

use std::time::Duration;

use uuid::Uuid;

fn require_env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| {
        panic!(
            "{key} not set. Run via:\n  PLANETSCALE_STAGING_URL='...' STAGING_R2_BASE_URL='...' \\\n    cargo test -p bloclawd-worker --features staging-smoke --locked --test cron_e2e_staging -- --ignored --nocapture"
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
async fn cron_e2e_staging() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let pg_url = require_env("PLANETSCALE_STAGING_URL");
    let r2_base = require_env("STAGING_R2_BASE_URL")
        .trim_end_matches('/')
        .to_string();

    let (client, connection) = tokio_postgres_native::connect(&pg_url, tls_connector())
        .await
        .expect("connect to PlanetScale staging branch");
    tokio::spawn(async move {
        let _ = connection.await;
    });

    client
        .batch_execute(
            r#"
            DELETE FROM events;
            DELETE FROM cron_state;
            "#,
        )
        .await
        .expect("delete staging events and cron_state");

    for idx in 0..30_u64 {
        let event_id = Uuid::new_v4();
        let submission_group_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "v": 1,
            "model": "claude-sonnet-4-5",
            "tier": "max20",
            "harness": "claude-code",
            "region": "EU",
            "tokens": {
                "input_5min": 1000 + idx,
                "output_5min": 500 + idx,
                "cached_read_5min": 100 + idx,
                "cached_write_5min": 50 + idx,
                "input_5h": 5000 + idx,
                "output_5h": 2500 + idx,
                "cached_read_5h": 500 + idx,
                "cached_write_5h": 250 + idx
            }
        });
        let payload_json = payload.to_string();

        client
            .execute(
                r#"
                INSERT INTO events (
                    event_id,
                    submission_group_id,
                    bucket_ts,
                    payload,
                    model,
                    tier,
                    harness,
                    region,
                    limit_type
                )
                VALUES (
                    $1::uuid,
                    $2::uuid,
                    date_bin('15 minutes', now() - interval '1 hour', '1970-01-01 00:00:00+00'::timestamptz),
                    $3::text::jsonb,
                    'claude-sonnet-4-5',
                    'max20',
                    'claude-code',
                    'EU',
                    '5h'
                )
                "#,
                &[&event_id, &submission_group_id, &payload_json],
            )
            .await
            .expect("insert synthetic staging event");
    }

    eprintln!("OPERATOR ACTION REQUIRED:");
    eprintln!("  Wait for the deployed staging cron trigger to run.");
    eprintln!("  Staging is configured as */15 * * * * UTC.");
    eprintln!("Press Enter after the next quarter-hour tick has passed.");
    let mut line = String::new();
    std::io::stdin()
        .read_line(&mut line)
        .expect("read operator confirmation");

    let http = reqwest::Client::new();
    let manifest_url = format!("{r2_base}/reports/v1/manifest.json");
    eprintln!("Operator confirmation received; polling {manifest_url}");
    let manifest = poll_manifest(&http, &manifest_url).await;
    let first_path = manifest["tiers"]["q15"]
        .as_array()
        .and_then(|paths| paths.first())
        .and_then(|path| path.as_str())
        .expect("manifest q15 path");
    let bucket_url = format!("{r2_base}/reports/v1/q15/{first_path}");
    eprintln!("Fetching emitted q15 bucket {bucket_url}");
    let envelope: serde_json::Value = http
        .get(&bucket_url)
        .send()
        .await
        .expect("fetch emitted q15 bucket")
        .error_for_status()
        .expect("q15 bucket success status")
        .json()
        .await
        .expect("q15 bucket JSON");

    eprintln!("Validating emitted q15 bucket envelope");
    assert_eq!(envelope["schema_version"], "v1");
    assert_eq!(envelope["bin_edges"].as_array().unwrap().len(), 19);
    let cells = envelope["cells"].as_array().expect("cells array");
    let cell = cells
        .iter()
        .find(|cell| {
            cell["tier"] == "max20"
                && cell["harness"] == "claude-code"
                && cell["region"] == "EU"
                && cell["limit_type"] == "5h"
        })
        .expect("max20 claude-code EU 5h cohort cell present");
    assert_eq!(cell["n_submissions"], 30);
    assert!(cell["unified_cost"].get("Mean").is_some());

    let raw = serde_json::to_string(&envelope).unwrap();
    for forbidden in ["submission_group_id", "event_id", "nonce", "tz_offset"] {
        assert!(
            !raw.contains(forbidden),
            "public R2 envelope contained {forbidden}"
        );
    }
    eprintln!("Staging cron proof passed");
}

async fn poll_manifest(client: &reqwest::Client, manifest_url: &str) -> serde_json::Value {
    for attempt in 1..=30 {
        match client.get(manifest_url).send().await {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    eprintln!("manifest poll {attempt}/30 status={status}");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }

                let body = response
                    .json::<serde_json::Value>()
                    .await
                    .expect("manifest JSON");
                let q15_paths = body["tiers"]["q15"]
                    .as_array()
                    .map_or(0, |paths| paths.len());
                eprintln!("manifest poll {attempt}/30 status={status} q15_paths={q15_paths}");
                if q15_paths > 0 {
                    eprintln!("manifest ready after {attempt} poll attempts");
                    return body;
                }
            }
            Err(e) => {
                eprintln!("manifest poll {attempt}/30 request failed: {e}");
            }
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    panic!("manifest never populated with a q15 bucket after 30 tries");
}
