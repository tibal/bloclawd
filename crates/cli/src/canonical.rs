//! Single canonical formatter.
//!
//! All CLI paths that need EventPayload bytes call this module. Dry-run output
//! and PoW input binding must use the same byte source.
//!
//! Never implement JCS here. Delegate to the shared event-schema helper.
//!
//! Note: `limit_type` is a wire-envelope field and MUST NOT
//! enter JCS canonical payload bytes. The `EventPayload` parameter enforces
//! this at the type level.

use anyhow::{Context, Result};
use event_schema::EventPayload;
use sha2::{Digest, Sha256};

pub fn canonicalize(payload: &EventPayload) -> Result<Vec<u8>> {
    event_schema::canonical_bytes(payload).context("canonicalize EventPayload with shared JCS")
}

pub fn payload_hash(canonical: &[u8]) -> [u8; 32] {
    Sha256::digest(canonical).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_schema::{Harness, Model, Region, Tier, TokenCounts};

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::ClaudeSonnet45,
            tier: Tier::Max20,
            harness: Harness::ClaudeCode,
            region: Region::Na,
            tokens: TokenCounts {
                input_5min: 11,
                output_5min: 22,
                cached_read_5min: 33,
                cached_write_5min: 44,
                input_5h: 111,
                output_5h: 222,
                cached_read_5h: 333,
                cached_write_5h: 444,
            },
        }
    }

    #[test]
    fn canonicalize_matches_event_schema_bytes() {
        let payload = sample_payload();
        let got = canonicalize(&payload).expect("canonicalize payload");
        let expected = event_schema::canonical_bytes(&payload).expect("event-schema canonicalizes");
        assert_eq!(got, expected);
    }

    #[test]
    fn payload_hash_matches_worker_recompute_path() {
        let payload = sample_payload();
        let canonical = canonicalize(&payload).expect("canonicalize payload");
        let got = payload_hash(&canonical);
        let value = serde_json::to_value(&payload).expect("payload serializes");
        let expected = pow::payload_hash(&value);
        assert_eq!(got, expected.0);
    }

    #[test]
    fn transport_group_id_stays_out_of_payload_bytes() {
        let payload = sample_payload();
        let group_value = "group-value-that-must-not-appear";
        let key = ["submission", "group", "id"].join("_");
        let mut envelope = serde_json::Map::new();
        envelope.insert(key.clone(), serde_json::json!(group_value));
        envelope.insert(
            "payload".into(),
            serde_json::to_value(&payload).expect("payload serializes"),
        );
        assert!(envelope.contains_key(&key));

        let canonical = canonicalize(&payload).expect("canonicalize payload");
        let canonical = String::from_utf8(canonical).expect("canonical JSON is UTF-8");
        assert!(!canonical.contains(&key));
        assert!(!canonical.contains(group_value));
    }

    #[test]
    fn canonicalize_is_deterministic() {
        let payload = sample_payload();
        let first = canonicalize(&payload).expect("first canonicalize");
        let second = canonicalize(&payload).expect("second canonicalize");
        assert_eq!(first, second);
    }
}
