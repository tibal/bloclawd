//! Closed-enum mirror of the Worker error envelope (D-73).
//!
//! Wire errors all converge to exit 4. Local-only CLI errors keep their
//! documented exit codes.

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IngestCliError {
    #[error("server rejected proof-of-work, please retry")]
    PowRejected,
    #[error("payload rejected (CLI-Worker schema mismatch - please file an issue)")]
    SchemaMismatch,
    #[error("payload too large (please file an issue)")]
    BodyTooLarge,
    #[error("rate-limited by ingest, retry in {0}s")]
    RateLimited(u32),
    #[error("server unavailable, please retry")]
    ServerUnavailable,
    #[error("PoW solve timed out at K=22 (30s)")]
    PowTimeout,
    #[error("no events found in window")]
    NoEvents,
    #[error("user error: {0}")]
    UserError(String),
}

impl IngestCliError {
    pub fn exit_code(&self) -> i32 {
        match self {
            IngestCliError::UserError(_) => 1,
            IngestCliError::NoEvents => 2,
            IngestCliError::PowTimeout => 3,
            IngestCliError::PowRejected
            | IngestCliError::SchemaMismatch
            | IngestCliError::BodyTooLarge
            | IngestCliError::RateLimited(_)
            | IngestCliError::ServerUnavailable => 4,
        }
    }
}

pub fn from_wire(error_code: &str, body: &serde_json::Value) -> IngestCliError {
    match error_code {
        "signature_invalid"
        | "challenge_expired"
        | "clock_skew"
        | "payload_hash_mismatch"
        | "pow_invalid" => IngestCliError::PowRejected,
        "bad_json" | "enum_invalid" | "unknown_field" | "version_invalid"
        | "token_out_of_range" => IngestCliError::SchemaMismatch,
        "body_too_large" => IngestCliError::BodyTooLarge,
        "rate_limited" => IngestCliError::RateLimited(
            body.get("retry_after_s")
                .and_then(|v| v.as_u64())
                .and_then(|n| u32::try_from(n).ok())
                .unwrap_or(60),
        ),
        "server_unavailable" | "internal" => IngestCliError::ServerUnavailable,
        _ => IngestCliError::ServerUnavailable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pow_rejected_maps_signature_invalid() {
        assert_eq!(
            from_wire("signature_invalid", &json!({})),
            IngestCliError::PowRejected
        );
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
        assert_eq!(
            from_wire("body_too_large", &json!({})),
            IngestCliError::BodyTooLarge
        );
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
            assert_eq!(
                from_wire(code, &json!({})),
                IngestCliError::ServerUnavailable
            );
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
