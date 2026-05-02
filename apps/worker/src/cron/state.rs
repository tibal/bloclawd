//! cron_state work-queue helpers (AGGR-17/18, D-85).
//!
//! Each helper opens its own per-call Hyperdrive connection per
//! research/PITFALLS.md Pitfall 5 (Worker I/O Lifecycle Leaks);
//! NO shared client across calls.
//!
//! Logging boundary: emit COUNTS only - never log tier value,
//! bucket_ts value, worker_id, or last_error content. The pow.yml
//! grep gate covers this surface.
#![allow(dead_code)]

use std::str::FromStr;
use std::time::SystemTime;

use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use tokio_postgres::types::Type;
use worker::{Env, Hyperdrive, Result, console_log};

pub const STALE_CLAIM_MULT: i64 = 5; // tunable post-staging-UAT

fn tier_interval(tier: &str) -> &'static str {
    match tier {
        "q15" => "15 minutes",
        "h1" => "1 hour",
        "d1" => "1 day",
        _ => "15 minutes",
    }
}

pub const EAGER_INSERT_SQL: &str = r#"
    WITH inserted AS (
        INSERT INTO cron_state (tier, bucket_ts, state)
        SELECT $1::text, generate_series(
            COALESCE((SELECT MAX(bucket_ts) FROM cron_state WHERE tier = $1::text),
                     date_bin($2::interval, now() - $4::interval, '1970-01-01 00:00:00+00'::timestamptz)),
            date_bin($2::interval, now() - $3::interval, '1970-01-01 00:00:00+00'::timestamptz),
            $2::interval
        ), 'not_processed'
        ON CONFLICT (tier, bucket_ts) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::int8 FROM inserted
"#;

pub const CLAIM_SQL: &str = r#"
    UPDATE cron_state
    SET state = 'processing', claimed_at = now(), worker_id = $1::text
    WHERE (tier, bucket_ts) = (
        SELECT tier, bucket_ts FROM cron_state candidate
        WHERE state = 'not_processed'
           OR (state = 'processing' AND claimed_at < now() - $2::interval)
        ORDER BY
            EXISTS (
                SELECT 1 FROM events
                WHERE events.bucket_ts >= candidate.bucket_ts
                  AND events.bucket_ts < candidate.bucket_ts + CASE candidate.tier
                      WHEN 'q15' THEN interval '15 minutes'
                      WHEN 'h1' THEN interval '1 hour'
                      WHEN 'd1' THEN interval '1 day'
                      ELSE interval '15 minutes'
                  END
                LIMIT 1
            ) DESC,
            CASE candidate.tier
                WHEN 'q15' THEN 0
                WHEN 'h1' THEN 1
                WHEN 'd1' THEN 2
                ELSE 3
            END,
            candidate.bucket_ts DESC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING tier, bucket_ts
"#;

pub const FINISH_SQL: &str = r#"
    UPDATE cron_state SET state = 'processed', finished_at = now()
    WHERE tier = $1::text AND bucket_ts = $2::timestamptz
"#;

pub const REVERT_SQL: &str = r#"
    UPDATE cron_state
    SET state = 'not_processed', last_error = $3::text, claimed_at = NULL, worker_id = NULL
    WHERE tier = $1::text AND bucket_ts = $2::timestamptz
"#;

pub const SWEEP_SQL: &str = r#"
    WITH reset AS (
        UPDATE cron_state
        SET state = 'not_processed', claimed_at = NULL, worker_id = NULL
        WHERE state = 'processing' AND claimed_at < now() - $1::interval
        RETURNING 1
    )
    SELECT count(*)::int8 FROM reset
"#;

async fn open_client(env: &Env) -> Result<tokio_postgres::Client> {
    let hyperdrive = env.get_binding::<Hyperdrive>("DB")?;
    let conn_string = hyperdrive.connection_string();
    let socket = hyperdrive.connect()?;
    let config = PgConfig::from_str(&conn_string)
        .map_err(|e| worker::Error::RustError(format!("pg config: {e}")))?;
    let (client, connection) = config
        .connect_raw(socket, NoTls)
        .await
        .map_err(|e| worker::Error::RustError(format!("pg connect: {e}")))?;
    wasm_bindgen_futures::spawn_local(async move {
        if connection.await.is_err() {
            console_log!("pg connection task ended");
        }
    });
    Ok(client)
}

pub async fn eager_fill(env: &Env, tier: &str, lateness_min: i64) -> Result<u64> {
    let client = open_client(env).await?;
    let interval_str = tier_interval(tier);
    let lookback_days: i64 = match tier {
        "q15" => 7,
        "h1" => 30,
        _ => 365,
    };
    let lookback_str = format!("{} days", lookback_days);
    let lateness_str = format!("{} minutes", lateness_min);

    let row = client
        .query_typed_one(
            EAGER_INSERT_SQL,
            &[
                (&tier, Type::TEXT),
                (&interval_str, Type::TEXT),
                (&lateness_str, Type::TEXT),
                (&lookback_str, Type::TEXT),
            ],
        )
        .await
        .map_err(|e| worker::Error::RustError(format!("eager_fill: {e}")))?;
    let n: i64 = row.get(0);
    console_log!("cron::state::eager_fill inserted={}", n);
    drop(client);
    Ok(n as u64)
}

pub async fn claim_one(
    env: &Env,
    worker_id: &str,
    stale_threshold: &str,
) -> Result<Option<(String, SystemTime)>> {
    let client = open_client(env).await?;
    let row_opt = client
        .query_typed_opt(
            CLAIM_SQL,
            &[(&worker_id, Type::TEXT), (&stale_threshold, Type::TEXT)],
        )
        .await
        .map_err(|e| worker::Error::RustError(format!("claim_one: {e}")))?;
    let result = row_opt.map(|row| {
        let tier: String = row.get(0);
        let bucket_ts: SystemTime = row.get(1);
        (tier, bucket_ts)
    });
    console_log!("cron::state::claim_one claimed={}", result.is_some());
    drop(client);
    Ok(result)
}

pub async fn mark_processed(env: &Env, tier: &str, bucket_ts: SystemTime) -> Result<()> {
    let client = open_client(env).await?;
    client
        .query_typed(
            FINISH_SQL,
            &[(&tier, Type::TEXT), (&bucket_ts, Type::TIMESTAMPTZ)],
        )
        .await
        .map_err(|e| worker::Error::RustError(format!("mark_processed: {e}")))?;
    console_log!("cron::state::mark_processed");
    drop(client);
    Ok(())
}

pub async fn revert(env: &Env, tier: &str, bucket_ts: SystemTime, last_error: &str) -> Result<()> {
    let truncated: String = last_error.chars().take(500).collect();
    let client = open_client(env).await?;
    client
        .query_typed(
            REVERT_SQL,
            &[
                (&tier, Type::TEXT),
                (&bucket_ts, Type::TIMESTAMPTZ),
                (&truncated, Type::TEXT),
            ],
        )
        .await
        .map_err(|e| worker::Error::RustError(format!("revert: {e}")))?;
    console_log!("cron::state::revert recorded");
    drop(client);
    Ok(())
}

pub async fn sweep_stale_claims(env: &Env, threshold: &str) -> Result<u64> {
    let client = open_client(env).await?;
    let row = client
        .query_typed_one(SWEEP_SQL, &[(&threshold, Type::TEXT)])
        .await
        .map_err(|e| worker::Error::RustError(format!("sweep_stale_claims: {e}")))?;
    let n: i64 = row.get(0);
    console_log!("cron::state::sweep_stale_claims reset={}", n);
    drop(client);
    Ok(n as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eager_insert_sql_targets_cron_state() {
        assert!(EAGER_INSERT_SQL.contains("INSERT INTO cron_state"));
        assert!(EAGER_INSERT_SQL.contains("ON CONFLICT (tier, bucket_ts) DO NOTHING"));
    }

    #[test]
    fn claim_sql_uses_skip_locked() {
        assert!(CLAIM_SQL.contains("FOR UPDATE SKIP LOCKED"));
        assert!(CLAIM_SQL.contains("LIMIT 1"));
        assert!(CLAIM_SQL.contains("RETURNING tier, bucket_ts"));
    }

    #[test]
    fn claim_sql_prioritizes_eventful_recent_q15_work() {
        assert!(CLAIM_SQL.contains("EXISTS"));
        assert!(CLAIM_SQL.contains("events.bucket_ts"));
        assert!(CLAIM_SQL.contains("WHEN 'q15' THEN 0"));
        assert!(CLAIM_SQL.contains("candidate.bucket_ts DESC"));
    }

    #[test]
    fn finish_sql_sets_processed() {
        assert!(FINISH_SQL.contains("state = 'processed'"));
        assert!(FINISH_SQL.contains("finished_at = now()"));
    }

    #[test]
    fn revert_sql_sets_not_processed_and_clears_metadata() {
        assert!(REVERT_SQL.contains("state = 'not_processed'"));
        assert!(REVERT_SQL.contains("claimed_at = NULL"));
        assert!(REVERT_SQL.contains("worker_id = NULL"));
        assert!(REVERT_SQL.contains("last_error = $3"));
    }

    #[test]
    fn sweep_sql_targets_processing_with_age_filter() {
        assert!(SWEEP_SQL.contains("state = 'processing'"));
        assert!(SWEEP_SQL.contains("now() - $1::interval"));
    }

    #[test]
    fn tier_interval_covers_three_tiers() {
        assert_eq!(tier_interval("q15"), "15 minutes");
        assert_eq!(tier_interval("h1"), "1 hour");
        assert_eq!(tier_interval("d1"), "1 day");
    }

    #[test]
    fn stale_claim_mult_is_five() {
        assert_eq!(STALE_CLAIM_MULT, 5);
    }
}
