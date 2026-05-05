//! Cron aggregation for public API-cost cells.
//!
//! Each public cell is a cohort keyed by subscription tier, harness, region,
//! and limit type. Rows sharing one `submission_group_id` are treated as one
//! submission. The main metric is the API list-price equivalent of that
//! submission, computed from the catalog-backed per-model token prices.

use std::collections::{BTreeMap, HashMap};

use bloclawd_schema::{
    BucketCell as Cell, EventPayload, Harness, LimitType, Model, ModelTokenMix, Percentiles,
    Region, Tier, TokenCounts, TokenType, TokenTypeTotals, Window,
};
use uuid::Uuid;

const K_ANON: usize = 5;

#[derive(Debug, Clone)]
pub struct EventRow {
    pub submission_group_id: Uuid,
    pub payload: EventPayload,
    pub limit_type: LimitType,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct CellKey {
    subscription_tier: Tier,
    harness: Harness,
    region: Region,
    limit_type: LimitType,
}

#[derive(Debug, Clone)]
struct SubmissionAggregate {
    api_cost_usd: f64,
    tokens_by_model: BTreeMap<Model, TokenTypeTotals>,
}

pub fn compute_cells(rows: &[EventRow]) -> Vec<Cell> {
    let mut by_cell: BTreeMap<CellKey, Vec<&EventRow>> = BTreeMap::new();
    for row in rows {
        by_cell
            .entry(CellKey {
                subscription_tier: row.payload.tier,
                harness: row.payload.harness,
                region: row.payload.region,
                limit_type: row.limit_type,
            })
            .or_default()
            .push(row);
    }

    by_cell
        .into_iter()
        .map(|(key, cell_rows)| compute_cell(key, &cell_rows))
        .collect()
}

#[cfg(test)]
pub fn two_sigma_trim(values: &[f64]) -> (Vec<f64>, usize) {
    if values.is_empty() {
        return (Vec::new(), 0);
    }

    let Some((lo, hi)) = two_sigma_bounds(values) else {
        let mut sorted = values.to_vec();
        sorted.sort_by(f64::total_cmp);
        return (sorted, 0);
    };

    let mut trimmed: Vec<f64> = values
        .iter()
        .copied()
        .filter(|v| *v >= lo && *v <= hi)
        .collect();
    trimmed.sort_by(f64::total_cmp);
    let dropped = values.len() - trimmed.len();
    (trimmed, dropped)
}

fn compute_cell(key: CellKey, cell_rows: &[&EventRow]) -> Cell {
    let submissions = aggregate_submissions(cell_rows);
    let submission_count = submissions.len();
    if submission_count < K_ANON {
        return insufficient_cell(key, 0, submission_count as u32);
    }

    let costs: Vec<f64> = submissions.iter().map(|s| s.api_cost_usd).collect();
    let keep_mask = two_sigma_keep_mask(&costs);
    let retained: Vec<&SubmissionAggregate> = submissions
        .iter()
        .zip(keep_mask.iter())
        .filter_map(|(submission, keep)| keep.then_some(submission))
        .collect();
    let n_dropped = submission_count - retained.len();

    if retained.len() < K_ANON {
        return insufficient_cell(key, n_dropped as u32, retained.len() as u32);
    }

    let mut retained_costs: Vec<f64> = retained.iter().map(|s| s.api_cost_usd).collect();
    retained_costs.sort_by(f64::total_cmp);

    Cell {
        subscription_tier: key.subscription_tier,
        harness: key.harness,
        region: key.region,
        limit_type: key.limit_type,
        api_cost_usd: Some(percentiles(&retained_costs)),
        n_dropped: n_dropped as u32,
        n_retained: retained.len() as u32,
        typical_mix: average_mix(&retained),
        insufficient_data: false,
    }
}

fn insufficient_cell(key: CellKey, n_dropped: u32, n_retained: u32) -> Cell {
    Cell {
        subscription_tier: key.subscription_tier,
        harness: key.harness,
        region: key.region,
        limit_type: key.limit_type,
        api_cost_usd: None,
        n_dropped,
        n_retained,
        typical_mix: Vec::new(),
        insufficient_data: true,
    }
}

fn aggregate_submissions(rows: &[&EventRow]) -> Vec<SubmissionAggregate> {
    let grouped = group_by_submission_refs(rows);
    let mut pairs: Vec<(Uuid, Vec<&EventRow>)> = grouped.into_iter().collect();
    pairs.sort_by_key(|(uuid, _)| *uuid);
    pairs
        .into_iter()
        .map(|(_, submission_rows)| aggregate_submission(&submission_rows))
        .collect()
}

fn aggregate_submission(rows: &[&EventRow]) -> SubmissionAggregate {
    let mut api_cost_usd = 0.0;
    let mut tokens_by_model: BTreeMap<Model, TokenTypeTotals> = BTreeMap::new();

    for row in rows {
        api_cost_usd += api_cost_for_payload(&row.payload);
        let totals = tokens_by_model.entry(row.payload.model).or_default();
        add_counts(totals, &row.payload.tokens);
    }

    SubmissionAggregate {
        api_cost_usd,
        tokens_by_model,
    }
}

fn api_cost_for_payload(payload: &EventPayload) -> f64 {
    let model = payload.model;
    let t = &payload.tokens;
    cost_part(model, TokenType::Input, Window::FiveMin, t.input_5min)
        + cost_part(model, TokenType::Output, Window::FiveMin, t.output_5min)
        + cost_part(
            model,
            TokenType::CachedRead,
            Window::FiveMin,
            t.cached_read_5min,
        )
        + cost_part(
            model,
            TokenType::CachedWrite,
            Window::FiveMin,
            t.cached_write_5min,
        )
        + cost_part(model, TokenType::Input, Window::FiveH, t.input_5h)
        + cost_part(model, TokenType::Output, Window::FiveH, t.output_5h)
        + cost_part(
            model,
            TokenType::CachedRead,
            Window::FiveH,
            t.cached_read_5h,
        )
        + cost_part(
            model,
            TokenType::CachedWrite,
            Window::FiveH,
            t.cached_write_5h,
        )
}

fn cost_part(model: Model, token_type: TokenType, window: Window, count: u64) -> f64 {
    let price = model
        .price(token_type, window)
        .expect("catalog price table must cover every model/token/window tuple");
    count as f64 * price
}

fn average_mix(retained: &[&SubmissionAggregate]) -> Vec<ModelTokenMix> {
    let mut totals: BTreeMap<Model, TokenTypeTotals> = BTreeMap::new();
    for submission in retained {
        for (model, tokens) in &submission.tokens_by_model {
            let entry = totals.entry(*model).or_default();
            add_totals(entry, tokens);
        }
    }

    let denom = retained.len().max(1) as f64;
    totals
        .into_iter()
        .map(|(model, mut tokens)| {
            scale_totals(&mut tokens, 1.0 / denom);
            ModelTokenMix { model, tokens }
        })
        .filter(|entry| !is_zero(&entry.tokens))
        .collect()
}

fn percentiles(sorted_values: &[f64]) -> Percentiles {
    Percentiles {
        p10: percentile_value(sorted_values, 0.10),
        p25: percentile_value(sorted_values, 0.25),
        p50: percentile_value(sorted_values, 0.50),
        p75: percentile_value(sorted_values, 0.75),
        p90: percentile_value(sorted_values, 0.90),
    }
}

fn percentile_value(sorted_values: &[f64], percentile: f64) -> f64 {
    if sorted_values.is_empty() {
        return 0.0;
    }
    let idx = ((sorted_values.len() - 1) as f64 * percentile).round() as usize;
    sorted_values[idx.min(sorted_values.len() - 1)]
}

fn two_sigma_keep_mask(values: &[f64]) -> Vec<bool> {
    let Some((lo, hi)) = two_sigma_bounds(values) else {
        return vec![true; values.len()];
    };
    values.iter().map(|v| *v >= lo && *v <= hi).collect()
}

fn two_sigma_bounds(values: &[f64]) -> Option<(f64, f64)> {
    let n = values.len();
    if n < 3 {
        return None;
    }
    let mean: f64 = values.iter().sum::<f64>() / n as f64;
    let var: f64 = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1) as f64;
    let sd = var.sqrt();
    Some((mean - 2.0 * sd, mean + 2.0 * sd))
}

fn group_by_submission_refs<'a>(rows: &[&'a EventRow]) -> HashMap<Uuid, Vec<&'a EventRow>> {
    rows.iter().copied().fold(HashMap::new(), |mut map, row| {
        map.entry(row.submission_group_id).or_default().push(row);
        map
    })
}

fn add_counts(total: &mut TokenTypeTotals, tokens: &TokenCounts) {
    total.input += (tokens.input_5min + tokens.input_5h) as f64;
    total.output += (tokens.output_5min + tokens.output_5h) as f64;
    total.cached_read += (tokens.cached_read_5min + tokens.cached_read_5h) as f64;
    total.cached_write += (tokens.cached_write_5min + tokens.cached_write_5h) as f64;
}

fn add_totals(total: &mut TokenTypeTotals, other: &TokenTypeTotals) {
    total.input += other.input;
    total.output += other.output;
    total.cached_read += other.cached_read;
    total.cached_write += other.cached_write;
}

fn scale_totals(total: &mut TokenTypeTotals, factor: f64) {
    total.input *= factor;
    total.output *= factor;
    total.cached_read *= factor;
    total.cached_write *= factor;
}

fn is_zero(total: &TokenTypeTotals) -> bool {
    total.input == 0.0
        && total.output == 0.0
        && total.cached_read == 0.0
        && total.cached_write == 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(
        model: Model,
        tier: Tier,
        harness: Harness,
        region: Region,
        input_5min: u64,
    ) -> EventPayload {
        EventPayload {
            v: 1,
            model,
            tier,
            harness,
            region,
            tokens: TokenCounts {
                input_5min,
                output_5min: 0,
                cached_read_5min: 0,
                cached_write_5min: 0,
                input_5h: 0,
                output_5h: 0,
                cached_read_5h: 0,
                cached_write_5h: 0,
            },
        }
    }

    fn row(
        group_idx: u128,
        model: Model,
        tier: Tier,
        harness: Harness,
        region: Region,
        limit_type: LimitType,
        input_5min: u64,
    ) -> EventRow {
        EventRow {
            submission_group_id: Uuid::from_u128(group_idx),
            payload: payload(model, tier, harness, region, input_5min),
            limit_type,
        }
    }

    fn rows_for_inputs(inputs: &[u64]) -> Vec<EventRow> {
        inputs
            .iter()
            .enumerate()
            .map(|(idx, input)| {
                row(
                    idx as u128 + 1,
                    Model::ClaudeSonnet45,
                    Tier::Pro,
                    Harness::ClaudeCode,
                    Region::Na,
                    LimitType::FiveH,
                    *input,
                )
            })
            .collect()
    }

    #[test]
    fn two_sigma_trim_drops_far_outlier() {
        let values = [
            10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 1_000.0,
        ];
        let (trimmed, dropped) = two_sigma_trim(&values);
        assert_eq!(trimmed, vec![10.0; 9]);
        assert_eq!(dropped, 1);
    }

    #[test]
    fn two_sigma_preserves_n_lt_3() {
        let (trimmed, dropped) = two_sigma_trim(&[5.0, 6.0]);
        assert_eq!(trimmed, vec![5.0, 6.0]);
        assert_eq!(dropped, 0);
    }

    #[test]
    fn compute_cells_groups_by_submission_group_id() {
        let mut rows = rows_for_inputs(&[10, 20, 30, 40, 50]);
        rows.push(row(
            1,
            Model::ClaudeSonnet45,
            Tier::Pro,
            Harness::ClaudeCode,
            Region::Na,
            LimitType::FiveH,
            60,
        ));

        let cells = compute_cells(&rows);
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].n_retained, 5);
    }

    #[test]
    fn compute_cells_enforces_k_anonymity() {
        let rows = rows_for_inputs(&[10, 20, 30, 40]);
        let cells = compute_cells(&rows);

        assert_eq!(cells.len(), 1);
        assert!(cells[0].insufficient_data);
        assert!(cells[0].api_cost_usd.is_none());
        assert!(cells[0].typical_mix.is_empty());
    }

    #[test]
    fn compute_cells_emits_api_cost_percentiles() {
        let rows = rows_for_inputs(&[10, 20, 30, 40, 50, 60, 70]);
        let cells = compute_cells(&rows);

        let cost = cells[0].api_cost_usd.unwrap();
        assert!(cost.p10 > 0.0);
        assert!(cost.p10 <= cost.p50);
        assert!(cost.p50 <= cost.p90);
        assert_eq!(cells[0].n_dropped, 0);
        assert_eq!(cells[0].n_retained, 7);
    }

    #[test]
    fn compute_cells_uses_catalog_prices() {
        let rows = rows_for_inputs(&[1_000]);
        let cost = api_cost_for_payload(&rows[0].payload);
        let expected = 1_000.0
            * Model::ClaudeSonnet45
                .price(TokenType::Input, Window::FiveMin)
                .unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn compute_cells_emits_average_model_token_mix() {
        let mut rows = rows_for_inputs(&[10, 20, 30, 40, 50]);
        rows.push(row(
            1,
            Model::ClaudeOpus47,
            Tier::Pro,
            Harness::ClaudeCode,
            Region::Na,
            LimitType::FiveH,
            100,
        ));

        let cell = &compute_cells(&rows)[0];
        let sonnet = cell
            .typical_mix
            .iter()
            .find(|entry| entry.model == Model::ClaudeSonnet45)
            .unwrap();
        let opus = cell
            .typical_mix
            .iter()
            .find(|entry| entry.model == Model::ClaudeOpus47)
            .unwrap();

        assert_eq!(sonnet.tokens.input, 30.0);
        assert_eq!(opus.tokens.input, 20.0);
    }

    #[test]
    fn compute_cells_keeps_bucket_dimensions() {
        let rows = rows_for_inputs(&[10, 20, 30, 40, 50]);
        let cell = &compute_cells(&rows)[0];

        assert_eq!(cell.subscription_tier, Tier::Pro);
        assert_eq!(cell.harness, Harness::ClaudeCode);
        assert_eq!(cell.region, Region::Na);
        assert_eq!(cell.limit_type, LimitType::FiveH);
    }
}
