use event_schema::EventPayload;

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use event_schema::{Harness, Model, Region, Tier, TokenCounts};
    use pow::ChallengeId;
    use std::time::Instant;

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::ClaudeSonnet45,
            tier: Tier::Max20,
            harness: Harness::ClaudeCode,
            region: Region::Na,
            tokens: TokenCounts {
                input_5min: 1,
                output_5min: 2,
                cached_read_5min: 3,
                cached_write_5min: 4,
                input_5h: 5,
                output_5h: 6,
                cached_read_5h: 7,
                cached_write_5h: 8,
            },
        }
    }

    #[test]
    fn solve_for_payload_finds_nonce_at_k22() {
        let payload = sample_payload();
        let cid = ChallengeId([0_u8; 32]);
        let (nonce, payload_hash) =
            solve_for_payload(&payload, &cid).expect("PoW solves within timeout");
        let hash = pow::pow_hash(&cid, &payload_hash, &nonce);
        assert!(pow::leading_zero_bits(&hash) >= pow::K_V1);
    }

    #[test]
    fn expired_deadline_returns_pow_timeout() {
        let payload = sample_payload();
        let cid = ChallengeId([0_u8; 32]);
        let err = solve_for_payload_with_deadline(&payload, &cid, Instant::now())
            .expect_err("expired deadline rejects");
        assert_eq!(err, crate::IngestCliError::PowTimeout);
    }

    #[test]
    fn decode_challenge_id_accepts_base64url_32_bytes() {
        let encoded = URL_SAFE_NO_PAD.encode([9_u8; 32]);
        let cid = decode_challenge_id(&encoded).expect("valid challenge id");
        assert_eq!(cid, ChallengeId([9_u8; 32]));
    }

    #[test]
    fn decode_challenge_id_rejects_malformed_base64() {
        let err = decode_challenge_id("not@@base64").expect_err("invalid base64 rejects");
        assert_eq!(err, crate::IngestCliError::ServerUnavailable);
    }
}
