#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IngestCliError {
    #[error("payload rejected (CLI-Worker schema mismatch - please file an issue)")]
    SchemaMismatch,
    #[error("server unavailable, please retry")]
    ServerUnavailable,
    #[error("PoW solve timed out at K=22 (30s)")]
    PowTimeout,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pow_rejected_maps_signature_invalid() {
        assert_eq!(from_wire("signature_invalid", &json!({})), IngestCliError::PowRejected);
    }

    #[test]
    fn pow_rejected_covers_all_pow_codes() {
        for code in [
            "challenge_expired",
            "clock_skew",
            "payload_hash_mismatch",
            "pow_invalid",
        ] {
            assert_eq!(from_wire(code, &json!({})), IngestCliError::PowRejected);
        }
    }

    #[test]
    fn schema_mismatch_covers_schema_codes() {
        for code in [
            "bad_json",
            "enum_invalid",
            "unknown_field",
            "version_invalid",
            "token_out_of_range",
        ] {
            assert_eq!(from_wire(code, &json!({})), IngestCliError::SchemaMismatch);
        }
    }

    #[test]
    fn body_too_large_maps() {
        assert_eq!(from_wire("body_too_large", &json!({})), IngestCliError::BodyTooLarge);
    }

    #[test]
    fn rate_limited_extracts_retry_after_s() {
        assert_eq!(
            from_wire("rate_limited", &json!({ "retry_after_s": 42 })),
            IngestCliError::RateLimited(42)
        );
    }

    #[test]
    fn rate_limited_defaults_to_60() {
        assert_eq!(
            from_wire("rate_limited", &json!({})),
            IngestCliError::RateLimited(60)
        );
    }

    #[test]
    fn server_unavailable_covers_server_codes_and_unknown() {
        for code in ["server_unavailable", "internal", "future_thing"] {
            assert_eq!(from_wire(code, &json!({})), IngestCliError::ServerUnavailable);
        }
    }

    #[test]
    fn exit_codes_match_documented_values() {
        assert_eq!(IngestCliError::UserError("bad flag".into()).exit_code(), 1);
        assert_eq!(IngestCliError::NoEvents.exit_code(), 2);
        assert_eq!(IngestCliError::PowTimeout.exit_code(), 3);
        assert_eq!(IngestCliError::PowRejected.exit_code(), 4);
        assert_eq!(IngestCliError::SchemaMismatch.exit_code(), 4);
        assert_eq!(IngestCliError::BodyTooLarge.exit_code(), 4);
        assert_eq!(IngestCliError::RateLimited(1).exit_code(), 4);
        assert_eq!(IngestCliError::ServerUnavailable.exit_code(), 4);
    }

    #[test]
    fn pow_timeout_exit_code_is_3_not_4() {
        assert_eq!(IngestCliError::PowTimeout.exit_code(), 3);
    }
}
