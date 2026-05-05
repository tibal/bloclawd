//! Cron tick orchestrator.

use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bloclawd_schema::{EventPayload, LimitType};
use serde::de::DeserializeOwned;
use serde_json::Value;
use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use tokio_postgres::types::Type;
use uuid::Uuid;
use worker::{Env, Hyperdrive, Result, console_log};

use crate::cron::{aggregate, health, r2_emit, state};

pub const CRON_INTERVAL_MS_PROD: i64 = 86_400_000;
pub const CRON_INTERVAL_MS_STAGING: i64 = 900_000;

const EVENT_SELECT_SQL: &str = r#"
    SELECT submission_group_id, payload, limit_type
    FROM events
    WHERE bucket_ts >= $1::timestamptz
      AND bucket_ts < $1::timestamptz + $2::interval
"#;

const LAST_SUCCESS_SQL: &str = "SELECT MAX(finished_at) FROM cron_state WHERE state = 'processed'";

pub async fn run(cron_expr: &str, scheduled_ms: f64, env: &Env) -> Result<()> {
    console_log!("cron tick start cron={} ms={}", cron_expr, scheduled_ms);

    let scheduled_ts = scheduled_time(scheduled_ms);
    let stale_threshold = stale_threshold_for_cron(cron_expr);

    if let Err(e) = state::sweep_stale_claims(env, stale_threshold).await {
        console_log!("cron tick sweep failed err={}", e);
    }

    for tier in ["q15", "h1", "d1"] {
        if let Err(e) = state::eager_fill(env, tier, lateness_for_cron(cron_expr)).await {
            console_log!("cron tick eager_fill failed err={}", e);
        }
    }

    let worker_id = format!("{}", scheduled_ms as u64);
    match state::claim_one(env, &worker_id, stale_threshold).await {
        Ok(Some((tier, bucket_ts))) => {
            if let Err(e) = process_claimed(env, &tier, bucket_ts).await {
                console_log!("cron tick process failed err={}", e);
                revert_claim(env, &tier, bucket_ts, &format!("err: {e}")).await;
            }
        }
        Ok(None) => {
            console_log!("cron tick no work");
        }
        Err(e) => {
            console_log!("cron tick claim failed err={}", e);
        }
    }

    if let Err(e) = write_status_then_manifest(env, scheduled_ts, cron_interval_ms(cron_expr)).await
    {
        console_log!("cron tick status/manifest failed err={}", e);
    }

    console_log!("cron tick end");
    Ok(())
}

async fn process_claimed(env: &Env, tier: &str, bucket_ts: SystemTime) -> Result<()> {
    process_one(env, tier, bucket_ts).await?;
    if let Err(e) = state::mark_processed(env, tier, bucket_ts).await {
        revert_claim(env, tier, bucket_ts, &format!("mark_processed: {e}")).await;
        return Err(e);
    }
    Ok(())
}

async fn process_one(env: &Env, tier: &str, bucket_ts: SystemTime) -> Result<()> {
    let client = open_client(env).await?;
    let rows = client
        .query_typed(
            EVENT_SELECT_SQL,
            &[
                (&bucket_ts, Type::TIMESTAMPTZ),
                (&cron_interval(tier_to_cron_expr(tier)), Type::TEXT),
            ],
        )
        .await
        .map_err(|e| worker::Error::RustError(format!("select events: {e}")))?;

    let mut event_rows = Vec::with_capacity(rows.len());
    for row in rows {
        let payload_value: Value = row.get(1);
        let payload: EventPayload = match serde_json::from_value(payload_value) {
            Ok(payload) => payload,
            Err(e) => {
                console_log!("cron tick skipped payload schema mismatch err={}", e);
                continue;
            }
        };
        let limit_type_text: String = row.get(2);
        event_rows.push(aggregate::EventRow {
            submission_group_id: row.get::<_, Uuid>(0),
            payload,
            limit_type: parse_wire_enum::<LimitType>("limit_type", &limit_type_text)?,
        });
    }
    drop(client);

    let cells = aggregate::compute_cells(&event_rows);

    let bucket = env.bucket("BUCKET")?;
    r2_emit::write_bucket_file(&bucket, tier, bucket_ts, &cells).await
}

fn parse_wire_enum<T>(field: &str, value: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    serde_json::from_value(Value::String(value.to_string()))
        .map_err(|e| worker::Error::RustError(format!("{field}: {e}")))
}

async fn write_status_then_manifest(
    env: &Env,
    scheduled_ts: SystemTime,
    cron_interval_ms: i64,
) -> Result<()> {
    let bucket = env.bucket("BUCKET")?;
    let last_success_ts = match last_success_from_cron_state(env).await {
        Ok(Some(ts)) => ts,
        Ok(None) => fallback_last_success(scheduled_ts, cron_interval_ms),
        Err(e) => {
            console_log!("cron tick last_success fallback err={}", e);
            fallback_last_success(scheduled_ts, cron_interval_ms)
        }
    };
    let status =
        health::build_status_json(env, last_success_ts, scheduled_ts, cron_interval_ms).await?;
    r2_emit::write_status(&bucket, &status).await?;
    r2_emit::rewrite_manifest(env, &bucket, scheduled_ts).await
}

async fn last_success_from_cron_state(env: &Env) -> Result<Option<SystemTime>> {
    let client = open_client(env).await?;
    let row = client
        .query_typed_one(LAST_SUCCESS_SQL, &[])
        .await
        .map_err(|e| worker::Error::RustError(format!("last_success: {e}")))?;
    let ts: Option<SystemTime> = row.get(0);
    drop(client);
    Ok(ts)
}

async fn revert_claim(env: &Env, tier: &str, bucket_ts: SystemTime, msg: &str) {
    if let Err(e) = state::revert(env, tier, bucket_ts, msg).await {
        console_log!("cron tick revert failed err={}", e);
    }
}

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

fn cron_interval(cron_expr: &str) -> &'static str {
    let parts: Vec<&str> = cron_expr.split_whitespace().collect();
    if parts.len() != 5 {
        return "1 hour";
    }

    if let Some(minutes) = parts[0].strip_prefix("*/") {
        return match minutes.parse::<u32>().unwrap_or(15) {
            15 => "15 minutes",
            30 => "30 minutes",
            _ => "15 minutes",
        };
    }

    if parts == ["0", "*", "*", "*", "*"] {
        return "1 hour";
    }

    if parts[0] == "0" && parts[2] == "*" && parts[3] == "*" && parts[4] == "*" {
        return "1 day";
    }

    "1 hour"
}

fn cron_interval_ms(cron_expr: &str) -> i64 {
    match cron_interval(cron_expr) {
        "15 minutes" => CRON_INTERVAL_MS_STAGING,
        "30 minutes" => 1_800_000,
        "1 hour" => 3_600_000,
        "1 day" => CRON_INTERVAL_MS_PROD,
        _ => 3_600_000,
    }
}

fn lateness_for_cron(cron_expr: &str) -> i64 {
    if cron_interval(cron_expr) == "1 day" {
        0
    } else {
        30
    }
}

fn stale_threshold_for_cron(cron_expr: &str) -> &'static str {
    match cron_interval(cron_expr) {
        "15 minutes" => "75 minutes",
        "30 minutes" => "150 minutes",
        "1 hour" => "5 hours",
        "1 day" => "5 days",
        _ => "5 hours",
    }
}

fn tier_to_cron_expr(tier: &str) -> &'static str {
    match tier {
        "q15" => "*/15 * * * *",
        "h1" => "0 * * * *",
        "d1" => "0 3 * * *",
        _ => "*/15 * * * *",
    }
}

fn scheduled_time(scheduled_ms: f64) -> SystemTime {
    let millis = if scheduled_ms.is_finite() && scheduled_ms > 0.0 {
        scheduled_ms as u64
    } else {
        0
    };
    UNIX_EPOCH + Duration::from_millis(millis)
}

fn fallback_last_success(scheduled_ts: SystemTime, cron_interval_ms: i64) -> SystemTime {
    let interval = Duration::from_millis(cron_interval_ms.max(0) as u64);
    scheduled_ts.checked_sub(interval).unwrap_or(UNIX_EPOCH)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cron_interval_15min() {
        assert_eq!(cron_interval("*/15 * * * *"), "15 minutes");
    }

    #[test]
    fn cron_interval_daily() {
        assert_eq!(cron_interval("0 3 * * *"), "1 day");
    }

    #[test]
    fn cron_interval_hourly() {
        assert_eq!(cron_interval("0 * * * *"), "1 hour");
    }

    #[test]
    fn cron_interval_ms_daily() {
        assert_eq!(cron_interval_ms("0 3 * * *"), CRON_INTERVAL_MS_PROD);
    }

    #[test]
    fn lateness_zero_for_daily() {
        assert_eq!(lateness_for_cron("0 3 * * *"), 0);
    }

    #[test]
    fn lateness_thirty_for_subdaily() {
        assert_eq!(lateness_for_cron("*/15 * * * *"), 30);
    }

    #[test]
    fn stale_threshold_is_five_times() {
        assert_eq!(stale_threshold_for_cron("*/15 * * * *"), "75 minutes");
    }
}
