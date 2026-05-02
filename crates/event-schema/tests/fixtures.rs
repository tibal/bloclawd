//! Shared sample EventPayload fixture for testing.
//!
//! Per RESEARCH Discretion 13: the canonical "sample event" used by
//! integration tests across the workspace. Phase 2's apps/worker/tests/e2e_staging.rs
//! imports this file as a path module so the deployed staging proof and
//! event-schema fixture tests share the same helper without adding a separate
//! test-support crate.
//!
//! Constraint (Assumption A5 in RESEARCH): canonical_bytes(payload) MUST be
//! < 4 KB so the test stays well under the 8 KB POST /event body cap (D-42)
//! after envelope fields (event_id, challenge_id, sig, nonce all base64url
//! ~22 + 43 + 43 + 11 = ~119 bytes plus JSON overhead).

use event_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts, canonical_bytes};

/// Canonical sample EventPayload for integration tests.
/// Wire-valid (v=1, closed-enum values, token bounds satisfied).
pub fn sample_event_payload() -> EventPayload {
    EventPayload {
        v: 1,
        model: Model::ClaudeSonnet45,
        tier: Tier::Pro,
        harness: Harness::ClaudeCode,
        region: Region::Na,
        tokens: sample_token_counts(),
    }
}

/// Sample TokenCounts within INGE-07 bounds (each field <= TOKEN_COUNT_MAX).
pub fn sample_token_counts() -> TokenCounts {
    TokenCounts {
        input_5min: 12_345,
        output_5min: 6_789,
        cached_read_5min: 1_000,
        cached_write_5min: 500,
        input_5h: 123_456,
        output_5h: 67_890,
        cached_read_5h: 10_000,
        cached_write_5h: 5_000,
    }
}

#[test]
fn sample_payload_validates() {
    let p = sample_event_payload();
    p.validate()
        .expect("sample must satisfy INGE-07 bounds + v == 1");
}

#[test]
fn sample_payload_canonicalizes_under_4kb() {
    let p = sample_event_payload();
    let bytes = canonical_bytes(&p).expect("sample must canonicalize");
    assert!(
        bytes.len() < 4 * 1024,
        "sample canonical bytes = {} (must be < 4096 to leave 4KB margin under 8KB cap)",
        bytes.len()
    );
}

#[test]
fn sample_payload_round_trips_through_serde() {
    let p = sample_event_payload();
    let json = serde_json::to_string(&p).expect("serialize");
    let back: EventPayload = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(p.v, back.v);
    assert_eq!(p.tokens.input_5min, back.tokens.input_5min);
}
