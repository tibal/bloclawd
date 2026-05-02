use event_schema::{EventPayload, SubmittedEvent};

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
        let envelope = SubmittedEvent {
            event_id: "event".into(),
            challenge_id: "challenge".into(),
            sig: "sig".into(),
            nonce: "nonce".into(),
            submission_group_id: group_value.into(),
            payload,
        };

        let canonical = canonicalize(&envelope.payload).expect("canonicalize payload");
        let canonical = String::from_utf8(canonical).expect("canonical JSON is UTF-8");
        let key = ["submission", "group", "id"].join("_");
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
