//! RFC 8785 JSON Canonicalization helper. Single source for both CLI and Worker.
//! Mirrors crates/pow/src/lib.rs:81-84 while pow keeps its inline call.

use serde::Serialize;

/// Canonicalize a Serialize-able value to RFC 8785 JCS bytes.
/// Used by `payload_hash = SHA-256(canonical_bytes(payload))` and by the CLI's
/// dry-run printer: same bytes, single source.
pub fn canonical_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, serde_json::Error> {
    serde_jcs::to_vec(value)
}
