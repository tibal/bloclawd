#![allow(dead_code)]

use std::time::{SystemTime, UNIX_EPOCH};

use bloclawd_schema::{
    BucketCell as Cell, BucketEnvelope, Manifest, ManifestTiers, ReportResolution, StatusJson,
};
use worker::{Bucket, Env, HttpMetadata, Result};

const SCHEMA_VERSION: &str = "v1";
const REPORTS_ROOT: &str = "reports/v1";
const REPORTS_BUCKET_BINDING: &str = "BUCKET";
const BUCKET_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
const STATUS_CACHE_CONTROL: &str = "public, max-age=300, must-revalidate";
const MANIFEST_CACHE_CONTROL: &str = "public, max-age=60, must-revalidate";
const STATUS_KEY: &str = "reports/v1/_status.json";
const MANIFEST_KEY: &str = "reports/v1/manifest.json";

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
    let tier_resolution = tier
        .parse::<ReportResolution>()
        .map_err(worker::Error::RustError)?;
    let envelope = BucketEnvelope {
        schema_version: SCHEMA_VERSION.to_string(),
        bucket_ts: format_rfc3339(bucket_ts),
        tier_resolution,
        cells: cells.to_vec(),
    };
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
    let manifest = Manifest {
        schema_version: SCHEMA_VERSION.to_string(),
        last_updated_ts: format_rfc3339(last_updated_ts),
        tiers,
    };
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

    use bloclawd_schema::{
        Harness, LimitType, Model, ModelTokenMix, Percentiles, Region, Tier, TokenMixTotals,
    };

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
    fn cell_serialization_uses_public_api_cost_fields() {
        let json = serde_json::to_string(&sample_full_cell()).unwrap();

        assert!(json.contains("\"api_cost_usd\""));
        assert!(json.contains("\"typical_mix\""));
        assert!(!json.contains("unified_cost"));
        assert!(!json.contains("weights"));
    }

    #[test]
    fn cell_serialization_excludes_private_identifiers() {
        let json = serde_json::to_string(&sample_full_cell()).unwrap();

        for name in private_field_names() {
            assert!(!json.contains(&name), "public JSON contained {name}");
        }
    }

    #[test]
    fn top_level_envelope_includes_schema_version() {
        let cells = sample_cells();
        let envelope = sample_envelope("q15", known_bucket_time(), &cells);
        let json = serde_json::to_string(&envelope).unwrap();

        assert!(json.contains("\"schema_version\":\"v1\""));
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

    fn known_bucket_time() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(KNOWN_BUCKET_SECS)
    }

    fn fixture_json() -> String {
        let cells = sample_cells();
        let envelope = sample_envelope("q15", known_bucket_time(), &cells);
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
        vec![sample_full_cell(), sample_low_count_cell()]
    }

    fn sample_full_cell() -> Cell {
        Cell {
            subscription_tier: Tier::Pro,
            harness: Harness::ClaudeCode,
            region: Region::Na,
            limit_type: LimitType::FiveH,
            api_cost_usd: Percentiles {
                p10: 1.10,
                p25: 1.50,
                p50: 2.00,
                p75: 2.50,
                p90: 3.00,
            },
            n_dropped: 2,
            n_retained: 21,
            typical_mix: vec![ModelTokenMix {
                model: Model::ClaudeSonnet45,
                tokens: TokenMixTotals {
                    input_tokens: 1200.0,
                    output_tokens: 450.0,
                    cache_read_input_tokens: 8000.0,
                    ephemeral_5m_input_tokens: 100.0,
                    ephemeral_1h_input_tokens: 20.0,
                    cached_input_tokens: 0.0,
                    reasoning_output_tokens: 0.0,
                },
            }],
        }
    }

    fn sample_low_count_cell() -> Cell {
        Cell {
            subscription_tier: Tier::Max5,
            harness: Harness::Codex,
            region: Region::Eu,
            limit_type: LimitType::Weekly,
            api_cost_usd: Percentiles {
                p10: 9.0,
                p25: 9.0,
                p50: 10.0,
                p75: 10.0,
                p90: 20.0,
            },
            n_dropped: 0,
            n_retained: 3,
            typical_mix: Vec::new(),
        }
    }

    fn sample_envelope(tier: &str, bucket_ts: SystemTime, cells: &[Cell]) -> BucketEnvelope {
        BucketEnvelope {
            schema_version: SCHEMA_VERSION.to_string(),
            bucket_ts: format_rfc3339(bucket_ts),
            tier_resolution: tier.parse().unwrap(),
            cells: cells.to_vec(),
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
