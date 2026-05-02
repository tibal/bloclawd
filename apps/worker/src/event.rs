//! POST /event - full ingest validation chain and idempotent INSERT.
//!
//! Locked validation order (D-43 - DO NOT REORDER):
//! 1. RL_EVENT rate-limit -> 429 rate_limited
//! 2. Body size cap -> 413 body_too_large
//! 3. serde_json::from_slice -> WireRequest -> 400 bad_json
//! 4. serde_json::from_value -> EventPayload -> 400 enum_invalid | unknown_field | version_invalid
//! 5. EventPayload bound validation -> 400 token_out_of_range | version_invalid
//! 6. HMAC-SHA256 sig verify, folded into pow -> 401 signature_invalid
//! 7. Expiry + clock-skew check, folded into pow -> 401 challenge_expired | clock_skew
//! 8. payload_hash recompute from canonical payload (INGE-04, INGE-09) -> 401 payload_hash_mismatch
//! 9. PoW K=22 over the locked 72-byte input -> 401 pow_invalid
//! 10. INSERT ... ON CONFLICT DO UPDATE RETURNING -> 503 server_unavailable | 200 {ok, bucket_ts}
//!
//! D-47 requires the same success body shape for fresh inserts and silent duplicates.
//! INGE-11: no event_id, nonce, sig, payload_hash, IP, secret, or per-event timing logs.

use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use event_schema::{SubmittedEvent, canonical_bytes};
use pow::{ChallengeId, K_V1, Nonce, Sig, VerifyRequest};
use serde::de::IntoDeserializer;
use serde_json::json;
use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use tokio_postgres::types::Type;
use uuid::{Uuid, Variant, Version};
use worker::{Date, Hyperdrive, Request, Response, Result, RouteContext};

use crate::body::{self, BODY_CAP_EVENT};
use crate::errors::IngestError;
use crate::ratelimit;
use crate::secret;

type WireRequest = SubmittedEvent;

pub async fn handle_event(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    // Step 1: RL_EVENT rate-limit (INGE-10).
    if let Err(e) = ratelimit::check(&req, &ctx.env, "RL_EVENT", "event").await {
        return e.into_response();
    }

    // Step 2: 8 KB body cap (D-42).
    let body_bytes = match body::read_capped(&mut req, BODY_CAP_EVENT).await {
        Ok(b) => b,
        Err(e) => return e.into_response(),
    };

    // Step 3: parse JSON body (D-43.3).
    let wire_value: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(e) => {
            return IngestError::BadJson {
                position: Some(e.column()),
                message: Some(truncate(&e.to_string(), 200)),
            }
            .into_response();
        }
    };

    // Step 4: typed wire + payload deserialize (closed enum plus deny_unknown_fields).
    let deser = wire_value.into_deserializer();
    let wire: WireRequest = match serde_path_to_error::deserialize(deser) {
        Ok(v) => v,
        Err(e) => {
            let msg = e.inner().to_string();
            if msg.starts_with("unknown variant") {
                let field = enum_invalid_field(&e.path().to_string());
                return IngestError::EnumInvalid { field }.into_response();
            }
            return IngestError::classify_serde_error(e.into_inner()).into_response();
        }
    };
    let payload = wire.payload.clone();
    let payload_value = match serde_json::to_value(&payload) {
        Ok(v) => v,
        Err(e) => {
            return IngestError::BadJson {
                position: None,
                message: Some(truncate(&e.to_string(), 200)),
            }
            .into_response();
        }
    };

    // Step 5: payload bounds and version.
    if let Err(msg) = payload.validate() {
        let err = if msg.starts_with("unsupported v:") {
            IngestError::VersionInvalid
        } else {
            let field = extract_validate_field(&msg);
            IngestError::TokenOutOfRange { field }
        };
        return err.into_response();
    }

    // Steps 6-9: decode crypto fields, validate wire UUIDs, verify PoW.
    let cid_bytes: [u8; 32] = match decode_fixed(&wire.challenge_id) {
        Some(b) => b,
        None => return IngestError::SignatureInvalid.into_response(),
    };
    let sig_bytes: [u8; 32] = match decode_fixed(&wire.sig) {
        Some(b) => b,
        None => return IngestError::SignatureInvalid.into_response(),
    };
    let nonce_bytes: [u8; 8] = match decode_fixed(&wire.nonce) {
        Some(b) => b,
        None => return IngestError::PowInvalid.into_response(),
    };
    let event_id = match parse_wire_uuid_v4(&wire.event_id) {
        Ok(u) => u,
        Err(e) => return e.into_response(),
    };
    let submission_group_id = match parse_wire_uuid_v4(&wire.submission_group_id) {
        Ok(u) => u,
        Err(e) => return e.into_response(),
    };

    let _canonical_payload_bytes = match canonical_bytes(&payload) {
        Ok(bytes) => bytes,
        Err(e) => {
            return IngestError::BadJson {
                position: None,
                message: Some(truncate(&e.to_string(), 200)),
            }
            .into_response();
        }
    };
    let payload_hash_recomputed = pow::payload_hash(&payload_value);

    let secret = match secret::worker_secret(&ctx.env) {
        Ok(secret) => secret,
        Err(e) => return e.into_response(),
    };

    let now_ms = Date::now().as_millis();
    let cid = ChallengeId(cid_bytes);
    let sig = Sig(sig_bytes);
    let nonce = Nonce(nonce_bytes);
    let verify_req = VerifyRequest {
        secret: secret.as_bytes(),
        challenge_id: &cid,
        sig: &sig,
        payload: &payload_value,
        claimed_payload_hash: &payload_hash_recomputed,
        nonce: &nonce,
        difficulty: K_V1,
        now_ms,
    };
    if let Err(e) = pow::verify(verify_req) {
        return IngestError::from_verify(e).into_response();
    }

    let model_str = enum_to_wire(&payload.model);
    let tier_str = enum_to_wire(&payload.tier);
    let harness_str = enum_to_wire(&payload.harness);
    let region_str = enum_to_wire(&payload.region);

    let bucket_ts = match insert_event(
        &ctx.env,
        event_id,
        submission_group_id,
        &payload_value,
        &model_str,
        &tier_str,
        &harness_str,
        &region_str,
    )
    .await
    {
        Ok(t) => t,
        Err(_) => return IngestError::ServerUnavailable.into_response(),
    };

    Response::from_json(&json!({
        "ok": true,
        "bucket_ts": bucket_ts,
    }))
}

const INSERT_EVENT_SQL: &str = r#"
            INSERT INTO events
                (event_id, submission_group_id, bucket_ts, payload, model, tier, harness, region)
            VALUES
                ($1::uuid, $2::uuid, date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz),
                 $3::jsonb, $4::text, $5::text, $6::text, $7::text)
            ON CONFLICT (event_id) DO UPDATE SET event_id = events.event_id
            RETURNING bucket_ts
            "#;

async fn insert_event(
    env: &worker::Env,
    event_id: Uuid,
    submission_group_id: Uuid,
    payload: &serde_json::Value,
    model: &str,
    tier: &str,
    harness: &str,
    region: &str,
) -> std::result::Result<String, Box<dyn std::error::Error>> {
    let hyperdrive = env.get_binding::<Hyperdrive>("DB")?;
    let conn_string = hyperdrive.connection_string();
    let socket = hyperdrive.connect()?;
    let config = PgConfig::from_str(&conn_string)?;
    let (client, connection) = config.connect_raw(socket, NoTls).await?;
    wasm_bindgen_futures::spawn_local(async move {
        if connection.await.is_err() {
            worker::console_log!("pg connection task ended");
        }
    });

    let row = client
        .query_typed_one(
            INSERT_EVENT_SQL,
            &[
                (&event_id, Type::UUID),
                (&submission_group_id, Type::UUID),
                (&payload, Type::JSONB),
                (&model, Type::TEXT),
                (&tier, Type::TEXT),
                (&harness, Type::TEXT),
                (&region, Type::TEXT),
            ],
        )
        .await?;

    let bucket_ts: SystemTime = row.get("bucket_ts");
    let formatted = format_rfc3339(&bucket_ts);
    drop(client);
    Ok(formatted)
}

fn parse_wire_uuid_v4(s: &str) -> std::result::Result<Uuid, IngestError> {
    let bytes: [u8; 16] = decode_fixed(s).ok_or_else(malformed_uuid_error)?;
    let uuid = Uuid::from_slice(&bytes).map_err(|_| malformed_uuid_error())?;
    if uuid.get_variant() != Variant::RFC4122 || uuid.get_version() != Some(Version::Random) {
        return Err(malformed_uuid_error());
    }
    Ok(uuid)
}

fn malformed_uuid_error() -> IngestError {
    IngestError::BadJson {
        position: None,
        message: None,
    }
}

fn decode_fixed<const N: usize>(s: &str) -> Option<[u8; N]> {
    let v = URL_SAFE_NO_PAD.decode(s).ok()?;
    if v.len() != N {
        return None;
    }
    let mut out = [0_u8; N];
    out.copy_from_slice(&v);
    Some(out)
}

fn enum_to_wire<T: serde::Serialize>(value: &T) -> String {
    let v = serde_json::to_value(value).unwrap_or(serde_json::Value::Null);
    v.as_str().unwrap_or("unknown").to_string()
}

fn format_rfc3339(t: &SystemTime) -> String {
    let secs = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, m, d, h, mi, s) = epoch_to_civil(secs);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

fn epoch_to_civil(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let s = secs as i64;
    let days = s.div_euclid(86_400);
    let tod = s.rem_euclid(86_400);
    let h = (tod / 3600) as u32;
    let mi = ((tod % 3600) / 60) as u32;
    let sec = (tod % 60) as u32;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = (if m <= 2 { y + 1 } else { y }) as i32;
    (y, m, d, h, mi, sec)
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

fn extract_validate_field(msg: &str) -> String {
    msg.split_whitespace()
        .next()
        .unwrap_or("unknown")
        .to_string()
}

fn enum_invalid_field(path: &str) -> String {
    let path = path.strip_prefix("payload.").unwrap_or(path);
    match path {
        "model" | "tier" | "harness" | "region" => path.to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc3339_formats_known_epoch() {
        let t = UNIX_EPOCH + std::time::Duration::from_secs(1_761_955_200);
        let s = format_rfc3339(&t);
        assert_eq!(s, "2025-11-01T00:00:00Z");
    }

    #[test]
    fn rfc3339_formats_unix_epoch_zero() {
        let s = format_rfc3339(&UNIX_EPOCH);
        assert_eq!(s, "1970-01-01T00:00:00Z");
    }

    #[test]
    fn fixed_decode_rejects_wrong_length() {
        let encoded = URL_SAFE_NO_PAD.encode([1_u8, 2, 3, 4]);
        assert!(decode_fixed::<8>(&encoded).is_none());
    }

    #[test]
    fn fixed_decode_accepts_correct_length() {
        let bytes = [42_u8; 16];
        let encoded = URL_SAFE_NO_PAD.encode(bytes);
        assert_eq!(decode_fixed::<16>(&encoded), Some(bytes));
    }

    #[test]
    fn wire_request_rejects_unknown_top_level_field() {
        let raw = serde_json::json!({
            "event_id": "event",
            "challenge_id": "challenge",
            "sig": "sig",
            "nonce": "nonce",
            "payload": {},
            "extra": true,
        });
        let err = match serde_json::from_value::<WireRequest>(raw) {
            Ok(_) => panic!("expected top-level extra field to be rejected"),
            Err(e) => e,
        };
        assert!(err.to_string().starts_with("unknown field"));
    }

    #[test]
    fn fixed_decode_rejects_invalid_base64() {
        assert!(decode_fixed::<8>("!!!not-base64!!!").is_none());
    }

    #[test]
    fn truncate_caps_long_string_on_char_boundary() {
        let long = "x".repeat(500);
        let truncated = truncate(&long, 200);
        assert_eq!(truncated.len(), 200);
    }

    #[test]
    fn validate_field_extraction_parses_leading_token() {
        assert_eq!(
            extract_validate_field("tokens.input_5min = 1 exceeds 0"),
            "tokens.input_5min"
        );
        assert_eq!(extract_validate_field("output negative"), "output");
        assert_eq!(
            extract_validate_field("cached_read > 10_000_000"),
            "cached_read"
        );
    }

    #[test]
    fn validate_field_extraction_falls_back_on_empty() {
        assert_eq!(extract_validate_field(""), "unknown");
    }

    #[test]
    fn enum_invalid_field_only_allows_payload_enum_fields() {
        assert_eq!(enum_invalid_field("model"), "model");
        assert_eq!(enum_invalid_field("tokens.input_5min"), "unknown");
        assert_eq!(
            enum_invalid_field("bogus-model-name-not-in-enum"),
            "unknown"
        );
    }

    fn sample_payload_value() -> serde_json::Value {
        serde_json::json!({
            "v": 1,
            "model": "claude-sonnet-4-5",
            "tier": "pro",
            "harness": "claude-code",
            "region": "NA",
            "tokens": {
                "input_5min": 1,
                "output_5min": 2,
                "cached_read_5min": 3,
                "cached_write_5min": 4,
                "input_5h": 5,
                "output_5h": 6,
                "cached_read_5h": 7,
                "cached_write_5h": 8
            }
        })
    }

    fn encoded_uuid(seed: u128) -> String {
        use base64::Engine as _;

        let mut bytes = seed.to_be_bytes();
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        URL_SAFE_NO_PAD.encode(bytes)
    }

    fn valid_wire_json() -> serde_json::Value {
        serde_json::json!({
            "event_id": encoded_uuid(1),
            "challenge_id": URL_SAFE_NO_PAD.encode([2_u8; 32]),
            "sig": URL_SAFE_NO_PAD.encode([3_u8; 32]),
            "nonce": URL_SAFE_NO_PAD.encode([4_u8; 8]),
            "submission_group_id": encoded_uuid(5),
            "payload": sample_payload_value(),
        })
    }

    #[test]
    fn wire_request_accepts_submission_group_id() {
        let raw = valid_wire_json();
        let parsed = serde_json::from_value::<WireRequest>(raw);

        assert!(parsed.is_ok());
    }

    #[test]
    fn wire_request_rejects_missing_submission_group_id() {
        let mut raw = valid_wire_json();
        raw.as_object_mut().unwrap().remove("submission_group_id");

        let err = match serde_json::from_value::<WireRequest>(raw) {
            Ok(_) => panic!("expected missing submission_group_id to fail"),
            Err(e) => e,
        };

        assert!(err.to_string().contains("missing field"));
        assert!(err.to_string().contains("submission_group_id"));
    }

    #[test]
    fn wire_request_rejects_extra_top_level_field_after_submission_group_id() {
        let mut raw = valid_wire_json();
        raw.as_object_mut()
            .unwrap()
            .insert("extra_xyz".into(), serde_json::json!(true));

        let err = match serde_json::from_value::<WireRequest>(raw) {
            Ok(_) => panic!("expected extra top-level field to fail"),
            Err(e) => e,
        };

        assert!(err.to_string().contains("unknown field"));
        assert!(err.to_string().contains("extra_xyz"));
    }

    #[test]
    fn invalid_submission_group_id_uses_bad_json_shape() {
        let err = parse_wire_uuid_v4("not-a-uuid").unwrap_err();

        assert!(matches!(
            err,
            IngestError::BadJson {
                position: None,
                message: None
            }
        ));
    }

    #[test]
    fn insert_sql_persists_submission_group_id_as_typed_uuid() {
        assert!(INSERT_EVENT_SQL.contains("submission_group_id"));
        assert!(INSERT_EVENT_SQL.contains("$2::uuid"));
    }
}
