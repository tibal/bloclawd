//! Closed-form ridge solver for cron aggregation weights.
//!
//! Computes `w = prior + (X^T X + lambda I)^-1 X^T (y - X * prior)`.
//! The system is small and dense, so hand-rolled partial-pivot Gaussian
//! elimination avoids a WASM-heavy linear algebra dependency.
#![allow(dead_code)]

#[derive(Debug, Clone)]
pub struct RidgeFit {
    pub weights: Vec<f64>,
    pub n: usize,
    pub residual_l2: f64,
}

pub fn fit_ridge(x: &[Vec<f64>], y: &[f64], prior: &[f64], lambda: f64) -> RidgeFit {
    let n = x.len();
    let p = prior.len();
    debug_assert_eq!(y.len(), n);
    debug_assert!(x.iter().all(|r| r.len() == p));

    if n == 0 {
        return RidgeFit {
            weights: prior.to_vec(),
            n,
            residual_l2: 0.0,
        };
    }

    let mut y_shift = vec![0.0; n];
    for i in 0..n {
        let mut s = y[i];
        for (j, prior_j) in prior.iter().copied().enumerate().take(p) {
            s -= x[i][j] * prior_j;
        }
        y_shift[i] = s;
    }

    let mut a = vec![vec![0.0; p]; p];
    let mut b = vec![0.0; p];
    for i in 0..n {
        for j in 0..p {
            for k in 0..p {
                a[j][k] += x[i][j] * x[i][k];
            }
            b[j] += x[i][j] * y_shift[i];
        }
    }
    for (j, row) in a.iter_mut().enumerate() {
        row[j] += lambda;
    }

    let Some(dw) = solve_dense(&mut a, &mut b) else {
        return RidgeFit {
            weights: prior.to_vec(),
            n,
            residual_l2: f64::INFINITY,
        };
    };

    let weights: Vec<f64> = prior.iter().zip(&dw).map(|(p, d)| p + d).collect();
    let residual_l2 = compute_residual_l2(x, y, &weights);

    RidgeFit {
        weights,
        n,
        residual_l2,
    }
}

fn solve_dense(a: &mut [Vec<f64>], b: &mut [f64]) -> Option<Vec<f64>> {
    let p = b.len();
    for k in 0..p {
        let mut max_row = k;
        for i in (k + 1)..p {
            if a[i][k].abs() > a[max_row][k].abs() {
                max_row = i;
            }
        }
        a.swap(k, max_row);
        b.swap(k, max_row);

        if a[k][k].abs() < 1e-12 {
            // Singular system; caller falls back to next stratum.
            return None;
        }

        let pivot = a[k][k];
        for i in (k + 1)..p {
            let factor = a[i][k] / pivot;
            for j in k..p {
                a[i][j] -= factor * a[k][j];
            }
            b[i] -= factor * b[k];
        }
    }

    let mut x = vec![0.0; p];
    for i in (0..p).rev() {
        let mut s = b[i];
        for (j, xj) in x.iter().enumerate().skip(i + 1) {
            s -= a[i][j] * xj;
        }
        if a[i][i].abs() < 1e-12 {
            return None;
        }
        x[i] = s / a[i][i];
    }
    Some(x)
}

fn compute_residual_l2(x: &[Vec<f64>], y: &[f64], weights: &[f64]) -> f64 {
    let sum_sq: f64 = x
        .iter()
        .zip(y.iter())
        .map(|(row, yi)| {
            let pred: f64 = row
                .iter()
                .zip(weights.iter())
                .map(|(xij, wj)| xij * wj)
                .sum();
            (yi - pred).powi(2)
        })
        .sum();
    sum_sq.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    struct RidgeFixture {
        x: Vec<Vec<f64>>,
        y: Vec<f64>,
        prior: Vec<f64>,
        lambda: f64,
        expected_weights_approx: Vec<f64>,
    }

    #[test]
    fn fit_ridge_returns_prior_for_zero_n() {
        let prior = vec![1.0, 2.0, 3.0];
        let fit = fit_ridge(&[], &[], &prior, 1.0);

        assert_eq!(fit.weights, prior);
        assert_eq!(fit.n, 0);
        assert_eq!(fit.residual_l2, 0.0);
    }

    #[test]
    fn fit_ridge_matches_golden_fixture() {
        let raw = include_str!("tests/fixtures/golden_ridge_n12.json");
        let fixture: RidgeFixture = serde_json::from_str(raw).unwrap();
        let fit = fit_ridge(&fixture.x, &fixture.y, &fixture.prior, fixture.lambda);

        assert_eq!(fit.n, fixture.x.len());
        assert_eq!(fit.weights.len(), fixture.expected_weights_approx.len());
        for (idx, (actual, expected)) in fit
            .weights
            .iter()
            .zip(fixture.expected_weights_approx.iter())
            .enumerate()
        {
            assert!(
                (actual - expected).abs() <= 1e-6,
                "weight {idx}: actual={actual} expected={expected}"
            );
        }
    }

    #[test]
    fn fit_ridge_returns_prior_for_singular_input() {
        let x = vec![vec![0.0, 0.0], vec![0.0, 0.0]];
        let y = vec![1.0, 1.0];
        let prior = vec![0.25, 0.75];
        let fit = fit_ridge(&x, &y, &prior, 0.0);

        assert_eq!(fit.weights, prior);
        assert!(fit.residual_l2.is_infinite());
    }

    #[test]
    fn fit_ridge_residual_decreases_with_more_data() {
        let prior = vec![0.0];
        let one = fit_ridge(&vec![vec![1.0]], &[1.0], &prior, 1.0);
        let two = fit_ridge(&vec![vec![1.0], vec![1.0]], &[1.0, 1.0], &prior, 1.0);
        let four = fit_ridge(
            &vec![vec![1.0], vec![1.0], vec![1.0], vec![1.0]],
            &[1.0, 1.0, 1.0, 1.0],
            &prior,
            1.0,
        );

        assert!(two.residual_l2 < one.residual_l2);
        assert!(four.residual_l2 < two.residual_l2);
    }
}
