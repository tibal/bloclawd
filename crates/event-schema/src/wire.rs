//! Wire body for POST /event (D-54).
//!
//! `SubmittedEvent` wraps `EventPayload` plus per-event identifiers and the
//! per-INVOCATION `submission_group_id` (D-51). The id is a TRANSPORT field:
//! it is NOT inside `payload` (D-52), NOT JCS-canonicalized, NOT bound into
//! the 72-byte PoW input. The Worker reads it from the wire body, validates
//! UUIDv4 format, persists it on the row, and the Phase 4 cron strips it
//! before any R2 emission (D-56).

use crate::EventPayload;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(deny_unknown_fields)]
pub struct SubmittedEvent {
    pub event_id: String,            // base64url no-padding UUIDv4
    pub challenge_id: String,        // base64url no-padding 32 bytes
    pub sig: String,                 // base64url no-padding HMAC-SHA256 32 bytes
    pub nonce: String,               // base64url no-padding 8 bytes
    pub submission_group_id: String, // base64url no-padding UUIDv4 (D-51)
    pub payload: EventPayload,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Harness, Model, Region, Tier, TokenCounts, canonical_bytes};

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::Gpt55,
            tier: Tier::Max20,
            harness: Harness::Codex,
            region: Region::Na,
            tokens: TokenCounts {
                input_5min: 10,
                output_5min: 20,
                cached_read_5min: 30,
                cached_write_5min: 0,
                input_5h: 100,
                output_5h: 200,
                cached_read_5h: 300,
                cached_write_5h: 0,
            },
        }
    }

    fn sample_submitted_event() -> SubmittedEvent {
        SubmittedEvent {
            event_id: "AAA".into(),
            challenge_id: "BBB".into(),
            sig: "CCC".into(),
            nonce: "DDD".into(),
            submission_group_id: "EEE".into(),
            payload: sample_payload(),
        }
    }

    #[test]
    fn submitted_event_roundtrips_json() {
        let envelope = sample_submitted_event();
        let encoded = serde_json::to_string(&envelope).unwrap();
        let decoded: SubmittedEvent = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded, envelope);
    }

    #[test]
    fn submitted_event_rejects_unknown_top_level_fields() {
        let raw = serde_json::json!({
            "event_id": "AAA",
            "challenge_id": "BBB",
            "sig": "CCC",
            "nonce": "DDD",
            "submission_group_id": "EEE",
            "payload": sample_payload(),
            "extra": "x"
        });
        let err = serde_json::from_value::<SubmittedEvent>(raw).unwrap_err();
        assert!(err.to_string().contains("unknown field"));
        assert!(err.to_string().contains("extra"));
    }

    #[test]
    fn submission_group_id_stays_out_of_payload_canonical_bytes() {
        let envelope = sample_submitted_event();
        let canonical = canonical_bytes(&envelope.payload).unwrap();
        let canonical = String::from_utf8(canonical).unwrap();
        assert!(!canonical.contains("submission_group_id"));
    }

    #[test]
    fn submission_group_id_serializes_between_nonce_and_payload() {
        let envelope = sample_submitted_event();
        let encoded = serde_json::to_string(&envelope).unwrap();
        let nonce_idx = encoded.find(r#""nonce""#).unwrap();
        let group_idx = encoded.find(r#""submission_group_id""#).unwrap();
        let payload_idx = encoded.find(r#""payload""#).unwrap();

        assert!(nonce_idx < group_idx);
        assert!(group_idx < payload_idx);
    }
}
