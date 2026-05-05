//! Cron aggregation for public API-cost cells.
//!
//! Each public cell is a cohort keyed by subscription tier, harness, region,
//! and limit type. Rows sharing one `submission_group_id` are treated as one
//! submission. The main metric is the API list-price equivalent of that
//! submission, computed from the catalog-backed per-model token prices.

use std::collections::{BTreeMap, HashMap};

use bloclawd_schema::{
    BucketCell as Cell, EventPayload, Harness, LimitType, Model, ModelTokenMix, Percentiles,
    Provider, Region, Tier, TokenCounts, TokenMixTotals, TokenType,
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
    tokens_by_model: BTreeMap<Model, TokenMixTotals>,
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
    let mut tokens_by_model: BTreeMap<Model, TokenMixTotals> = BTreeMap::new();

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

    match model.provider() {
        Provider::Anthropic => {
            cost_part(model, TokenType::InputTokens, t.input_tokens)
                + cost_part(model, TokenType::OutputTokens, t.output_tokens)
                + cost_part(
                    model,
                    TokenType::CacheReadInputTokens,
                    t.cache_read_input_tokens,
                )
                + cost_part(
                    model,
                    TokenType::Ephemeral5mInputTokens,
                    t.ephemeral_5m_input_tokens,
                )
                + cost_part(
                    model,
                    TokenType::Ephemeral1hInputTokens,
                    t.ephemeral_1h_input_tokens,
                )
        }
        Provider::OpenAI => {
            let uncached_input_tokens = t.input_tokens.saturating_sub(t.cached_input_tokens);
            cost_part(model, TokenType::InputTokens, uncached_input_tokens)
                + cost_part(model, TokenType::CachedInputTokens, t.cached_input_tokens)
                + cost_part(model, TokenType::OutputTokens, t.output_tokens)
                + cost_part(
                    model,
                    TokenType::ReasoningOutputTokens,
                    t.reasoning_output_tokens,
                )
        }
    }
}

fn cost_part(model: Model, token_type: TokenType, count: u64) -> f64 {
    let price = model
        .price(token_type)
        .expect("catalog price table must cover every model/token tuple");
    count as f64 * price
}

fn average_mix(retained: &[&SubmissionAggregate]) -> Vec<ModelTokenMix> {
    let mut totals: BTreeMap<Model, TokenMixTotals> = BTreeMap::new();
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

fn add_counts(total: &mut TokenMixTotals, tokens: &TokenCounts) {
    total.input_tokens += tokens.input_tokens as f64;
    total.output_tokens += tokens.output_tokens as f64;
    total.cache_read_input_tokens += tokens.cache_read_input_tokens as f64;
    total.ephemeral_5m_input_tokens += tokens.ephemeral_5m_input_tokens as f64;
    total.ephemeral_1h_input_tokens += tokens.ephemeral_1h_input_tokens as f64;
    total.cached_input_tokens += tokens.cached_input_tokens as f64;
    total.reasoning_output_tokens += tokens.reasoning_output_tokens as f64;
}

fn add_totals(total: &mut TokenMixTotals, other: &TokenMixTotals) {
    total.input_tokens += other.input_tokens;
    total.output_tokens += other.output_tokens;
    total.cache_read_input_tokens += other.cache_read_input_tokens;
    total.ephemeral_5m_input_tokens += other.ephemeral_5m_input_tokens;
    total.ephemeral_1h_input_tokens += other.ephemeral_1h_input_tokens;
    total.cached_input_tokens += other.cached_input_tokens;
    total.reasoning_output_tokens += other.reasoning_output_tokens;
}

fn scale_totals(total: &mut TokenMixTotals, factor: f64) {
    total.input_tokens *= factor;
    total.output_tokens *= factor;
    total.cache_read_input_tokens *= factor;
    total.ephemeral_5m_input_tokens *= factor;
    total.ephemeral_1h_input_tokens *= factor;
    total.cached_input_tokens *= factor;
    total.reasoning_output_tokens *= factor;
}

fn is_zero(total: &TokenMixTotals) -> bool {
    total.input_tokens == 0.0
        && total.output_tokens == 0.0
        && total.cache_read_input_tokens == 0.0
        && total.ephemeral_5m_input_tokens == 0.0
        && total.ephemeral_1h_input_tokens == 0.0
        && total.cached_input_tokens == 0.0
        && total.reasoning_output_tokens == 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(
        model: Model,
        tier: Tier,
        harness: Harness,
        region: Region,
        input_tokens: u64,
    ) -> EventPayload {
        EventPayload {
            v: 1,
            model,
            tier,
            harness,
            region,
            tokens: TokenCounts {
                input_tokens,
                output_tokens: 0,
                cache_read_input_tokens: 0,
                ephemeral_5m_input_tokens: 0,
                ephemeral_1h_input_tokens: 0,
                cached_input_tokens: 0,
                reasoning_output_tokens: 0,
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
        input_tokens: u64,
    ) -> EventRow {
        EventRow {
            submission_group_id: Uuid::from_u128(group_idx),
            payload: payload(model, tier, harness, region, input_tokens),
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
        let expected = 1_000.0 * Model::ClaudeSonnet45.price(TokenType::InputTokens).unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn api_cost_prices_claude_ephemeral_cache_creation_fields() {
        let mut payload = payload(
            Model::ClaudeSonnet45,
            Tier::Pro,
            Harness::ClaudeCode,
            Region::Na,
            0,
        );
        payload.tokens.ephemeral_5m_input_tokens = 10;
        payload.tokens.ephemeral_1h_input_tokens = 20;

        let cost = api_cost_for_payload(&payload);
        let expected = 10.0
            * Model::ClaudeSonnet45
                .price(TokenType::Ephemeral5mInputTokens)
                .unwrap()
            + 20.0
                * Model::ClaudeSonnet45
                    .price(TokenType::Ephemeral1hInputTokens)
                    .unwrap();

        assert_eq!(cost, expected);
    }

    #[test]
    fn api_cost_prices_openai_cached_input_as_subset_of_input() {
        let mut payload = payload(Model::Gpt55, Tier::Max20, Harness::Codex, Region::Na, 100);
        payload.tokens.cached_input_tokens = 70;
        payload.tokens.output_tokens = 10;
        payload.tokens.reasoning_output_tokens = 5;

        let cost = api_cost_for_payload(&payload);
        let expected = 30.0 * Model::Gpt55.price(TokenType::InputTokens).unwrap()
            + 70.0 * Model::Gpt55.price(TokenType::CachedInputTokens).unwrap()
            + 10.0 * Model::Gpt55.price(TokenType::OutputTokens).unwrap()
            + 5.0
                * Model::Gpt55
                    .price(TokenType::ReasoningOutputTokens)
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

        assert_eq!(sonnet.tokens.input_tokens, 30.0);
        assert_eq!(opus.tokens.input_tokens, 20.0);
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
