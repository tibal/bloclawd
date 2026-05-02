//! Regression tests for serde_json display prefixes consumed by worker error classification.

use event_schema::{EventPayload, SubmittedEvent};
use serde::de::IntoDeserializer;

fn valid_base_json() -> &'static str {
    r#"{
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
    }"#
}

fn valid_submitted_event_json() -> serde_json::Value {
    serde_json::json!({
        "event_id": "event",
        "challenge_id": "challenge",
        "sig": "sig",
        "nonce": "nonce",
        "submission_group_id": "group",
        "limit_type": "5h",
        "payload": serde_json::from_str::<serde_json::Value>(valid_base_json()).unwrap(),
    })
}

#[test]
fn unknown_field_message_starts_with_unknown_field_and_includes_backticked_name() {
    let raw = r#"{
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
        },
        "extra": "x"
    }"#;
    let err = serde_json::from_str::<EventPayload>(raw).unwrap_err();
    let msg = err.to_string();
    assert!(msg.starts_with("unknown field"), "got: {msg}");
    assert!(msg.contains("`extra`"), "got: {msg}");
}

#[test]
fn unknown_variant_message_starts_with_unknown_variant() {
    let raw = r#"{
        "v": 1,
        "model": "bogus-model-name-not-in-enum",
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
    }"#;
    let err = serde_json::from_str::<EventPayload>(raw).unwrap_err();
    let msg = err.to_string();
    assert!(msg.starts_with("unknown variant"), "got: {msg}");
    assert!(msg.contains("`bogus-model-name-not-in-enum`"), "got: {msg}");
}

#[test]
fn version_overflow_message_contains_invalid_value_integer_and_expected_u8() {
    let raw = r#"{
        "v": 999,
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
    }"#;
    let err = serde_json::from_str::<EventPayload>(raw).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("invalid value: integer"), "got: {msg}");
    assert!(msg.contains("u8"), "got: {msg}");
}

#[test]
fn missing_required_field_message_starts_with_missing_field() {
    let raw = r#"{
        "v": 1,
        "model": "claude-sonnet-4-5",
        "tier": "pro",
        "harness": "claude-code",
        "region": "NA"
    }"#;
    let err = serde_json::from_str::<EventPayload>(raw).unwrap_err();
    let msg = err.to_string();
    assert!(msg.starts_with("missing field"), "got: {msg}");
    assert!(msg.contains("`tokens`"), "got: {msg}");
}

#[test]
fn valid_payload_round_trips_for_smoke_check() {
    let _: EventPayload =
        serde_json::from_str(valid_base_json()).expect("valid_base_json must deserialize");
}

#[test]
fn limit_type_unknown_variant_path_is_top_level() {
    let mut bad = valid_submitted_event_json();
    bad.as_object_mut()
        .unwrap()
        .insert("limit_type".into(), serde_json::json!("daily"));

    let result: Result<SubmittedEvent, _> =
        serde_path_to_error::deserialize(bad.into_deserializer());
    let err = result.expect_err("unknown variant should error");

    assert_eq!(err.path().to_string(), "limit_type");
    assert!(
        err.inner().to_string().starts_with("unknown variant"),
        "got: {}",
        err.inner()
    );
}

#[test]
fn limit_type_missing_field_path_mentions_limit_type() {
    let mut bad = valid_submitted_event_json();
    bad.as_object_mut().unwrap().remove("limit_type");

    let result: Result<SubmittedEvent, _> =
        serde_path_to_error::deserialize(bad.into_deserializer());
    let err = result.expect_err("missing field should error");
    let msg = err.inner().to_string();

    assert!(msg.starts_with("missing field"), "got: {msg}");
    assert!(msg.contains("`limit_type`"), "got: {msg}");
}
