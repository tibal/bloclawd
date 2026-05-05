//! Shared sample EventPayload fixture for testing.
//!
//! Canonical "sample event" used by integration tests across the workspace.
//! apps/worker/tests/e2e_staging.rs imports this file as a path module so the
//! deployed staging proof and event-schema fixture tests share the same helper
//! without adding a separate test-support crate.
//!
//! Constraint: canonical_bytes(payload) MUST be < 4 KB so the test stays well
//! under the 8 KB POST /event body cap after envelope fields (event_id,
//! challenge_id, sig, nonce all base64url ~22 + 43 + 43 + 11 = ~119 bytes plus
//! JSON overhead).

use bloclawd_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts, canonical_bytes};

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

/// Sample TokenCounts within accepted bounds (each field <= TOKEN_COUNT_MAX).
pub fn sample_token_counts() -> TokenCounts {
    TokenCounts {
        input_tokens: 123_456,
        output_tokens: 67_890,
        cache_read_input_tokens: 10_000,
        ephemeral_5m_input_tokens: 3_000,
        ephemeral_1h_input_tokens: 2_000,
        cached_input_tokens: 0,
        reasoning_output_tokens: 0,
    }
}

#[test]
fn sample_payload_validates() {
    let p = sample_event_payload();
    p.validate()
        .expect("sample must satisfy token bounds + v == 1");
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
    assert_eq!(p.tokens.input_tokens, back.tokens.input_tokens);
}
