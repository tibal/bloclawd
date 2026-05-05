//! Synthetic-volume CPU benchmark for the cron tick path.
//!
//! Gated by `#[ignore]` + `--features perf` so it only runs on demand.
//! Threshold: wall-clock <= 25s on a developer laptop. The Workers Paid
//! subscription caps cron CPU at 30s per invocation. If this perf test fails,
//! shard cron work across more cron_state work items before deploying.

#![cfg(feature = "perf")]

use std::time::Instant;

use bloclawd_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};
use uuid::Uuid;

#[allow(dead_code)]
#[path = "../src/cron/mod.rs"]
mod cron;

use cron::aggregate::{EventRow, compute_cells};
use cron::r2_emit::BucketEnvelope;

fn synth_event_rows(cohorts: usize, submissions_per_cohort: usize) -> Vec<EventRow> {
    let tiers = [Tier::Pro, Tier::Max5, Tier::Max20];
    let harnesses = [Harness::ClaudeCode, Harness::Codex];
    let regions = [Region::Na, Region::Eu, Region::As];
    let limit_types = ["5h", "weekly"];
    let models = [
        Model::ClaudeSonnet45,
        Model::ClaudeOpus47,
        Model::Gpt5,
        Model::Gpt5Codex,
    ];
    let mut rows = Vec::with_capacity(cohorts * limit_types.len() * submissions_per_cohort);

    for cohort_idx in 0..cohorts {
        let tier = tiers[cohort_idx % tiers.len()];
        let harness = harnesses[(cohort_idx / tiers.len()) % harnesses.len()];
        let region = regions[(cohort_idx / (tiers.len() * harnesses.len())) % regions.len()];

        for (limit_idx, limit_type) in limit_types.iter().enumerate() {
            for submission_idx in 0..submissions_per_cohort {
                let model = models[(cohort_idx + submission_idx) % models.len()];
                let base = 4_000
                    + (cohort_idx as u64 * 317)
                    + (limit_idx as u64 * 191)
                    + (submission_idx as u64 * 23);
                rows.push(EventRow {
                    submission_group_id: Uuid::from_u128(
                        1 + (cohort_idx as u128 * 10_000)
                            + (limit_idx as u128 * 1_000)
                            + submission_idx as u128,
                    ),
                    payload: EventPayload {
                        v: 1,
                        model,
                        tier,
                        harness,
                        region,
                        tokens: TokenCounts {
                            input_5min: base,
                            output_5min: base / 4 + 17,
                            cached_read_5min: base / 2 + 31,
                            cached_write_5min: base / 8 + 7,
                            input_5h: base * 8,
                            output_5h: base * 2 + 83,
                            cached_read_5h: base * 4 + 127,
                            cached_write_5h: base + 43,
                        },
                    },
                    model: wire_name(model),
                    subscription_tier: wire_name(tier),
                    harness: wire_name(harness),
                    region: wire_name(region),
                    limit_type: (*limit_type).to_string(),
                });
            }
        }
    }

    rows
}

fn wire_name<T: serde::Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

#[cfg(feature = "perf")]
#[test]
#[ignore]
fn synthetic_volume_under_25s() {
    let rows = synth_event_rows(14, 30);
    let start = Instant::now();
    let cells = compute_cells(&rows);

    let envelope = BucketEnvelope {
        schema_version: "v1",
        bucket_ts: "2026-05-02T14:15:00Z".to_string(),
        tier_resolution: "q15",
        cells: &cells,
    };
    let _json = serde_json::to_vec(&envelope).unwrap();

    let elapsed = start.elapsed();
    eprintln!(
        "synthetic_volume_under_25s: cohorts=14 cells={} elapsed={:?}",
        cells.len(),
        elapsed
    );
    assert!(
        elapsed.as_millis() < 25_000,
        "cron tick exceeded 25s budget on synthetic 28-cell workload (Workers Paid 30s cap risk): elapsed={elapsed:?}"
    );
}
