#![cfg(feature = "staging-smoke")]

// Cron-state staging proof.
//
// GATED:
//   - cargo feature `staging-smoke`
//   - ignored test attribute (excluded from default cargo test)
//
// RUN:
//   PLANETSCALE_STAGING_URL='postgres://...staging-branch...' \
//     cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_state_staging
//
// NEVER in CI. Manual invocation by an operator after applying 0003_cron_state.sql.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bloclawd_worker::{CLAIM_SQL, FINISH_SQL, REVERT_SQL, SWEEP_SQL};
use tokio_postgres_native::types::Type;

fn require_env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| {
        panic!(
            "{key} not set. Run via:\n  PLANETSCALE_STAGING_URL='...' \\\n    cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_state_staging"
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
async fn cron_state_staging() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let pg_url = require_env("PLANETSCALE_STAGING_URL");
    let (client, connection) = tokio_postgres_native::connect(&pg_url, tls_connector())
        .await
        .expect("connect to PlanetScale staging branch");
    tokio::spawn(async move {
        let _ = connection.await;
    });

    client
        .batch_execute("TRUNCATE TABLE cron_state")
        .await
        .expect("cron_state table exists and truncates");

    let bucket_ts = UNIX_EPOCH + Duration::from_secs(1_700_000_000);
    client
        .execute(
            "INSERT INTO cron_state (tier, bucket_ts, state) VALUES ($1::text, $2::timestamptz, 'not_processed')",
            &[&"q15", &bucket_ts],
        )
        .await
        .expect("insert not_processed row");

    let claimed = client
        .query_typed_opt(
            CLAIM_SQL,
            &[
                (&"cron-state-smoke", Type::TEXT),
                (&"75 minutes", Type::TEXT),
            ],
        )
        .await
        .expect("claim SQL runs")
        .expect("row claimable");
    let claimed_tier: String = claimed.get(0);
    let claimed_bucket_ts: SystemTime = claimed.get(1);
    assert_eq!(claimed_tier, "q15");
    assert_eq!(claimed_bucket_ts, bucket_ts);

    assert_state(&client, bucket_ts, "processing").await;

    let second_claim = client
        .query_typed_opt(
            CLAIM_SQL,
            &[
                (&"cron-state-smoke-2", Type::TEXT),
                (&"75 minutes", Type::TEXT),
            ],
        )
        .await
        .expect("second claim SQL runs");
    assert!(
        second_claim.is_none(),
        "fresh processing row is not claimable"
    );

    client
        .query_typed(
            FINISH_SQL,
            &[(&"q15", Type::TEXT), (&bucket_ts, Type::TIMESTAMPTZ)],
        )
        .await
        .expect("finish SQL runs");
    assert_state(&client, bucket_ts, "processed").await;

    client
        .query_typed(
            REVERT_SQL,
            &[
                (&"q15", Type::TEXT),
                (&bucket_ts, Type::TIMESTAMPTZ),
                (&"manual smoke", Type::TEXT),
            ],
        )
        .await
        .expect("revert SQL runs");
    assert_state(&client, bucket_ts, "not_processed").await;
    let last_error: Option<String> = client
        .query_one(
            "SELECT last_error FROM cron_state WHERE tier = 'q15' AND bucket_ts = $1::timestamptz",
            &[&bucket_ts],
        )
        .await
        .expect("last_error row")
        .get(0);
    assert_eq!(last_error.as_deref(), Some("manual smoke"));

    client
        .execute(
            "UPDATE cron_state SET state = 'processing', claimed_at = now() - interval '2 hours', worker_id = 'stale' WHERE tier = 'q15' AND bucket_ts = $1::timestamptz",
            &[&bucket_ts],
        )
        .await
        .expect("backdate processing row");

    let reset = client
        .query_typed_one(SWEEP_SQL, &[(&"75 minutes", Type::TEXT)])
        .await
        .expect("sweep SQL runs");
    let reset_count: i64 = reset.get(0);
    assert_eq!(reset_count, 1);
    assert_state(&client, bucket_ts, "not_processed").await;

    let metadata_row = client
        .query_one(
            "SELECT claimed_at, worker_id FROM cron_state WHERE tier = 'q15' AND bucket_ts = $1::timestamptz",
            &[&bucket_ts],
        )
        .await
        .expect("metadata row");
    let claimed_at: Option<SystemTime> = metadata_row.get(0);
    let worker_id: Option<String> = metadata_row.get(1);
    assert!(claimed_at.is_none());
    assert!(worker_id.is_none());
}

async fn assert_state(client: &tokio_postgres_native::Client, bucket_ts: SystemTime, state: &str) {
    let row = client
        .query_one(
            "SELECT state FROM cron_state WHERE tier = 'q15' AND bucket_ts = $1::timestamptz",
            &[&bucket_ts],
        )
        .await
        .expect("state row");
    let actual: String = row.get(0);
    assert_eq!(actual, state);
}
