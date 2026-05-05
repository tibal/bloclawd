//! Public R2 report schema.
//!
//! Worker aggregation writes these structs to R2, and the frontend consumes the
//! ts-rs exports. Keep bucket/report JSON here so Rust remains the source of
//! truth for the public data contract.

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::enums::{Harness, LimitType, Model, Region, Tier};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ReportResolution {
    #[serde(rename = "q15")]
    Q15,
    #[serde(rename = "h1")]
    H1,
    #[serde(rename = "d1")]
    D1,
}

impl ReportResolution {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Q15 => "q15",
            Self::H1 => "h1",
            Self::D1 => "d1",
        }
    }
}

impl FromStr for ReportResolution {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "q15" => Ok(Self::Q15),
            "h1" => Ok(Self::H1),
            "d1" => Ok(Self::D1),
            other => Err(format!("unknown report resolution: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum IngestHealth {
    Healthy,
    Degraded,
    Down,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct Percentiles {
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct TokenTypeTotals {
    pub input: f64,
    pub output: f64,
    pub cached_read: f64,
    pub cached_write: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct ModelTokenMix {
    pub model: Model,
    pub tokens: TokenTypeTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct BucketCell {
    pub subscription_tier: Tier,
    pub harness: Harness,
    pub region: Region,
    pub limit_type: LimitType,
    pub api_cost_usd: Option<Percentiles>,
    pub n_dropped: u32,
    pub n_retained: u32,
    pub typical_mix: Vec<ModelTokenMix>,
    pub insufficient_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct BucketEnvelope {
    pub schema_version: String,
    pub bucket_ts: String,
    pub tier_resolution: ReportResolution,
    pub cells: Vec<BucketCell>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct ManifestTiers {
    pub q15: Vec<String>,
    pub h1: Vec<String>,
    pub d1: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct Manifest {
    pub schema_version: String,
    pub last_updated_ts: String,
    pub tiers: ManifestTiers,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct StatusJson {
    pub schema_version: String,
    pub last_cron_success_ts: String,
    pub last_cron_attempted_ts: String,
    pub ingest_health: IngestHealth,
    #[ts(type = "number")]
    pub total_events_lifetime: u64,
    #[ts(type = "number")]
    pub approximate_contributors_30d: u64,
    pub approximate_contributors_window_days: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_resolution_round_trips() {
        let parsed: ReportResolution = serde_json::from_str(r#""h1""#).unwrap();
        assert_eq!(parsed, ReportResolution::H1);
        assert_eq!(parsed.as_str(), "h1");
        assert_eq!(serde_json::to_string(&parsed).unwrap(), r#""h1""#);
        assert!(serde_json::from_str::<ReportResolution>(r#""weekly""#).is_err());
    }

    #[test]
    fn ingest_health_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&IngestHealth::Healthy).unwrap(),
            r#""healthy""#
        );
        assert_eq!(
            serde_json::to_string(&IngestHealth::Degraded).unwrap(),
            r#""degraded""#
        );
        assert_eq!(
            serde_json::to_string(&IngestHealth::Down).unwrap(),
            r#""down""#
        );
    }
}
