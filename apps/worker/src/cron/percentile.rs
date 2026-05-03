//! Forward-declared in 04-06 so cron/aggregate.rs Cell.unified_cost compiles standalone.
//! 04-07 Task 1 step 1 fills the variant body (Mean + Bin).
#![allow(dead_code)]

use crate::cron::aggregate::Cell;
use serde::Serialize;

const WINDOW: usize = 5;
const HALF: usize = WINDOW / 2;
const PERCENTILES: [f64; 5] = [0.10, 0.25, 0.50, 0.75, 0.90];

#[derive(Debug, Clone, Serialize)]
pub enum PercentileEncoding {
    Mean {
        p10: f64,
        p25: f64,
        p50: f64,
        p75: f64,
        p90: f64,
    },
    Bin {
        p10: u8,
        p25: u8,
        p50: u8,
        p75: u8,
        p90: u8,
    },
}

pub fn encode(trimmed_sorted: &[f64], bin_edges: &[u64]) -> PercentileEncoding {
    let n = trimmed_sorted.len();
    let mut means = [0.0; 5];
    let mut all_windows_fit = n > 0;

    for (idx, percentile) in PERCENTILES.iter().enumerate() {
        let k = percentile_index(*percentile, n);
        if k < HALF || k + HALF >= n {
            all_windows_fit = false;
            break;
        }

        means[idx] = trimmed_sorted[k - HALF..=k + HALF].iter().sum::<f64>() / WINDOW as f64;
    }

    if all_windows_fit {
        return PercentileEncoding::Mean {
            p10: means[0],
            p25: means[1],
            p50: means[2],
            p75: means[3],
            p90: means[4],
        };
    }

    let bins = PERCENTILES.map(|percentile| {
        let k = percentile_index(percentile, n);
        trimmed_sorted
            .get(k)
            .map_or(0, |value| bin_index_for_edges(*value, bin_edges))
    });

    PercentileEncoding::Bin {
        p10: bins[0],
        p25: bins[1],
        p50: bins[2],
        p75: bins[3],
        p90: bins[4],
    }
}

pub fn encode_cell(cell: &mut Cell, bin_edges: &[u64]) {
    if cell.insufficient_data {
        return;
    }

    let unified_cost = encode(&cell.trimmed_unified_costs, bin_edges);
    cell.unified_cost = Some(unified_cost.clone());

    for model in &mut cell.models {
        if model.n_with_model < 5 {
            continue;
        }

        let sum_weights = model.weights.iter().sum::<f64>();
        if sum_weights <= 0.0 || !sum_weights.is_finite() {
            model.tokens_to_limit_if_only = None;
            continue;
        }

        model.tokens_to_limit_if_only = Some(tokens_to_limit_if_only(
            &unified_cost,
            sum_weights,
            bin_edges,
        ));
    }
}

fn tokens_to_limit_if_only(
    unified_cost: &PercentileEncoding,
    sum_weights: f64,
    bin_edges: &[u64],
) -> PercentileEncoding {
    match unified_cost {
        PercentileEncoding::Mean {
            p10,
            p25,
            p50,
            p75,
            p90,
        } => PercentileEncoding::Mean {
            p10: p10 / sum_weights,
            p25: p25 / sum_weights,
            p50: p50 / sum_weights,
            p75: p75 / sum_weights,
            p90: p90 / sum_weights,
        },
        PercentileEncoding::Bin {
            p10,
            p25,
            p50,
            p75,
            p90,
        } => PercentileEncoding::Bin {
            p10: rebin_left_edge(*p10, sum_weights, bin_edges),
            p25: rebin_left_edge(*p25, sum_weights, bin_edges),
            p50: rebin_left_edge(*p50, sum_weights, bin_edges),
            p75: rebin_left_edge(*p75, sum_weights, bin_edges),
            p90: rebin_left_edge(*p90, sum_weights, bin_edges),
        },
    }
}

fn percentile_index(percentile: f64, n: usize) -> usize {
    if n == 0 {
        return 0;
    }

    ((percentile * n as f64).floor() as usize).min(n - 1)
}

fn rebin_left_edge(bin_idx: u8, sum_weights: f64, bin_edges: &[u64]) -> u8 {
    let Some(left_edge) = bin_edges.get(bin_idx as usize) else {
        return 0;
    };
    bin_index_for_edges(*left_edge as f64 / sum_weights, bin_edges)
}

fn bin_index_for_edges(value: f64, bin_edges: &[u64]) -> u8 {
    if bin_edges.is_empty() || !value.is_finite() {
        return 0;
    }

    let value = value.max(0.0) as u64;
    let mut idx = 0usize;
    for (edge_idx, edge) in bin_edges.iter().enumerate() {
        if value >= *edge {
            idx = edge_idx;
        } else {
            break;
        }
    }

    idx.min(bin_edges.len() - 1).min(u8::MAX as usize) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cron::aggregate::{Cell, ModelCell};
    use bloclawd_schema::LOG_BIN_EDGES;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    struct MeanFixture {
        samples: Vec<f64>,
        expected_encoding: String,
        expected_p10: f64,
        expected_p25: f64,
        expected_p50: f64,
        expected_p75: f64,
        expected_p90: f64,
    }

    #[derive(Debug, Deserialize)]
    struct BinFixture {
        samples: Vec<f64>,
        expected_encoding: String,
        expected_p10: u8,
        expected_p25: u8,
        expected_p50: u8,
        expected_p75: u8,
        expected_p90: u8,
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    fn sample_cell(trimmed_unified_costs: Vec<f64>, insufficient_data: bool) -> Cell {
        Cell {
            tier: "pro".to_string(),
            harness: "cc".to_string(),
            region: "NA".to_string(),
            limit_type: "5h".to_string(),
            n_submissions: trimmed_unified_costs.len() as u32,
            trim_rate: 0.0,
            trim_rate_alert: false,
            trimmed_unified_costs,
            unified_cost: None,
            models: Vec::new(),
            insufficient_data,
        }
    }

    fn sample_model(n_with_model: u32, weights: [f64; 8]) -> ModelCell {
        ModelCell {
            model: "claude-sonnet-4-5".to_string(),
            n_with_model,
            weights,
            weight_source: "prior".to_string(),
            tokens_to_limit_if_only: None,
        }
    }

    #[test]
    fn encode_n21_mean_matches_golden() {
        let raw = include_str!("tests/fixtures/golden_percentile_n21.json");
        let fixture: MeanFixture = serde_json::from_str(raw).unwrap();
        assert_eq!(fixture.expected_encoding, "Mean");

        let PercentileEncoding::Mean {
            p10,
            p25,
            p50,
            p75,
            p90,
        } = encode(&fixture.samples, &LOG_BIN_EDGES)
        else {
            panic!("expected Mean encoding");
        };

        assert_close(p10, fixture.expected_p10);
        assert_close(p25, fixture.expected_p25);
        assert_close(p50, fixture.expected_p50);
        assert_close(p75, fixture.expected_p75);
        assert_close(p90, fixture.expected_p90);
    }

    #[test]
    fn encode_n12_bin_matches_golden() {
        let raw = include_str!("tests/fixtures/golden_percentile_n12.json");
        let fixture: BinFixture = serde_json::from_str(raw).unwrap();
        assert_eq!(fixture.expected_encoding, "Bin");

        let PercentileEncoding::Bin {
            p10,
            p25,
            p50,
            p75,
            p90,
        } = encode(&fixture.samples, &LOG_BIN_EDGES)
        else {
            panic!("expected Bin encoding");
        };

        assert_eq!(p10, fixture.expected_p10);
        assert_eq!(p25, fixture.expected_p25);
        assert_eq!(p50, fixture.expected_p50);
        assert_eq!(p75, fixture.expected_p75);
        assert_eq!(p90, fixture.expected_p90);
    }

    #[test]
    fn encode_n20_falls_to_bin_at_p90_boundary() {
        let samples: Vec<f64> = (1..=20).map(f64::from).collect();

        assert!(matches!(
            encode(&samples, &LOG_BIN_EDGES),
            PercentileEncoding::Bin { .. }
        ));
    }

    #[test]
    fn encode_n21_succeeds_at_p90_boundary() {
        let samples: Vec<f64> = (1..=21).map(f64::from).collect();

        assert!(matches!(
            encode(&samples, &LOG_BIN_EDGES),
            PercentileEncoding::Mean { .. }
        ));
    }

    #[test]
    fn encode_cell_skips_insufficient_data() {
        let mut cell = sample_cell(vec![100.0; 21], true);
        cell.models.push(sample_model(21, [1.0; 8]));

        encode_cell(&mut cell, &LOG_BIN_EDGES);

        assert!(cell.unified_cost.is_none());
        assert!(cell.models[0].tokens_to_limit_if_only.is_none());
    }

    #[test]
    fn encode_cell_per_model_k_anon_below_5_stays_none() {
        let mut cell = sample_cell((1..=30).map(f64::from).collect(), false);
        cell.models.push(sample_model(4, [1.0; 8]));

        encode_cell(&mut cell, &LOG_BIN_EDGES);

        assert!(cell.unified_cost.is_some());
        assert!(cell.models[0].tokens_to_limit_if_only.is_none());
    }

    #[test]
    fn encode_cell_tokens_if_only_uses_inverse_weights_sum() {
        let mut cell = sample_cell(vec![100.0; 21], false);
        cell.models.push(sample_model(21, [0.0625; 8]));

        encode_cell(&mut cell, &LOG_BIN_EDGES);

        let Some(PercentileEncoding::Mean { p50, .. }) = &cell.models[0].tokens_to_limit_if_only
        else {
            panic!("expected model Mean encoding");
        };
        assert_close(*p50, 200.0);
    }
}
