//! Cron aggregation numerics for unified-cost cells.
//!
//! W14 pinned the ridge target to `y_s = 1.0`: each submission represents one
//! observed limit hit, so the learned weights map a submission's token vector to
//! normalized "fraction of limit" cost. Priors from published model prices are
//! rescaled to the cohort's typical token vector before fitting. The per-model
//! "if only" projection is `unified_cost / mean(model_weights[0..8])`; this
//! layer leaves the raw sorted unified costs available behind `#[serde(skip)]`.
#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet, HashMap};

use bloclawd_schema::{
    EventPayload, Model, TokenCounts, TokenType, Window, model_price_lookup as price_lookup,
};
use serde::Serialize;
use uuid::Uuid;

use crate::cron::percentile::PercentileEncoding;
use crate::cron::ridge;

pub const N_FIT: usize = 50;
const TOKEN_FIELDS_PER_MODEL: usize = 8;

#[derive(Debug, Clone)]
pub struct EventRow {
    pub submission_group_id: Uuid,
    pub payload: EventPayload,
    pub model: String,
    pub tier: String,
    pub harness: String,
    pub region: String,
    pub limit_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Cell {
    pub tier: String,
    pub harness: String,
    pub region: String,
    pub limit_type: String,
    pub n_submissions: u32,
    pub trim_rate: f64,
    pub trim_rate_alert: bool,
    #[serde(skip)]
    pub trimmed_unified_costs: Vec<f64>,
    pub unified_cost: Option<PercentileEncoding>,
    pub models: Vec<ModelCell>,
    pub insufficient_data: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelCell {
    pub model: String,
    pub n_with_model: u32,
    pub weights: [f64; TOKEN_FIELDS_PER_MODEL],
    pub weight_source: String,
    pub tokens_to_limit_if_only: Option<PercentileEncoding>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct CellKey {
    tier: String,
    harness: String,
    region: String,
    limit_type: String,
}

#[derive(Debug, Clone)]
struct FitOutcome {
    weights: Vec<f64>,
    trimmed_unified_costs: Vec<f64>,
    trim_rate: f64,
    n_trimmed: usize,
    weight_source: String,
}

pub fn two_sigma_trim(values: &[f64]) -> (Vec<f64>, f64) {
    if values.is_empty() {
        return (Vec::new(), 0.0);
    }

    let Some((lo, hi)) = two_sigma_bounds(values) else {
        let mut sorted = values.to_vec();
        sorted.sort_by(f64::total_cmp);
        return (sorted, 0.0);
    };

    let mut trimmed: Vec<f64> = values
        .iter()
        .copied()
        .filter(|v| *v >= lo && *v <= hi)
        .collect();
    trimmed.sort_by(f64::total_cmp);
    let trim_rate = (values.len() - trimmed.len()) as f64 / values.len() as f64;
    (trimmed, trim_rate)
}

pub fn compute_cells(rows: &[EventRow]) -> Vec<Cell> {
    let mut by_cell: BTreeMap<CellKey, Vec<&EventRow>> = BTreeMap::new();
    for row in rows {
        by_cell
            .entry(CellKey {
                tier: row.tier.clone(),
                harness: row.harness.clone(),
                region: row.region.clone(),
                limit_type: row.limit_type.clone(),
            })
            .or_default()
            .push(row);
    }

    by_cell
        .into_iter()
        .map(|(key, cell_rows)| compute_cell(rows, key, &cell_rows))
        .collect()
}

fn compute_cell(all_rows: &[EventRow], key: CellKey, cell_rows: &[&EventRow]) -> Cell {
    let submissions_map = group_by_submission_refs(cell_rows);
    let submissions = ordered_submissions(submissions_map);
    let n_submissions = submissions.len();

    if n_submissions < 5 {
        return Cell {
            tier: key.tier,
            harness: key.harness,
            region: key.region,
            limit_type: key.limit_type,
            n_submissions: n_submissions as u32,
            trim_rate: 0.0,
            trim_rate_alert: false,
            trimmed_unified_costs: Vec::new(),
            unified_cost: None,
            models: Vec::new(),
            insufficient_data: true,
        };
    }

    let models_in_cell = models_in_submissions(&submissions);
    let fit = select_fit(all_rows, &key, &submissions, &models_in_cell);
    if fit.trim_rate > 0.05 {
        log_trim_rate(fit.trim_rate);
    }

    let n_by_model = n_with_model_by_name(&submissions, &models_in_cell);
    let models = models_in_cell
        .iter()
        .enumerate()
        .map(|(model_idx, model)| {
            let start = model_idx * TOKEN_FIELDS_PER_MODEL;
            let mut weights = [0.0; TOKEN_FIELDS_PER_MODEL];
            weights.copy_from_slice(&fit.weights[start..start + TOKEN_FIELDS_PER_MODEL]);
            let n_with_model = *n_by_model.get(model).unwrap_or(&0) as u32;
            let model_avg_weight = weights.iter().sum::<f64>() / TOKEN_FIELDS_PER_MODEL as f64;
            let _tokens_to_limit_if_only =
                tokens_to_limit_if_only_projection(&fit.trimmed_unified_costs, model_avg_weight);

            ModelCell {
                model: model.clone(),
                n_with_model,
                weights,
                weight_source: fit_weight_source(&fit),
                tokens_to_limit_if_only: None,
            }
        })
        .collect();

    Cell {
        tier: key.tier,
        harness: key.harness,
        region: key.region,
        limit_type: key.limit_type,
        n_submissions: n_submissions as u32,
        trim_rate: fit.trim_rate,
        trim_rate_alert: fit.trim_rate > 0.10,
        trimmed_unified_costs: fit.trimmed_unified_costs,
        unified_cost: None,
        models,
        insufficient_data: false,
    }
}

fn select_fit(
    all_rows: &[EventRow],
    key: &CellKey,
    submissions: &[Vec<&EventRow>],
    models_in_cell: &[String],
) -> FitOutcome {
    if let Some(fit) = fit_if_enough(submissions, models_in_cell) {
        return fit;
    }

    let tier_harness_rows: Vec<&EventRow> = all_rows
        .iter()
        .filter(|row| {
            row.tier == key.tier && row.harness == key.harness && row.limit_type == key.limit_type
        })
        .collect();
    let tier_harness_submissions =
        ordered_submissions(group_by_submission_refs(&tier_harness_rows));
    if let Some(fit) = fit_if_enough(&tier_harness_submissions, models_in_cell) {
        return fit.with_source("tier+harness");
    }

    let tier_rows: Vec<&EventRow> = all_rows
        .iter()
        .filter(|row| row.tier == key.tier && row.limit_type == key.limit_type)
        .collect();
    let tier_submissions = ordered_submissions(group_by_submission_refs(&tier_rows));
    if let Some(fit) = fit_if_enough(&tier_submissions, models_in_cell) {
        return fit.with_source("tier");
    }

    let weights = priors_for_models(models_in_cell);
    let costs = sorted_unified_costs(submissions, &weights, models_in_cell);
    let (trimmed_unified_costs, trim_rate) = two_sigma_trim(&costs);
    FitOutcome {
        weights,
        trimmed_unified_costs,
        trim_rate,
        n_trimmed: submissions.len(),
        weight_source: "prior".to_string(),
    }
    .with_source("prior")
}

fn fit_if_enough(submissions: &[Vec<&EventRow>], models_in_cell: &[String]) -> Option<FitOutcome> {
    if submissions.len() < N_FIT {
        return None;
    }
    let fit = fit_with_trim(submissions, models_in_cell)?;
    if fit.n_trimmed < N_FIT {
        return None;
    }
    Some(fit.with_source("cohort"))
}

fn fit_with_trim(submissions: &[Vec<&EventRow>], models_in_cell: &[String]) -> Option<FitOutcome> {
    let (x, _) = build_design_matrix(submissions, models_in_cell);
    let y = vec![1.0; x.len()];
    let prior = rescaled_priors(&x, models_in_cell);
    let lambda = N_FIT as f64 / x.len().max(1) as f64;
    let initial = ridge::fit_ridge(&x, &y, &prior, lambda);
    if initial.residual_l2.is_infinite() {
        return None;
    }

    let initial_costs = costs_from_matrix(&x, &initial.weights);
    let keep_mask = two_sigma_keep_mask(&initial_costs);
    let trimmed_submissions: Vec<Vec<&EventRow>> = submissions
        .iter()
        .zip(keep_mask.iter())
        .filter_map(|(submission, keep)| keep.then_some(submission.clone()))
        .collect();
    let trim_rate =
        (submissions.len() - trimmed_submissions.len()) as f64 / submissions.len() as f64;

    let (x_trimmed, _) = build_design_matrix(&trimmed_submissions, models_in_cell);
    let y_trimmed = vec![1.0; x_trimmed.len()];
    let prior_trimmed = rescaled_priors(&x_trimmed, models_in_cell);
    let final_fit = ridge::fit_ridge(&x_trimmed, &y_trimmed, &prior_trimmed, lambda);
    if final_fit.residual_l2.is_infinite() {
        return None;
    }

    let mut trimmed_unified_costs = costs_from_matrix(&x_trimmed, &final_fit.weights);
    trimmed_unified_costs.sort_by(f64::total_cmp);
    Some(FitOutcome {
        weights: final_fit.weights,
        trimmed_unified_costs,
        trim_rate,
        n_trimmed: trimmed_submissions.len(),
        weight_source: String::new(),
    })
}

impl FitOutcome {
    fn with_source(mut self, source: &str) -> Self {
        self.weight_source = source.to_string();
        self
    }
}

fn fit_weight_source(fit: &FitOutcome) -> String {
    fit.weight_source.clone()
}

#[allow(dead_code)]
fn group_by_submission(rows: &[EventRow]) -> HashMap<Uuid, Vec<&EventRow>> {
    rows.iter().fold(HashMap::new(), |mut map, row| {
        map.entry(row.submission_group_id).or_default().push(row);
        map
    })
}

fn group_by_submission_refs<'a>(rows: &[&'a EventRow]) -> HashMap<Uuid, Vec<&'a EventRow>> {
    rows.iter().copied().fold(HashMap::new(), |mut map, row| {
        map.entry(row.submission_group_id).or_default().push(row);
        map
    })
}

fn ordered_submissions(map: HashMap<Uuid, Vec<&EventRow>>) -> Vec<Vec<&EventRow>> {
    let mut pairs: Vec<(Uuid, Vec<&EventRow>)> = map.into_iter().collect();
    pairs.sort_by_key(|(uuid, _)| *uuid);
    pairs.into_iter().map(|(_, rows)| rows).collect()
}

fn build_design_matrix(
    submissions: &[Vec<&EventRow>],
    models_in_cell: &[String],
) -> (Vec<Vec<f64>>, Vec<usize>) {
    let mut x = Vec::with_capacity(submissions.len());
    let mut n_models = Vec::with_capacity(submissions.len());
    for submission in submissions {
        let present: BTreeSet<&str> = submission.iter().map(|row| row.model.as_str()).collect();
        n_models.push(present.len());
        let mut row = Vec::with_capacity(models_in_cell.len() * TOKEN_FIELDS_PER_MODEL);
        for model in models_in_cell {
            let tokens = summed_tokens_for_model(submission, model);
            row.extend(token_counts_to_vec(&tokens));
        }
        x.push(row);
    }
    (x, n_models)
}

fn priors_for_models(models_in_cell: &[String]) -> Vec<f64> {
    let mut priors = Vec::with_capacity(models_in_cell.len() * TOKEN_FIELDS_PER_MODEL);
    for model_name in models_in_cell {
        let model = parse_model(model_name);
        for (token_type, window) in token_field_order() {
            priors.push(
                model
                    .and_then(|m| price_lookup(m, token_type, window))
                    .unwrap_or(1e-9),
            );
        }
    }
    priors
}

fn unified_cost_with_weights(
    submission_tokens: &Vec<&EventRow>,
    weights: &[f64],
    models_in_cell: &[String],
) -> f64 {
    let mut cost = 0.0;
    for (model_idx, model) in models_in_cell.iter().enumerate() {
        let tokens = summed_tokens_for_model(submission_tokens, model);
        let token_values = token_counts_to_vec(&tokens);
        let start = model_idx * TOKEN_FIELDS_PER_MODEL;
        for (idx, token_count) in token_values.iter().enumerate() {
            cost += token_count * weights[start + idx];
        }
    }
    cost
}

fn models_in_submissions(submissions: &[Vec<&EventRow>]) -> Vec<String> {
    submissions
        .iter()
        .flat_map(|submission| submission.iter().map(|row| row.model.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn n_with_model_by_name(
    submissions: &[Vec<&EventRow>],
    models_in_cell: &[String],
) -> HashMap<String, usize> {
    models_in_cell
        .iter()
        .map(|model| {
            let n = submissions
                .iter()
                .filter(|submission| submission.iter().any(|row| row.model == *model))
                .count();
            (model.clone(), n)
        })
        .collect()
}

fn rescaled_priors(x: &[Vec<f64>], models_in_cell: &[String]) -> Vec<f64> {
    let raw = priors_for_models(models_in_cell);
    if x.is_empty() || raw.is_empty() {
        return raw;
    }
    let typical = column_medians(x);
    let dot: f64 = raw
        .iter()
        .zip(typical.iter())
        .map(|(prior, token)| prior * token)
        .sum();
    if dot <= 0.0 || !dot.is_finite() {
        return raw;
    }
    let alpha = 1.0 / dot;
    raw.into_iter().map(|prior| prior * alpha).collect()
}

fn column_medians(x: &[Vec<f64>]) -> Vec<f64> {
    let p = x.first().map_or(0, Vec::len);
    let mut medians = Vec::with_capacity(p);
    for col in 0..p {
        let mut values: Vec<f64> = x.iter().map(|row| row[col]).collect();
        values.sort_by(f64::total_cmp);
        medians.push(median_sorted(&values));
    }
    medians
}

fn median_sorted(values: &[f64]) -> f64 {
    let n = values.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        values[n / 2]
    } else {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    }
}

fn sorted_unified_costs(
    submissions: &[Vec<&EventRow>],
    weights: &[f64],
    models_in_cell: &[String],
) -> Vec<f64> {
    let mut costs: Vec<f64> = submissions
        .iter()
        .map(|submission| unified_cost_with_weights(submission, weights, models_in_cell))
        .collect();
    costs.sort_by(f64::total_cmp);
    costs
}

fn costs_from_matrix(x: &[Vec<f64>], weights: &[f64]) -> Vec<f64> {
    x.iter()
        .map(|row| {
            row.iter()
                .zip(weights.iter())
                .map(|(token, weight)| token * weight)
                .sum()
        })
        .collect()
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

fn summed_tokens_for_model(submission: &[&EventRow], model: &str) -> TokenCounts {
    submission
        .iter()
        .filter(|row| row.model == model)
        .fold(zero_tokens(), |mut acc, row| {
            add_tokens(&mut acc, &row.payload.tokens);
            acc
        })
}

fn zero_tokens() -> TokenCounts {
    TokenCounts {
        input_5min: 0,
        output_5min: 0,
        cached_read_5min: 0,
        cached_write_5min: 0,
        input_5h: 0,
        output_5h: 0,
        cached_read_5h: 0,
        cached_write_5h: 0,
    }
}

fn add_tokens(acc: &mut TokenCounts, tokens: &TokenCounts) {
    acc.input_5min += tokens.input_5min;
    acc.output_5min += tokens.output_5min;
    acc.cached_read_5min += tokens.cached_read_5min;
    acc.cached_write_5min += tokens.cached_write_5min;
    acc.input_5h += tokens.input_5h;
    acc.output_5h += tokens.output_5h;
    acc.cached_read_5h += tokens.cached_read_5h;
    acc.cached_write_5h += tokens.cached_write_5h;
}

fn token_counts_to_vec(tokens: &TokenCounts) -> [f64; TOKEN_FIELDS_PER_MODEL] {
    [
        tokens.input_5min as f64,
        tokens.output_5min as f64,
        tokens.cached_read_5min as f64,
        tokens.cached_write_5min as f64,
        tokens.input_5h as f64,
        tokens.output_5h as f64,
        tokens.cached_read_5h as f64,
        tokens.cached_write_5h as f64,
    ]
}

fn token_field_order() -> [(TokenType, Window); TOKEN_FIELDS_PER_MODEL] {
    [
        (TokenType::Input, Window::FiveMin),
        (TokenType::Output, Window::FiveMin),
        (TokenType::CachedRead, Window::FiveMin),
        (TokenType::CachedWrite, Window::FiveMin),
        (TokenType::Input, Window::FiveH),
        (TokenType::Output, Window::FiveH),
        (TokenType::CachedRead, Window::FiveH),
        (TokenType::CachedWrite, Window::FiveH),
    ]
}

fn parse_model(model: &str) -> Option<Model> {
    serde_json::from_str(&format!("\"{model}\"")).ok()
}

fn tokens_to_limit_if_only_projection(unified_costs: &[f64], model_avg_weight: f64) -> Vec<f64> {
    if model_avg_weight <= 0.0 || !model_avg_weight.is_finite() {
        return Vec::new();
    }
    unified_costs
        .iter()
        .map(|cost| cost / model_avg_weight)
        .collect()
}

#[cfg(target_arch = "wasm32")]
fn log_trim_rate(trim_rate: f64) {
    worker::console_log!("cron::aggregate trim_rate={:.3}", trim_rate);
}

#[cfg(not(target_arch = "wasm32"))]
fn log_trim_rate(trim_rate: f64) {
    let _ = trim_rate;
}

#[cfg(test)]
mod tests {
    use super::*;
    use bloclawd_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};
    use serde::Deserialize;
    use uuid::Uuid;

    #[derive(Debug, Deserialize)]
    struct TrimFixture {
        values: Vec<f64>,
        expected_trimmed_sorted: Vec<f64>,
        expected_trim_rate: f64,
    }

    #[derive(Debug, Deserialize)]
    struct GoldenY1Fixture {
        submission_count: usize,
        model: String,
        tier: String,
        harness: String,
        region: String,
        limit_type: String,
        tokens: TokenCounts,
        expected_unified_cost_s: Vec<f64>,
    }

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
        limit_type: &str,
        input_5min: u64,
    ) -> EventRow {
        EventRow {
            submission_group_id: Uuid::from_u128(group_idx),
            payload: payload(model, tier, harness, region, input_5min),
            model: serde_json::to_value(model)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string(),
            tier: serde_json::to_value(tier)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string(),
            harness: serde_json::to_value(harness)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string(),
            region: serde_json::to_value(region)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string(),
            limit_type: limit_type.to_string(),
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
                    "5h",
                    *input,
                )
            })
            .collect()
    }

    #[test]
    fn two_sigma_trim_matches_golden() {
        let raw = include_str!("tests/fixtures/golden_two_sigma.json");
        let fixture: TrimFixture = serde_json::from_str(raw).unwrap();
        let (trimmed, trim_rate) = two_sigma_trim(&fixture.values);

        assert_eq!(trimmed, fixture.expected_trimmed_sorted);
        assert!((trim_rate - fixture.expected_trim_rate).abs() <= 1e-12);
    }

    #[test]
    fn compute_cells_golden_ridge_y1_n50() {
        let raw = include_str!("tests/fixtures/golden_ridge_y1_cohort_n50.json");
        let fixture: GoldenY1Fixture = serde_json::from_str(raw).unwrap();
        let model: Model = serde_json::from_str(&format!("\"{}\"", fixture.model)).unwrap();
        let tier: Tier = serde_json::from_str(&format!("\"{}\"", fixture.tier)).unwrap();
        let harness: Harness = serde_json::from_str(&format!("\"{}\"", fixture.harness)).unwrap();
        let region: Region = serde_json::from_str(&format!("\"{}\"", fixture.region)).unwrap();
        let rows: Vec<EventRow> = (0..fixture.submission_count)
            .map(|idx| EventRow {
                submission_group_id: Uuid::from_u128(idx as u128 + 1),
                payload: EventPayload {
                    v: 1,
                    model,
                    tier,
                    harness,
                    region,
                    tokens: fixture.tokens.clone(),
                },
                model: fixture.model.clone(),
                tier: fixture.tier.clone(),
                harness: fixture.harness.clone(),
                region: fixture.region.clone(),
                limit_type: fixture.limit_type.clone(),
            })
            .collect();

        let cells = compute_cells(&rows);
        assert_eq!(cells.len(), 1);
        let cell = &cells[0];
        assert_eq!(cell.n_submissions, fixture.submission_count as u32);
        assert_eq!(cell.models[0].weight_source, "cohort");
        assert_eq!(
            cell.trimmed_unified_costs.len(),
            fixture.expected_unified_cost_s.len()
        );
        for (actual, expected) in cell
            .trimmed_unified_costs
            .iter()
            .zip(fixture.expected_unified_cost_s.iter())
        {
            assert!((actual - expected).abs() <= 1e-4);
        }
    }

    #[test]
    fn two_sigma_preserves_n_lt_3() {
        let (trimmed, trim_rate) = two_sigma_trim(&[5.0, 6.0]);
        assert_eq!(trimmed, vec![5.0, 6.0]);
        assert_eq!(trim_rate, 0.0);
    }

    #[test]
    fn compute_cells_groups_by_submission_group_id() {
        let mut rows = rows_for_inputs(&[10, 20]);
        rows.push(row(
            1,
            Model::ClaudeSonnet45,
            Tier::Pro,
            Harness::ClaudeCode,
            Region::Na,
            "5h",
            30,
        ));
        rows.push(row(
            2,
            Model::ClaudeSonnet45,
            Tier::Pro,
            Harness::ClaudeCode,
            Region::Na,
            "5h",
            40,
        ));

        let cells = compute_cells(&rows);
        assert_eq!(cells[0].n_submissions, 2);
    }

    #[test]
    fn compute_cells_enforces_k_anonymity() {
        let rows = rows_for_inputs(&[10, 20, 30, 40]);
        let cells = compute_cells(&rows);

        assert_eq!(cells.len(), 1);
        assert!(cells[0].insufficient_data);
        assert!(cells[0].trimmed_unified_costs.is_empty());
        assert!(cells[0].models.is_empty());
    }

    #[test]
    fn compute_cells_per_model_k_anon_gate() {
        let mut rows = rows_for_inputs(&[100, 100, 100, 100, 100, 100]);
        for group_idx in 1..=3 {
            rows.push(row(
                group_idx,
                Model::Gpt5,
                Tier::Pro,
                Harness::ClaudeCode,
                Region::Na,
                "5h",
                100,
            ));
        }

        let cells = compute_cells(&rows);
        let gpt = cells[0].models.iter().find(|m| m.model == "gpt-5").unwrap();
        assert_eq!(gpt.n_with_model, 3);
        assert!(gpt.tokens_to_limit_if_only.is_none());
    }

    #[test]
    fn compute_cells_uses_prior_when_n_small() {
        let rows = rows_for_inputs(&[10, 20, 30, 40, 50, 60]);
        let cells = compute_cells(&rows);

        assert_eq!(cells[0].models[0].weight_source, "prior");
    }

    #[test]
    fn compute_cells_uses_cohort_fit_when_n_large() {
        let rows = rows_for_inputs(&vec![100; 60]);
        let cells = compute_cells(&rows);

        assert_eq!(cells[0].models[0].weight_source, "cohort");
    }

    #[test]
    fn compute_cells_emits_trim_rate() {
        let mut inputs = vec![100; 19];
        inputs.push(10_000);
        let rows = rows_for_inputs(&inputs);
        let cells = compute_cells(&rows);

        assert!(cells[0].trim_rate >= 0.05);
        assert!(cells[0].trim_rate <= 0.15);
        assert!(!cells[0].trim_rate_alert);
    }

    #[test]
    fn compute_cells_emits_trim_rate_alert_above_10pct() {
        let mut inputs = vec![100; 30];
        inputs.extend([10_000; 5]);
        let rows = rows_for_inputs(&inputs);
        let cells = compute_cells(&rows);

        assert!(cells[0].trim_rate > 0.10);
        assert!(cells[0].trim_rate_alert);
    }
}
