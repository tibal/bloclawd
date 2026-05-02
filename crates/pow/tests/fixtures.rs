use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use pow::{ChallengeId, Hash, Nonce, PayloadHash, leading_zero_bits, payload_hash, pow_hash};
use serde::Deserialize;

#[derive(Deserialize)]
struct Vector {
    name: String,
    challenge_id_b64: String,
    payload_canonical_b64: String,
    payload_hash_b64: String,
    nonce_b64: String,
    expected_hash_b64: String,
    leading_zero_bits: u32,
}

fn b64u(s: &str) -> Vec<u8> {
    URL_SAFE_NO_PAD.decode(s).expect("valid base64url")
}

#[test]
fn fixtures_round_trip() {
    let raw = include_bytes!("../../../spec/pow-fixtures.json");
    let vectors: Vec<Vector> = serde_json::from_slice(raw).expect("valid fixture JSON");
    assert!(
        vectors.len() >= 10,
        "spec/pow-fixtures.json must contain >=10 vectors (have {})",
        vectors.len()
    );

    for v in &vectors {
        let cid_bytes: [u8; 32] = b64u(&v.challenge_id_b64)
            .try_into()
            .expect("32B challenge_id");
        let ph_bytes: [u8; 32] = b64u(&v.payload_hash_b64)
            .try_into()
            .expect("32B payload_hash");
        let nonce_bytes: [u8; 8] = b64u(&v.nonce_b64).try_into().expect("8B nonce");
        let expected: [u8; 32] = b64u(&v.expected_hash_b64)
            .try_into()
            .expect("32B expected_hash");

        let h = pow_hash(
            &ChallengeId(cid_bytes),
            &PayloadHash(ph_bytes),
            &Nonce(nonce_bytes),
        );
        assert_eq!(h.0, expected, "fixture {}: pow_hash mismatch", v.name);

        assert_eq!(
            leading_zero_bits(&Hash(expected)),
            v.leading_zero_bits,
            "fixture {}: leading_zero_bits mismatch",
            v.name
        );

        let canonical_bytes = b64u(&v.payload_canonical_b64);
        let parsed: serde_json::Value =
            serde_json::from_slice(&canonical_bytes).expect("payload parses as JSON");
        let recomputed = payload_hash(&parsed);
        assert_eq!(
            recomputed.0, ph_bytes,
            "fixture {}: payload_hash JCS round-trip failed",
            v.name
        );
    }
}
