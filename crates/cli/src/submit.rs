use event_schema::SubmittedEvent;

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use event_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};
    use pow::{ChallengeId, Nonce, Sig};
    use reqwest::StatusCode;
    use serde_json::json;

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

    #[test]
    fn http_client_rejects_plain_http() {
        let client = http_client().expect("client builds");
        let err = client
            .get("http://example.com")
            .send()
            .expect_err("plain http rejected before network");
        let msg = err.to_string().to_lowercase();
        assert!(msg.contains("https") || msg.contains("scheme"));
    }

    #[test]
    #[ignore = "Plan 07 wires in-process run with fixtures; client-level scheme test is mandatory here"]
    fn cli_plain_http_orchestration_smoke() {}

    #[test]
    fn user_agent_contains_cli_version() {
        assert_eq!(user_agent(), concat!("bloclawd-cli/", env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn challenge_response_parses_documented_shape() {
        let cid_b64 = URL_SAFE_NO_PAD.encode([1_u8; 32]);
        let sig_b64 = URL_SAFE_NO_PAD.encode([2_u8; 32]);
        let parsed = parse_challenge_body(&json!({
            "challenge_id": cid_b64,
            "sig": sig_b64,
            "difficulty": 22,
            "expires_in": 60
        }))
        .expect("challenge parses");

        assert_eq!(parsed.challenge_id, ChallengeId([1_u8; 32]));
        assert_eq!(parsed.sig, Sig([2_u8; 32]));
        assert_eq!(parsed.difficulty, 22);
        assert_eq!(parsed.expires_in, 60);
        assert_eq!(parsed.challenge_id_b64, cid_b64);
        assert_eq!(parsed.sig_b64, sig_b64);
    }

    #[test]
    fn challenge_response_missing_field_is_server_unavailable() {
        let err = parse_challenge_body(&json!({ "challenge_id": "x" }))
            .expect_err("malformed body rejected");
        assert_eq!(err, crate::IngestCliError::ServerUnavailable);
    }

    #[test]
    fn submit_body_places_group_id_at_top_level() {
        let body = build_submit_body(
            "event",
            "challenge",
            "sig",
            &Nonce([3_u8; 8]),
            "group",
            sample_payload(),
        );
        let value = serde_json::to_value(&body).expect("SubmittedEvent serializes");
        assert_eq!(value["submission_group_id"], "group");
        assert!(value["payload"].get("submission_group_id").is_none());
    }

    #[test]
    fn event_success_response_parses_bucket_ts() {
        let ok = parse_event_response(
            StatusCode::OK,
            json!({ "ok": true, "bucket_ts": "2026-05-01T00:00:00Z" }),
        )
        .expect("success parses");
        assert_eq!(ok.bucket_ts, "2026-05-01T00:00:00Z");
    }

    #[test]
    fn event_bad_json_response_maps_schema_mismatch() {
        let err = parse_event_response(StatusCode::BAD_REQUEST, json!({ "error": "bad_json" }))
            .expect_err("wire error maps");
        assert_eq!(err, crate::IngestCliError::SchemaMismatch);
    }

    #[test]
    fn event_rate_limit_response_extracts_retry_after() {
        let err = parse_event_response(
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "error": "rate_limited", "retry_after_s": 7 }),
        )
        .expect_err("rate limit maps");
        assert_eq!(err, crate::IngestCliError::RateLimited(7));
    }
}
