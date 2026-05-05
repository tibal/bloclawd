//! HTTP client plus GET /challenge and POST /event glue.
//!
//! This module sends one event per call. The CLI orchestration layer handles
//! all per-model events for one invocation.

use std::time::Duration;

use anyhow::{Context, Result};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bloclawd_pow::{ChallengeId, Nonce, Sig};
use bloclawd_schema::{EventPayload, LimitType, SubmittedEvent};
use reqwest::StatusCode;
use reqwest::header::CONTENT_TYPE;

use crate::api::{challenge_endpoint, event_endpoint};
use crate::wire_error::{IngestCliError, from_wire};

pub fn user_agent() -> &'static str {
    concat!("bloclawd/", env!("CARGO_PKG_VERSION"))
}

pub fn http_client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(user_agent())
        .timeout(Duration::from_secs(30))
        .https_only(true)
        .build()
        .context("build bloclawd ingest HTTP client")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChallengeResponse {
    pub challenge_id: ChallengeId,
    pub sig: Sig,
    pub difficulty: u32,
    pub expires_in: u32,
    pub challenge_id_b64: String,
    pub sig_b64: String,
}

pub fn fetch_challenge(
    client: &reqwest::blocking::Client,
) -> Result<ChallengeResponse, IngestCliError> {
    let resp = client
        .get(challenge_endpoint())
        .send()
        .map_err(|_| IngestCliError::ServerUnavailable)?;
    let status = resp.status();
    let body = response_body_json(resp);
    if status.is_success() {
        parse_challenge_body(&body)
    } else {
        Err(error_from_body(&body))
    }
}

pub fn parse_challenge_body(body: &serde_json::Value) -> Result<ChallengeResponse, IngestCliError> {
    let challenge_id_b64 = string_field(body, "challenge_id")?.to_string();
    let sig_b64 = string_field(body, "sig")?.to_string();
    let difficulty = u32_field(body, "difficulty")?;
    let expires_in = u32_field(body, "expires_in")?;
    let challenge_id = ChallengeId(decode_fixed(&challenge_id_b64)?);
    let sig = Sig(decode_fixed(&sig_b64)?);

    Ok(ChallengeResponse {
        challenge_id,
        sig,
        difficulty,
        expires_in,
        challenge_id_b64,
        sig_b64,
    })
}

pub fn build_submit_body(
    event_id_b64: &str,
    challenge_id_b64: &str,
    sig_b64: &str,
    nonce: &Nonce,
    submission_group_id_b64: &str,
    limit_type: LimitType,
    payload: EventPayload,
) -> SubmittedEvent {
    SubmittedEvent {
        event_id: event_id_b64.to_string(),
        challenge_id: challenge_id_b64.to_string(),
        sig: sig_b64.to_string(),
        nonce: URL_SAFE_NO_PAD.encode(nonce.0),
        submission_group_id: submission_group_id_b64.to_string(),
        limit_type,
        payload,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventOk {
    pub bucket_ts: String,
}

pub fn post_event(
    client: &reqwest::blocking::Client,
    body: &SubmittedEvent,
) -> Result<EventOk, IngestCliError> {
    let resp = client
        .post(event_endpoint())
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(body).map_err(|_| IngestCliError::ServerUnavailable)?)
        .send()
        .map_err(|_| IngestCliError::ServerUnavailable)?;
    let status = resp.status();
    let body = response_body_json(resp);
    parse_event_response(status, body)
}

pub fn parse_event_response(
    status: StatusCode,
    body: serde_json::Value,
) -> Result<EventOk, IngestCliError> {
    if status.is_success() {
        let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
        let bucket_ts = body
            .get("bucket_ts")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or(IngestCliError::ServerUnavailable)?;
        if ok {
            Ok(EventOk {
                bucket_ts: bucket_ts.to_string(),
            })
        } else {
            Err(IngestCliError::ServerUnavailable)
        }
    } else {
        Err(error_from_body(&body))
    }
}

fn string_field<'a>(body: &'a serde_json::Value, field: &str) -> Result<&'a str, IngestCliError> {
    body.get(field)
        .and_then(|v| v.as_str())
        .ok_or(IngestCliError::ServerUnavailable)
}

fn u32_field(body: &serde_json::Value, field: &str) -> Result<u32, IngestCliError> {
    body.get(field)
        .and_then(|v| v.as_u64())
        .and_then(|n| u32::try_from(n).ok())
        .ok_or(IngestCliError::ServerUnavailable)
}

fn decode_fixed<const N: usize>(b64: &str) -> Result<[u8; N], IngestCliError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(b64)
        .map_err(|_| IngestCliError::ServerUnavailable)?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| IngestCliError::ServerUnavailable)
}

fn error_from_body(body: &serde_json::Value) -> IngestCliError {
    let code = body
        .get("error")
        .and_then(|v| v.as_str())
        .unwrap_or("server_unavailable");
    from_wire(code, body)
}

fn response_body_json(resp: reqwest::blocking::Response) -> serde_json::Value {
    let text = resp.text().unwrap_or_default();
    serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use bloclawd_pow::{ChallengeId, Nonce, Sig};
    use bloclawd_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};
    use reqwest::StatusCode;
    use serde_json::json;

    fn sample_payload() -> EventPayload {
        EventPayload {
            v: 1,
            model: Model::Gpt55,
            tier: Tier::Max20,
            harness: Harness::Codex,
            region: Region::Na,
            tokens: TokenCounts {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 0,
                ephemeral_5m_input_tokens: 0,
                ephemeral_1h_input_tokens: 0,
                cached_input_tokens: 300,
                reasoning_output_tokens: 20,
            },
        }
    }

    #[test]
    fn http_client_rejects_plain_http() {
        let client = http_client().expect("client builds");
        client
            .get("http://example.com")
            .send()
            .expect_err("plain http rejected before network");
    }

    #[test]
    #[ignore = "In-process fixture coverage owns the full CLI path; this keeps the client-level scheme test documented"]
    fn cli_plain_http_orchestration_smoke() {}

    #[test]
    fn user_agent_contains_cli_version() {
        assert_eq!(
            user_agent(),
            concat!("bloclawd/", env!("CARGO_PKG_VERSION"))
        );
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
            LimitType::FiveH,
            sample_payload(),
        );
        let value = serde_json::to_value(&body).expect("SubmittedEvent serializes");
        assert_eq!(value["submission_group_id"], "group");
        assert_eq!(value["limit_type"], "5h");
        assert!(value["payload"].get("submission_group_id").is_none());
        assert!(value["payload"].get("limit_type").is_none());
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
