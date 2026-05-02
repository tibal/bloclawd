//! _status.json builder + WEB-08/09 derivations (D-103, D-104, AGGR-14).
//!
//! Contributor count leaves this module only after 1-significant-digit fuzzy rounding.
//! Logging boundary: status-write confirmation only; never log count values.
#![allow(dead_code)]

use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use worker::{Env, Hyperdrive, Result, console_log};

const SCHEMA_VERSION: &str = "v1";
const CONTRIBUTOR_WINDOW_DAYS: u32 = 30;

pub const COUNT_LIFETIME_EVENTS_SQL: &str = "SELECT COUNT(*)::bigint FROM events";
pub const COUNT_DISTINCT_CONTRIBUTORS_30D_SQL: &str = "SELECT COUNT(DISTINCT submission_group_id)::bigint FROM events WHERE received_at >= now() - interval '30 days'";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StatusJson {
    pub schema_version: &'static str,
    pub last_cron_success_ts: String,
    pub last_cron_attempted_ts: String,
    pub ingest_health: &'static str,
    pub total_events_lifetime: u64,
    pub approximate_contributors_30d: u64,
    pub approximate_contributors_window_days: u32,
}

/// Round `n` to 1 significant digit. RESEARCH Pitfall 7 verbatim.
pub fn fuzzy_round(n: u64) -> u64 {
    if n < 10 {
        return n;
    }
    let digits = (n as f64).log10().floor() as u32;
    let factor = 10u64.pow(digits);
    ((n + factor / 2) / factor) * factor
}

pub fn classify_health(now_ms: i64, last_success_ms: i64, cron_interval_ms: i64) -> &'static str {
    let delta = now_ms.saturating_sub(last_success_ms);
    if delta < cron_interval_ms * 3 / 2 {
        "healthy"
    } else if delta < cron_interval_ms * 3 {
        "degraded"
    } else {
        "down"
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

pub async fn count_lifetime_events(env: &Env) -> Result<u64> {
    let client = open_client(env).await?;
    let row = client
        .query_typed_one(COUNT_LIFETIME_EVENTS_SQL, &[])
        .await
        .map_err(|e| worker::Error::RustError(format!("count_events: {e}")))?;
    let n: i64 = row.get(0);
    drop(client);
    as_u64("count_events", n)
}

pub async fn count_distinct_contributors_30d(env: &Env) -> Result<u64> {
    let client = open_client(env).await?;
    let row = client
        .query_typed_one(COUNT_DISTINCT_CONTRIBUTORS_30D_SQL, &[])
        .await
        .map_err(|e| worker::Error::RustError(format!("contributors: {e}")))?;
    let raw: i64 = row.get(0);
    drop(client);
    Ok(fuzzy_round(as_u64("contributors", raw)?))
}

pub async fn build_status_json(
    env: &Env,
    last_success_ts: SystemTime,
    last_attempted_ts: SystemTime,
    cron_interval_ms: i64,
) -> Result<StatusJson> {
    let total_events_lifetime = count_lifetime_events(env).await?;
    let approximate_contributors_30d = count_distinct_contributors_30d(env).await?;
    let now_ms = worker::Date::now().as_millis() as i64;
    let last_success_ms = millis_since_epoch(last_success_ts);
    let ingest_health = classify_health(now_ms, last_success_ms, cron_interval_ms);

    Ok(StatusJson {
        schema_version: SCHEMA_VERSION,
        last_cron_success_ts: rfc3339(last_success_ts),
        last_cron_attempted_ts: rfc3339(last_attempted_ts),
        ingest_health,
        total_events_lifetime,
        approximate_contributors_30d,
        approximate_contributors_window_days: CONTRIBUTOR_WINDOW_DAYS,
    })
}

fn as_u64(context: &str, n: i64) -> Result<u64> {
    u64::try_from(n)
        .map_err(|_| worker::Error::RustError(format!("{context}: negative count returned")))
}

fn millis_since_epoch(ts: SystemTime) -> i64 {
    ts.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn rfc3339(ts: SystemTime) -> String {
    let secs = ts
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month, day, hour, minute, second) = epoch_to_civil(secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn epoch_to_civil(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let s = secs as i64;
    let days = s.div_euclid(86_400);
    let tod = s.rem_euclid(86_400);
    let hour = (tod / 3600) as u32;
    let minute = ((tod % 3600) / 60) as u32;
    let second = (tod % 60) as u32;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = (if month <= 2 { y + 1 } else { y }) as i32;

    (year, month, day, hour, minute, second)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[test]
    fn fuzzy_round_below_10_unchanged() {
        assert_eq!(fuzzy_round(0), 0);
        assert_eq!(fuzzy_round(7), 7);
        assert_eq!(fuzzy_round(9), 9);
    }

    #[test]
    fn fuzzy_round_tens() {
        assert_eq!(fuzzy_round(10), 10);
        assert_eq!(fuzzy_round(15), 20);
        assert_eq!(fuzzy_round(94), 90);
        assert_eq!(fuzzy_round(95), 100);
    }

    #[test]
    fn fuzzy_round_hundreds() {
        assert_eq!(fuzzy_round(237), 200);
        assert_eq!(fuzzy_round(257), 300);
        assert_eq!(fuzzy_round(2370), 2000);
    }

    #[test]
    fn fuzzy_round_powers_of_ten_stable() {
        assert_eq!(fuzzy_round(100), 100);
        assert_eq!(fuzzy_round(1000), 1000);
    }

    #[test]
    fn classify_health_healthy_below_1_5x() {
        assert_eq!(classify_health(1000, 900, 200), "healthy");
    }

    #[test]
    fn classify_health_degraded_between_1_5x_and_3x() {
        assert_eq!(classify_health(1499, 900, 200), "degraded");
    }

    #[test]
    fn classify_health_down_at_or_above_3x() {
        assert_eq!(classify_health(1500, 900, 200), "down");
        assert_eq!(classify_health(2000, 900, 200), "down");
    }

    #[test]
    fn classify_health_saturates_when_success_is_in_future() {
        assert_eq!(classify_health(900, 1000, 200), "healthy");
    }

    #[test]
    fn rfc3339_emits_iso_8601_seconds_z_format() {
        let cases = [
            (0, "1970-01-01T00:00:00Z"),
            (1_709_208_000, "2024-02-29T12:00:00Z"),
            (1_777_731_300, "2026-05-02T14:15:00Z"),
        ];

        for (secs, expected) in cases {
            let actual = rfc3339(UNIX_EPOCH + Duration::from_secs(secs));
            assert_eq!(actual, expected);
            assert_eq!(actual.len(), "YYYY-MM-DDTHH:MM:SSZ".len());
            assert_eq!(&actual[4..5], "-");
            assert_eq!(&actual[7..8], "-");
            assert_eq!(&actual[10..11], "T");
            assert_eq!(&actual[13..14], ":");
            assert_eq!(&actual[16..17], ":");
            assert_eq!(&actual[19..20], "Z");
        }
    }

    #[test]
    fn status_json_serializes_frontend_field_order() {
        let status = StatusJson {
            schema_version: "v1",
            last_cron_success_ts: "2026-05-02T14:15:00Z".to_string(),
            last_cron_attempted_ts: "2026-05-02T14:15:00Z".to_string(),
            ingest_health: "healthy",
            total_events_lifetime: 12_345,
            approximate_contributors_30d: 230,
            approximate_contributors_window_days: 30,
        };

        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(
            json,
            concat!(
                r#"{"schema_version":"v1","#,
                r#""last_cron_success_ts":"2026-05-02T14:15:00Z","#,
                r#""last_cron_attempted_ts":"2026-05-02T14:15:00Z","#,
                r#""ingest_health":"healthy","#,
                r#""total_events_lifetime":12345,"#,
                r#""approximate_contributors_30d":230,"#,
                r#""approximate_contributors_window_days":30}"#
            )
        );
    }

    fn _status_builder_signature(
        env: &worker::Env,
        last_success_ts: SystemTime,
        last_attempted_ts: SystemTime,
        cron_interval_ms: i64,
    ) {
        let _ = build_status_json(env, last_success_ts, last_attempted_ts, cron_interval_ms);
    }
}
