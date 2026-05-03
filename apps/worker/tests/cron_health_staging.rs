#![cfg(feature = "staging-smoke")]

// Cron-health staging proof.
//
// GATED:
//   - cargo feature `staging-smoke`
//   - ignored test attribute (excluded from default cargo test)
//
// RUN:
//   PLANETSCALE_STAGING_URL='postgres://...staging-branch...' \
//     cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_health_staging
//
// NEVER in CI. Manual invocation by an operator after applying events migrations.

use std::time::{Duration, UNIX_EPOCH};

use bloclawd_worker::{COUNT_DISTINCT_CONTRIBUTORS_30D_SQL, COUNT_LIFETIME_EVENTS_SQL};

fn require_env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| {
        panic!(
            "{key} not set. Run via:\n  PLANETSCALE_STAGING_URL='...' \\\n    cargo test -p bloclawd-worker --features staging-smoke --locked -- --ignored cron_health_staging"
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
async fn cron_health_staging() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let pg_url = require_env("PLANETSCALE_STAGING_URL");
    let (client, connection) = tokio_postgres_native::connect(&pg_url, tls_connector())
        .await
        .expect("connect to PlanetScale staging branch");
    tokio::spawn(async move {
        let _ = connection.await;
    });

    client
        .batch_execute(
            r#"
            CREATE TEMP TABLE events (
                received_at timestamptz NOT NULL,
                submission_group_id uuid NOT NULL
            );
            "#,
        )
        .await
        .expect("create temp events table");

    for i in 0..17_u128 {
        let id = uuid::Uuid::from_u128(i + 1);
        let received_at = UNIX_EPOCH + Duration::from_secs(1_777_731_300);
        client
            .execute(
                "INSERT INTO events (received_at, submission_group_id) VALUES ($1::timestamptz, $2::uuid), ($1::timestamptz, $2::uuid)",
                &[&received_at, &id],
            )
            .await
            .expect("insert duplicated contributor rows");
    }

    let total: i64 = client
        .query_one(COUNT_LIFETIME_EVENTS_SQL, &[])
        .await
        .expect("lifetime count SQL runs")
        .get(0);
    assert_eq!(total, 34);

    let distinct: i64 = client
        .query_one(COUNT_DISTINCT_CONTRIBUTORS_30D_SQL, &[])
        .await
        .expect("distinct contributor SQL runs")
        .get(0);
    assert_eq!(distinct, 17);
}
