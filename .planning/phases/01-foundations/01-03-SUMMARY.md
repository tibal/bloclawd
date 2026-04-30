---
phase: 01-foundations
plan: 03
subsystem: rust-pow
tags: [rust, pow, xtask, fixtures, jcs]
key-files:
  created:
    - crates/pow/Cargo.toml
    - crates/pow/src/lib.rs
    - crates/pow/tests/fixtures.rs
    - xtask/Cargo.toml
    - xtask/src/main.rs
    - spec/pow-fixtures.json
  modified:
    - Cargo.toml
    - Cargo.lock
metrics:
  tasks_completed: 2
  tests_run: 5
---

# Plan 01-03 Summary: Rust PoW Crate + Fixture Generator

## Objective

Implemented the Rust side of the v1 PoW invariant and the deterministic fixture generator used by both language implementations.

## Commits

| Commit | Description |
|--------|-------------|
| `df839ea` | Implemented `crates/pow` with challenge issuance, HMAC verification, JCS payload hashing, 72-byte PoW hashing, nonce solving, and Rust tests. |
| `6371925` | Added `xtask gen-fixtures`, generated `spec/pow-fixtures.json`, and verified fixture drift detection. |

## Public Rust API

- `ChallengeId`: 32-byte challenge identifier (`unix_ms_be || random_24`).
- `Sig`: 32-byte HMAC-SHA256 signature over `ChallengeId`.
- `PayloadHash`: 32-byte SHA-256 hash of RFC 8785 JCS payload bytes.
- `Nonce`: 8-byte big-endian nonce.
- `Hash`: 32-byte SHA-256 PoW output.
- `K_V1`: v1 difficulty constant (`22`).
- `issue_challenge`: builds a stateless challenge and HMAC signature.
- `verify_challenge`: validates HMAC, expiry, and future clock skew.
- `payload_hash`: computes `SHA-256(JCS(payload))`.
- `pow_hash`: computes `SHA-256(challenge_id || payload_hash || nonce)` over exactly 72 bytes.
- `leading_zero_bits`: counts leading zero bits from the SHA-256 output.
- `solve`: finds a nonce before a deadline.
- `verify`: runs HMAC, expiry, payload-hash binding, and PoW checks in order.
- `VerifyError` / `PowError`: typed failure modes for verifier and solver paths.

## Fixture Vectors

| Vector | Leading Zero Bits |
|--------|-------------------|
| `k0-trivial` | 1 |
| `k1-trivial` | 3 |
| `k22-empty-payload` | 23 |
| `k23-empty-payload` | 24 |
| `k0-all-zero-challenge` | 1 |
| `k0-all-ff-challenge` | 1 |
| `k1-unicode-nfc` | 1 |
| `k1-key-ordering` | 2 |
| `k1-number-formatting` | 3 |
| `k1-realistic-payload` | 1 |
| `k1-max-size-payload` | 2 |

`k0-trivial.expected_hash_b64`: `XRrY3lt49-TRB8HuhEmaWbtsQUHvD1s164tFmQ0s3NY`

## Verification

| Command | Result |
|---------|--------|
| `cargo build -p pow` | Passed |
| `cargo test -p pow --lib` | Passed: 7 library tests |
| `cargo run -p xtask --quiet -- gen-fixtures` | Passed |
| `cargo test -p pow` | Passed: 8 tests across lib, fixtures, doc-tests |
| `cargo run -p xtask --quiet -- gen-fixtures --check` | Passed |
| Tamper `spec/pow-fixtures.json`, rerun `gen-fixtures --check`, restore | Passed: tamper detected with non-zero exit |

## Deviations

- Updated the workspace `serde_jcs` dependency from `0.1` to `0.2` because crates.io currently resolves `serde_jcs` at `0.2.0`; the crate still satisfies the planned RFC 8785 JCS implementation requirement.
- Seeded the expensive K=22/K=23 fixture searches near their deterministic solutions so debug-mode `xtask gen-fixtures --check` runs quickly in CI while preserving deterministic vectors and target difficulties.

## Self-Check: PASSED

The Rust crate, fixture generator, fixture file, round-trip tests, and drift gate are present and verified.
