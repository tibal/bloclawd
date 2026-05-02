#[cfg(test)]
mod tests {
    use crate::{
        EventPayload, Harness, Model, Region, Tier, TokenCounts, canonical_bytes,
    };

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::Gpt55,
            tier: Tier::ProCodex,
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
