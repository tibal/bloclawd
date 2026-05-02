//! Powers-of-2 log bins for token counts (D-96).
//!
//! Edges are inlined into each top-level R2 file (D-94) so files are
//! self-contained for offline analysis -- the SPA reads `bin_edges` from
//! the JSON rather than from a TS-side constant. This crate-side module
//! is the single source of truth used by the cron percentile encoder.
//!
//! Audited in PR; changing edges is a public R2 schema break.
//! No ts-rs binding emitted -- see PATTERNS.md "No LogBins.ts" rationale.

/// 19 edges from 2^10 (1 KiB) to 2^28 (~268M tokens).
pub const EDGES: [u64; 19] = [
    1 << 10,
    1 << 11,
    1 << 12,
    1 << 13,
    1 << 14,
    1 << 15,
    1 << 16,
    1 << 17,
    1 << 18,
    1 << 19,
    1 << 20,
    1 << 21,
    1 << 22,
    1 << 23,
    1 << 24,
    1 << 25,
    1 << 26,
    1 << 27,
    1 << 28,
];

/// Returns the bin index `i` such that `EDGES[i] <= value < EDGES[i+1]`.
/// Values below the first edge clamp to `0`; values above the final edge
/// clamp to `EDGES.len() - 1`.
pub fn bin_index(value: u64) -> u8 {
    if value < EDGES[0] {
        return 0;
    }

    let mut idx: usize = 0;
    for (k, &edge) in EDGES.iter().enumerate() {
        if value >= edge {
            idx = k;
        } else {
            break;
        }
    }

    idx.min(EDGES.len() - 1) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bin_index_below_bottom_clamps_to_zero() {
        assert_eq!(bin_index(0), 0);
        assert_eq!(bin_index(500), 0);
        assert_eq!(bin_index(1023), 0);
    }

    #[test]
    fn bin_index_at_exact_edges_is_left_closed() {
        assert_eq!(bin_index(1024), 0);
        assert_eq!(bin_index(2048), 1);
        assert_eq!(bin_index(1 << 28), 18);
    }

    #[test]
    fn bin_index_within_bins() {
        assert_eq!(bin_index(1500), 0);
        assert_eq!(bin_index(3000), 1);
        assert_eq!(bin_index(1_000_000), 9);
    }

    #[test]
    fn bin_index_above_top_clamps_to_18() {
        assert_eq!(bin_index(1_u64 << 30), 18);
        assert_eq!(bin_index(u64::MAX), 18);
    }

    #[test]
    fn edges_are_strictly_ascending() {
        assert!(EDGES.windows(2).all(|w| w[0] < w[1]));
    }
}
