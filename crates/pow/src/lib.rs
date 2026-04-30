use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Instant;

type HmacSha256 = Hmac<Sha256>;

/// 32-byte challenge_id = unix_ms_be (8B) || crypto_random (24B).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChallengeId(pub [u8; 32]);

/// 32-byte HMAC-SHA256 signature over challenge_id.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Sig(pub [u8; 32]);

/// 32-byte SHA-256 hash of the JCS canonicalization of a JSON payload.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PayloadHash(pub [u8; 32]);

/// 8 raw bytes, big-endian u64 nonce.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Nonce(pub [u8; 8]);

/// SHA-256 output.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Hash(pub [u8; 32]);

/// Difficulty constant. v1 = 22.
pub const K_V1: u32 = 22;

/// Inputs for complete server-side PoW verification.
pub struct VerifyRequest<'a> {
    pub secret: &'a [u8],
    pub challenge_id: &'a ChallengeId,
    pub sig: &'a Sig,
    pub payload: &'a Value,
    pub claimed_payload_hash: &'a PayloadHash,
    pub nonce: &'a Nonce,
    pub difficulty: u32,
    pub now_ms: u64,
}

/// Issue a stateless challenge.
pub fn issue_challenge(secret: &[u8], now_ms: u64, random_24: [u8; 24]) -> (ChallengeId, Sig) {
    let mut cid = [0_u8; 32];
    cid[0..8].copy_from_slice(&now_ms.to_be_bytes());
    cid[8..32].copy_from_slice(&random_24);
    let sig = hmac_sha256(secret, &cid);
    (ChallengeId(cid), Sig(sig))
}

/// Verify HMAC + expiry on a challenge.
pub fn verify_challenge(
    secret: &[u8],
    cid: &ChallengeId,
    sig: &Sig,
    now_ms: u64,
    expiry_ms: u64,
) -> Result<(), VerifyError> {
    let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| VerifyError::InvalidSecret)?;
    mac.update(&cid.0);
    mac.verify_slice(&sig.0)
        .map_err(|_| VerifyError::InvalidSig)?;

    let issued_ms = u64::from_be_bytes(
        cid.0[0..8]
            .try_into()
            .map_err(|_| VerifyError::MalformedChallenge)?,
    );
    if issued_ms > now_ms.saturating_add(5_000) {
        return Err(VerifyError::Expired);
    }
    if now_ms.saturating_sub(issued_ms) > expiry_ms {
        return Err(VerifyError::Expired);
    }

    Ok(())
}

/// Compute payload_hash = SHA-256(JCS(payload_value)).
pub fn payload_hash(payload: &Value) -> PayloadHash {
    let canonical = serde_jcs::to_vec(payload).expect("serde_json::Value is JCS-serializable");
    PayloadHash(Sha256::digest(canonical).into())
}

/// Compute the 72-byte PoW hash: SHA-256(challenge_id || payload_hash || nonce).
pub fn pow_hash(cid: &ChallengeId, ph: &PayloadHash, nonce: &Nonce) -> Hash {
    let mut input_bytes = [0_u8; 72];
    input_bytes[0..32].copy_from_slice(&cid.0);
    input_bytes[32..64].copy_from_slice(&ph.0);
    input_bytes[64..72].copy_from_slice(&nonce.0);
    Hash(Sha256::digest(input_bytes).into())
}

/// Count leading zero bits of a 32-byte hash.
pub fn leading_zero_bits(h: &Hash) -> u32 {
    let mut bits = 0_u32;
    for byte in h.0 {
        if byte == 0 {
            bits += 8;
        } else {
            bits += byte.leading_zeros();
            break;
        }
    }
    bits
}

/// Find a nonce satisfying the requested difficulty.
pub fn solve(
    cid: &ChallengeId,
    ph: &PayloadHash,
    k: u32,
    start_nonce: u64,
    deadline: Instant,
) -> Result<(Nonce, Hash), PowError> {
    let mut n = start_nonce;
    loop {
        if Instant::now() >= deadline {
            return Err(PowError::Timeout);
        }

        let nonce = Nonce(n.to_be_bytes());
        let hash = pow_hash(cid, ph, &nonce);
        if leading_zero_bits(&hash) >= k {
            return Ok((nonce, hash));
        }

        if n == u64::MAX {
            return Err(PowError::Timeout);
        }
        n += 1;
    }
}

/// Complete server-side check: HMAC + expiry + payload-hash binding + PoW.
pub fn verify(req: VerifyRequest<'_>) -> Result<Hash, VerifyError> {
    verify_challenge(req.secret, req.challenge_id, req.sig, req.now_ms, 60_000)?;

    let recomputed = payload_hash(req.payload);
    if !ct_eq(&recomputed.0, &req.claimed_payload_hash.0) {
        return Err(VerifyError::PayloadHashMismatch);
    }

    let hash = pow_hash(req.challenge_id, &recomputed, req.nonce);
    let got = leading_zero_bits(&hash);
    if got < req.difficulty {
        return Err(VerifyError::PowInsufficient {
            got,
            need: req.difficulty,
        });
    }

    Ok(hash)
}

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("invalid HMAC signature")]
    InvalidSig,
    #[error("expired challenge")]
    Expired,
    #[error("payload hash mismatch")]
    PayloadHashMismatch,
    #[error("PoW insufficient: got {got} leading zero bits, need {need}")]
    PowInsufficient { got: u32, need: u32 },
    #[error("malformed challenge id")]
    MalformedChallenge,
    #[error("invalid HMAC secret")]
    InvalidSecret,
}

#[derive(Debug, thiserror::Error)]
pub enum PowError {
    #[error("PoW solve timed out")]
    Timeout,
}

fn hmac_sha256(secret: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(msg);
    mac.finalize().into_bytes().into()
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0_u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{Duration, Instant};

    #[test]
    fn leading_zero_bits_known_patterns() {
        let mut h = [0_u8; 32];
        h[0] = 0x00;
        h[1] = 0x3f;
        assert_eq!(leading_zero_bits(&Hash(h)), 10);

        assert_eq!(leading_zero_bits(&Hash([0_u8; 32])), 256);
        assert_eq!(leading_zero_bits(&Hash([0xff_u8; 32])), 0);
        assert_eq!(leading_zero_bits(&Hash([0x80_u8; 32])), 0);
        assert_eq!(leading_zero_bits(&Hash([0x40_u8; 32])), 1);
    }

    #[test]
    fn pow_hash_uses_72_byte_layout() {
        let hash = pow_hash(
            &ChallengeId([0_u8; 32]),
            &PayloadHash([0_u8; 32]),
            &Nonce([0_u8; 8]),
        );
        let expected = Sha256::digest([0_u8; 72]);
        assert_eq!(hash.0, <[u8; 32]>::from(expected));
    }

    #[test]
    fn payload_hash_jcs_sorts_keys() {
        let left = payload_hash(&json!({ "b": 2, "a": 1 }));
        let right = payload_hash(&json!({ "a": 1, "b": 2 }));
        assert_eq!(left, right);
    }

    #[test]
    fn challenge_round_trip_succeeds() {
        let secret = b"test-secret-do-not-use-in-prod";
        let now = 1_760_000_000_000_u64;
        let (cid, sig) = issue_challenge(secret, now, [7_u8; 24]);
        verify_challenge(secret, &cid, &sig, now + 1_000, 60_000).expect("valid challenge");
    }

    #[test]
    fn challenge_rejects_wrong_secret() {
        let now = 1_760_000_000_000_u64;
        let (cid, sig) = issue_challenge(b"secret-a", now, [7_u8; 24]);
        let err = verify_challenge(b"secret-b", &cid, &sig, now + 1_000, 60_000)
            .expect_err("bad secret rejected");
        assert!(matches!(err, VerifyError::InvalidSig));
    }

    #[test]
    fn challenge_rejects_expired() {
        let secret = b"test-secret-do-not-use-in-prod";
        let now = 1_760_000_000_000_u64;
        let (cid, sig) = issue_challenge(secret, now, [7_u8; 24]);
        let err = verify_challenge(secret, &cid, &sig, now + 60_001, 60_000)
            .expect_err("expired challenge rejected");
        assert!(matches!(err, VerifyError::Expired));
    }

    #[test]
    fn solve_finds_low_difficulty_nonce() {
        let cid = ChallengeId([1_u8; 32]);
        let ph = payload_hash(&json!({ "a": 1 }));
        let (nonce, hash) = solve(&cid, &ph, 8, 0, Instant::now() + Duration::from_secs(2))
            .expect("low difficulty solves quickly");
        assert_eq!(nonce.0.len(), 8);
        assert!(leading_zero_bits(&hash) >= 8);
    }

    #[test]
    fn verify_accepts_matching_low_difficulty_request() {
        let secret = b"test-secret-do-not-use-in-prod";
        let now = 1_760_000_000_000_u64;
        let payload = json!({ "a": 1 });
        let (cid, sig) = issue_challenge(secret, now, [7_u8; 24]);
        let ph = payload_hash(&payload);
        let (nonce, expected_hash) =
            solve(&cid, &ph, 8, 0, Instant::now() + Duration::from_secs(2))
                .expect("low difficulty solves quickly");

        let hash = verify(VerifyRequest {
            secret,
            challenge_id: &cid,
            sig: &sig,
            payload: &payload,
            claimed_payload_hash: &ph,
            nonce: &nonce,
            difficulty: 8,
            now_ms: now + 1_000,
        })
        .expect("valid request verifies");

        assert_eq!(hash, expected_hash);
    }

    #[test]
    fn verify_rejects_payload_hash_mismatch() {
        let secret = b"test-secret-do-not-use-in-prod";
        let now = 1_760_000_000_000_u64;
        let payload = json!({ "a": 1 });
        let (cid, sig) = issue_challenge(secret, now, [7_u8; 24]);
        let nonce = Nonce([0_u8; 8]);

        let err = verify(VerifyRequest {
            secret,
            challenge_id: &cid,
            sig: &sig,
            payload: &payload,
            claimed_payload_hash: &PayloadHash([0_u8; 32]),
            nonce: &nonce,
            difficulty: 0,
            now_ms: now + 1_000,
        })
        .expect_err("payload hash mismatch rejected");

        assert!(matches!(err, VerifyError::PayloadHashMismatch));
    }

    #[test]
    fn verify_rejects_insufficient_pow() {
        let secret = b"test-secret-do-not-use-in-prod";
        let now = 1_760_000_000_000_u64;
        let payload = json!({ "a": 1 });
        let (cid, sig) = issue_challenge(secret, now, [7_u8; 24]);
        let ph = payload_hash(&payload);
        let nonce = Nonce([0_u8; 8]);

        let err = verify(VerifyRequest {
            secret,
            challenge_id: &cid,
            sig: &sig,
            payload: &payload,
            claimed_payload_hash: &ph,
            nonce: &nonce,
            difficulty: 257,
            now_ms: now + 1_000,
        })
        .expect_err("insufficient PoW rejected");

        assert!(matches!(err, VerifyError::PowInsufficient { .. }));
    }
}
