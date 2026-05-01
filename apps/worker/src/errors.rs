//! Phase 2 ingest error envelope helpers.
//!
//! Wire contract:
//! - Envelope is flat: `{"error": "<code>", ...extras}` (D-40).
//! - 14 codes are locked in D-41; each has one HTTP status.
//! - `rate_limited` includes `route`, `retry_after_s`, and a `Retry-After` header.

use serde_json::json;
use thiserror::Error;
use worker::{Response, ResponseBuilder, Result};

#[derive(Debug, Error)]
pub enum IngestError {
    #[error("rate limited on {route}")]
    RateLimited {
        route: &'static str,
        retry_after_s: u32,
    },

    #[error("body too large")]
    BodyTooLarge,

    #[error("bad json")]
    BadJson {
        position: Option<usize>,
        message: Option<String>,
    },

    #[error("invalid enum value")]
    EnumInvalid { field: String },

    #[error("unknown field")]
    UnknownField { field: String },

    #[error("invalid version")]
    VersionInvalid,

    #[error("token field out of range")]
    TokenOutOfRange { field: String },

    #[error("signature invalid")]
    SignatureInvalid,

    #[error("challenge expired")]
    ChallengeExpired,

    #[error("clock skew")]
    ClockSkew,

    #[error("payload hash mismatch")]
    PayloadHashMismatch,

    #[error("pow invalid")]
    PowInvalid,

    #[error("server unavailable")]
    ServerUnavailable,

    #[error("internal")]
    Internal,
}

impl IngestError {
    /// Build the locked flat-envelope JSON response.
    pub fn into_response(self) -> Result<Response> {
        let (status, body) = match &self {
            Self::RateLimited {
                route,
                retry_after_s,
            } => (
                429_u16,
                json!({
                    "error": "rate_limited",
                    "route": route,
                    "retry_after_s": retry_after_s,
                }),
            ),
            Self::BodyTooLarge => (413, json!({ "error": "body_too_large" })),
            Self::BadJson { position, message } => {
                let mut body = json!({ "error": "bad_json" });
                if let Some(p) = position {
                    body["position"] = json!(p);
                }
                if let Some(m) = message {
                    body["message"] = json!(m);
                }
                (400, body)
            }
            Self::EnumInvalid { field } => {
                (400, json!({ "error": "enum_invalid", "field": field }))
            }
            Self::UnknownField { field } => {
                (400, json!({ "error": "unknown_field", "field": field }))
            }
            Self::VersionInvalid => (400, json!({ "error": "version_invalid" })),
            Self::TokenOutOfRange { field } => (
                400,
                json!({ "error": "token_out_of_range", "field": field }),
            ),
            Self::SignatureInvalid => (401, json!({ "error": "signature_invalid" })),
            Self::ChallengeExpired => (401, json!({ "error": "challenge_expired" })),
            Self::ClockSkew => (401, json!({ "error": "clock_skew" })),
            Self::PayloadHashMismatch => (401, json!({ "error": "payload_hash_mismatch" })),
            Self::PowInvalid => (401, json!({ "error": "pow_invalid" })),
            Self::ServerUnavailable => (503, json!({ "error": "server_unavailable" })),
            Self::Internal => (500, json!({ "error": "internal" })),
        };

        let mut builder = ResponseBuilder::new().with_status(status);
        if let Self::RateLimited { retry_after_s, .. } = &self {
            builder = builder.with_header("Retry-After", &retry_after_s.to_string())?;
        }
        builder.from_json(&body)
    }

    /// Map crates/pow verification variants to D-41 ingest error codes.
    pub fn from_verify(e: pow::VerifyError) -> Self {
        match e {
            pow::VerifyError::InvalidSig => Self::SignatureInvalid,
            pow::VerifyError::Expired => Self::ChallengeExpired,
            pow::VerifyError::ClockSkew => Self::ClockSkew,
            pow::VerifyError::PayloadHashMismatch => Self::PayloadHashMismatch,
            pow::VerifyError::PowInsufficient { .. } => Self::PowInvalid,
            pow::VerifyError::MalformedChallenge => Self::Internal,
            pow::VerifyError::InvalidSecret => Self::Internal,
        }
    }

    /// Classify serde_json display prefixes into D-41 ingest error codes.
    pub fn classify_serde_error(e: serde_json::Error) -> Self {
        let msg = e.to_string();
        if msg.starts_with("unknown field") {
            Self::UnknownField {
                field: extract_backticked(&msg).unwrap_or_else(|| "<unknown>".into()),
            }
        } else if msg.starts_with("unknown variant") {
            Self::EnumInvalid {
                field: "unknown".into(),
            }
        } else if msg.contains("invalid value: integer") && msg.contains("expected u8") {
            Self::VersionInvalid
        } else if msg.starts_with("missing field") {
            Self::BadJson {
                position: None,
                message: Some(truncate(&msg, 200)),
            }
        } else {
            Self::BadJson {
                position: None,
                message: Some(truncate(&msg, 200)),
            }
        }
    }
}

fn extract_backticked(msg: &str) -> Option<String> {
    let start = msg.find('`')? + 1;
    let rest = &msg[start..];
    let end = rest.find('`')?;
    Some(rest[..end].to_string())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut idx = max;
        while !s.is_char_boundary(idx) && idx > 0 {
            idx -= 1;
        }
        s[..idx].to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    #[allow(dead_code)]
    struct EnumCarrier {
        model: DemoEnum,
    }

    #[derive(Debug, Deserialize)]
    enum DemoEnum {
        #[serde(rename = "known")]
        Known,
    }

    #[test]
    fn extract_backticked_finds_first_token() {
        assert_eq!(
            extract_backticked("unknown field `extra`, expected one of `v`, `model`"),
            Some("extra".to_string())
        );
    }

    #[test]
    fn truncate_handles_short_string() {
        assert_eq!(truncate("hi", 200), "hi");
    }

    #[test]
    fn truncate_caps_long_string() {
        let long = "x".repeat(500);
        let truncated = truncate(&long, 200);
        assert_eq!(truncated.len(), 200);
    }

    #[test]
    fn classify_unknown_variant_does_not_echo_value() {
        let err =
            serde_json::from_str::<EnumCarrier>(r#"{ "model": "attacker-value" }"#).unwrap_err();
        match IngestError::classify_serde_error(err) {
            IngestError::EnumInvalid { field } => assert_eq!(field, "unknown"),
            other => panic!("expected enum_invalid, got {other:?}"),
        }
    }
}
