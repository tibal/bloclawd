use std::path::PathBuf;

use event_schema::{
    EventPayload, Harness, LOG_BIN_EDGES, Model, Region, Tier, TokenCounts,
};
use uuid::Uuid;

use crate::cron::{
    aggregate::{compute_cells, EventRow},
    percentile::encode_cell,
    r2_emit::BucketEnvelope,
};

fn sample_payload(
    model: Model,
    tier: Tier,
    harness: Harness,
    region: Region,
    seed: u64,
) -> EventPayload {
    EventPayload {
        v: 1,
        model,
        tier,
        harness,
        region,
        tokens: TokenCounts {
            input_5min: 100 + seed,
            output_5min: 60 + seed,
            cached_read_5min: 20 + seed,
            cached_write_5min: 10 + seed,
            input_5h: 1_000 + seed,
            output_5h: 600 + seed,
            cached_read_5h: 200 + seed,
            cached_write_5h: 100 + seed,
        },
    }
}

fn enum_string<T: serde::Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

fn row(group_idx: u128, model: Model, tier: Tier, region: Region, seed: u64) -> EventRow {
    let harness = Harness::ClaudeCode;
    EventRow {
        submission_group_id: Uuid::from_u128(group_idx),
        payload: sample_payload(model, tier, harness, region, seed),
        model: enum_string(model),
        tier: enum_string(tier),
        harness: enum_string(harness),
        region: enum_string(region),
        limit_type: "5h".to_string(),
    }
}

fn encoded_cells(rows: &[EventRow]) -> Vec<crate::cron::aggregate::Cell> {
    let mut cells = compute_cells(rows);
    for cell in &mut cells {
        encode_cell(cell, &LOG_BIN_EDGES);
    }
    cells
}

#[test]
fn pipeline_well_populated_cohort_emits_public_envelope() {
    let rows: Vec<EventRow> = (0..30)
        .map(|idx| {
            row(
                idx + 1,
                Model::ClaudeSonnet45,
                Tier::Max20,
                Region::Eu,
                idx as u64,
            )
        })
        .collect();
    let cells = encoded_cells(&rows);
    let envelope = BucketEnvelope {
        schema_version: "v1",
        bucket_ts: "2026-05-02T14:15:00Z".to_string(),
        tier_resolution: "q15",
        bin_edges: &LOG_BIN_EDGES,
        cells: &cells,
    };
    let json = serde_json::to_string(&envelope).unwrap();

    assert!(json.contains("\"schema_version\":\"v1\""));
    assert!(json.contains("\"bin_edges\":[1024,2048"));
    assert!(json.contains("\"Mean\""));
    assert!(json.contains("\"models\":["));

    for forbidden in ["submission_group_id", "event_id", "nonce", "tz_offset"] {
        assert!(
            !json.contains(forbidden),
            "public envelope contained {forbidden}"
        );
    }
}

#[test]
fn pipeline_low_cohort_marks_insufficient_data() {
    let rows: Vec<EventRow> = (0..4)
        .map(|idx| {
            row(
                idx + 1,
                Model::ClaudeSonnet45,
                Tier::Max20,
                Region::Eu,
                idx as u64,
            )
        })
        .collect();
    let cells = encoded_cells(&rows);

    assert_eq!(cells.len(), 1);
    assert!(cells[0].insufficient_data);
    assert!(cells[0].models.is_empty());
    assert!(cells[0].unified_cost.is_none());

    let envelope = BucketEnvelope {
        schema_version: "v1",
        bucket_ts: "2026-05-02T14:15:00Z".to_string(),
        tier_resolution: "q15",
        bin_edges: &LOG_BIN_EDGES,
        cells: &cells,
    };
    let json = serde_json::to_string(&envelope).unwrap();

    assert!(json.contains("\"insufficient_data\":true"));
    assert!(!json.contains("\"p10\""));
    assert!(!json.contains("\"models\":[{"));
}

#[test]
fn manifest_last_write_order_invariant() {
    let tick_src = std::fs::read_to_string(tick_path()).unwrap();

    let bucket_pos = tick_src
        .find("r2_emit::write_bucket_file")
        .expect("write_bucket_file present");
    let status_pos = tick_src
        .find("r2_emit::write_status")
        .expect("write_status present");
    let manifest_pos = tick_src
        .find("r2_emit::rewrite_manifest")
        .expect("rewrite_manifest present");

    assert!(
        bucket_pos < status_pos,
        "write_bucket_file must precede write_status"
    );
    assert!(
        status_pos < manifest_pos,
        "write_status must precede rewrite_manifest"
    );
}

fn tick_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("cron")
        .join("tick.rs")
}
