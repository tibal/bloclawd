#![allow(dead_code)]

use std::time::{SystemTime, UNIX_EPOCH};

use crate::cron::{aggregate::Cell, health::StatusJson};
use event_schema::LOG_BIN_EDGES;
use serde::{Deserialize, Serialize};
use worker::{Bucket, Env, HttpMetadata, Result};

const SCHEMA_VERSION: &str = "v1";
const REPORTS_ROOT: &str = "reports/v1";
const REPORTS_BUCKET_BINDING: &str = "BUCKET";
const BUCKET_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
const STATUS_CACHE_CONTROL: &str = "public, max-age=300, must-revalidate";
const MANIFEST_CACHE_CONTROL: &str = "public, max-age=60, must-revalidate";
const STATUS_KEY: &str = "reports/v1/_status.json";
const MANIFEST_KEY: &str = "reports/v1/manifest.json";

#[derive(Debug, Serialize)]
pub struct BucketEnvelope<'a> {
    pub schema_version: &'static str,
    pub bucket_ts: String,
    pub tier_resolution: &'a str,
    pub bin_edges: &'static [u64],
    pub cells: &'a [Cell],
}

impl<'a> BucketEnvelope<'a> {
    fn new(tier: &'a str, bucket_ts: SystemTime, cells: &'a [Cell]) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            bucket_ts: format_rfc3339(bucket_ts),
            tier_resolution: tier,
            bin_edges: &LOG_BIN_EDGES,
            cells,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestTiers {
    pub q15: Vec<String>,
    pub h1: Vec<String>,
    pub d1: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Manifest {
    pub schema_version: String,
    pub last_updated_ts: String,
    pub tiers: ManifestTiers,
}

impl Manifest {
    pub fn new(last_updated_ts: String, tiers: ManifestTiers) -> Self {
        Self {
            schema_version: SCHEMA_VERSION.to_string(),
            last_updated_ts,
            tiers,
        }
    }
}

pub fn bucket_path(tier: &str, bucket_ts: SystemTime) -> String {
    let secs = bucket_ts
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month, day, hour, minute, _) = epoch_to_civil(secs);

    match tier {
        "q15" => {
            format!("{REPORTS_ROOT}/q15/{year:04}/{month:02}/{day:02}/{hour:02}-{minute:02}.json")
        }
        "h1" => {
            format!("{REPORTS_ROOT}/h1/{year:04}/{month:02}/{day:02}/{hour:02}.json")
        }
        "d1" => format!("{REPORTS_ROOT}/d1/{year:04}/{month:02}/{day:02}.json"),
        _ => format!("{REPORTS_ROOT}/unknown/{year:04}/{month:02}/{day:02}.json"),
    }
}

pub async fn write_bucket_file(
    bucket: &Bucket,
    tier: &str,
    bucket_ts: SystemTime,
    cells: &[Cell],
) -> Result<()> {
    let envelope = BucketEnvelope::new(tier, bucket_ts, cells);
    let body = serde_json::to_vec_pretty(&envelope)?;
    let key = bucket_path(tier, bucket_ts);
    put_json(bucket, &key, body, BUCKET_CACHE_CONTROL).await
}

pub async fn write_status(bucket: &Bucket, status: &StatusJson) -> Result<()> {
    let body = serde_json::to_vec_pretty(status)?;
    put_json(bucket, STATUS_KEY, body, STATUS_CACHE_CONTROL).await
}

pub async fn write_manifest(bucket: &Bucket, manifest: &Manifest) -> Result<()> {
    let body = serde_json::to_vec_pretty(manifest)?;
    put_json(bucket, MANIFEST_KEY, body, MANIFEST_CACHE_CONTROL).await
}

pub async fn rewrite_manifest(
    env: &Env,
    bucket: &Bucket,
    last_updated_ts: SystemTime,
) -> Result<()> {
    let _ = env.bucket(REPORTS_BUCKET_BINDING)?;
    let tiers = ManifestTiers {
        q15: list_tier_keys(bucket, "q15").await?,
        h1: list_tier_keys(bucket, "h1").await?,
        d1: list_tier_keys(bucket, "d1").await?,
    };
    let manifest = Manifest::new(format_rfc3339(last_updated_ts), tiers);
    write_manifest(bucket, &manifest).await
}

async fn put_json(
    bucket: &Bucket,
    key: &str,
    body: Vec<u8>,
    cache_control: &'static str,
) -> Result<()> {
    bucket
        .put(key, body)
        .http_metadata(json_metadata(cache_control))
        .execute()
        .await?;
    Ok(())
}

fn json_metadata(cache_control: &'static str) -> HttpMetadata {
    HttpMetadata {
        content_type: Some("application/json".into()),
        cache_control: Some(cache_control.into()),
        ..Default::default()
    }
}

async fn list_tier_keys(bucket: &Bucket, tier: &str) -> Result<Vec<String>> {
    let prefix = format!("{REPORTS_ROOT}/{tier}/");
    let mut cursor = None;
    let mut keys = Vec::new();

    loop {
        let mut listing = bucket.list().prefix(prefix.clone());
        if let Some(next_cursor) = cursor.take() {
            listing = listing.cursor(next_cursor);
        }

        let objects = listing.execute().await?;
        for object in objects.objects() {
            let key = object.key();
            if let Some(relative) = key.strip_prefix(&prefix) {
                if relative.ends_with(".json") {
                    keys.push(relative.to_string());
                }
            }
        }

        if !objects.truncated() {
            break;
        }

        cursor = objects.cursor();
        if cursor.is_none() {
            break;
        }
    }

    keys.sort();
    keys.reverse();
    Ok(keys)
}

fn format_rfc3339(t: SystemTime) -> String {
    let secs = t
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
    use std::path::PathBuf;
    use std::time::{Duration, UNIX_EPOCH};

    use crate::cron::aggregate::{Cell, ModelCell};
    use crate::cron::percentile::PercentileEncoding;

    const FIXTURE_NAME: &str = "r2_v1_schema.json";
    const KNOWN_BUCKET_SECS: u64 = 1_746_195_300;

    #[test]
    fn bucket_path_q15_format() {
        assert_eq!(
            bucket_path("q15", known_bucket_time()),
            "reports/v1/q15/2025/05/02/14-15.json"
        );
    }

    #[test]
    fn bucket_path_h1_format() {
        assert_eq!(
            bucket_path("h1", known_bucket_time()),
            "reports/v1/h1/2025/05/02/14.json"
        );
    }

    #[test]
    fn bucket_path_d1_format() {
        assert_eq!(
            bucket_path("d1", known_bucket_time()),
            "reports/v1/d1/2025/05/02.json"
        );
    }

    #[test]
    fn cell_serialization_excludes_internal_samples() {
        let json = serde_json::to_string(&sample_full_cell()).unwrap();

        assert!(!json.contains("trimmed_unified_costs"));
    }

    #[test]
    fn cell_serialization_excludes_private_identifiers() {
        let json = serde_json::to_string(&sample_full_cell()).unwrap();

        for name in private_field_names() {
            assert!(!json.contains(&name), "public JSON contained {name}");
        }
    }

    #[test]
    fn top_level_envelope_includes_schema_version_and_bin_edges() {
        let cells = sample_cells();
        let envelope = BucketEnvelope::new("q15", known_bucket_time(), &cells);
        let json = serde_json::to_string(&envelope).unwrap();

        assert!(json.contains("\"schema_version\":\"v1\""));
        assert!(json.contains("\"bin_edges\":[1024,2048"));
    }

    #[test]
    fn schema_fixture() {
        let expected = fixture_json();
        if std::env::var("REGEN_R2_FIXTURE").ok().as_deref() == Some("1") {
            std::fs::write(fixture_path(), expected).unwrap();
            return;
        }

        let committed = std::fs::read_to_string(fixture_path()).unwrap();
        assert_eq!(committed, expected);

        let parsed_committed: serde_json::Value = serde_json::from_str(&committed).unwrap();
        let parsed_expected: serde_json::Value = serde_json::from_str(&expected).unwrap();
        assert_eq!(parsed_committed, parsed_expected);
    }

    #[test]
    fn log_bin_edges_are_fixture_source() {
        assert_eq!(LOG_BIN_EDGES[0], 1024);
        assert_eq!(LOG_BIN_EDGES[18], 268_435_456);
    }

    fn known_bucket_time() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(KNOWN_BUCKET_SECS)
    }

    fn fixture_json() -> String {
        let cells = sample_cells();
        let envelope = BucketEnvelope::new("q15", known_bucket_time(), &cells);
        let mut json = serde_json::to_string_pretty(&envelope).unwrap();
        json.push('\n');
        json
    }

    fn fixture_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("cron")
            .join("tests")
            .join("fixtures")
            .join(FIXTURE_NAME)
    }

    fn sample_cells() -> Vec<Cell> {
        vec![sample_full_cell(), sample_insufficient_cell()]
    }

    fn sample_full_cell() -> Cell {
        Cell {
            tier: "pro".to_string(),
            harness: "cc".to_string(),
            region: "NA".to_string(),
            limit_type: "5h".to_string(),
            n_submissions: 21,
            trim_rate: 0.0,
            trim_rate_alert: false,
            trimmed_unified_costs: vec![100.0, 200.0, 300.0],
            unified_cost: Some(PercentileEncoding::Mean {
                p10: 100.0,
                p25: 150.0,
                p50: 200.0,
                p75: 250.0,
                p90: 300.0,
            }),
            models: vec![ModelCell {
                model: "claude-sonnet-4-5".to_string(),
                n_with_model: 21,
                weights: [0.125; 8],
                weight_source: "prior".to_string(),
                tokens_to_limit_if_only: Some(PercentileEncoding::Bin {
                    p10: 0,
                    p25: 1,
                    p50: 2,
                    p75: 3,
                    p90: 4,
                }),
            }],
            insufficient_data: false,
        }
    }

    fn sample_insufficient_cell() -> Cell {
        Cell {
            tier: "max5".to_string(),
            harness: "codex".to_string(),
            region: "EU".to_string(),
            limit_type: "weekly".to_string(),
            n_submissions: 3,
            trim_rate: 0.0,
            trim_rate_alert: false,
            trimmed_unified_costs: vec![42.0],
            unified_cost: None,
            models: Vec::new(),
            insufficient_data: true,
        }
    }

    fn private_field_names() -> Vec<String> {
        vec![
            ["submission", "group", "id"].join("_"),
            ["event", "id"].join("_"),
            String::from_utf8(vec![110, 111, 110, 99, 101]).unwrap(),
            ["tz", "offset"].join("_"),
        ]
    }
}
