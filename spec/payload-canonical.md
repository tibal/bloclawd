# Canonical Payload Form v1

**Status:** Frozen for v1.
**Standard:** [RFC 8785 - JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
**Last updated:** 2026-04-30
**Implementation:** `serde_jcs = "0.2"` via `crates/event-schema::canonical_bytes`

## 1. Why This Exists

`spec/pow-v1.md` section 2 binds `payload_hash = SHA-256(jcs_canonical_payload_bytes)` into the PoW input. The Rust CLI (solver) and the Rust Worker (verifier) must serialize a given logical JSON object to the exact same byte sequence.

After Phase 1.5 both sides call the same shared workspace crate:

```rust
crates/event-schema::canonical_bytes
```

That helper uses the single workspace JCS dependency `serde_jcs = "0.2"`. There is no protocol-critical TypeScript canonicalizer.

Hand-rolled canonicalization historically drifts on:

- Number formatting (`1.0` vs `1` vs `1e0`)
- Unicode preservation and escaping (precomposed vs combining forms, and escapes such as `\u0000`)
- Exponent casing in scientific notation
- Insignificant zeroes in fractions
- Object key ordering

RFC 8785 specifies these serialization rules. It does not normalize Unicode string data; it preserves parsed JSON string values. Fixtures therefore include NFC/NFD-shaped payloads to catch accidental normalization.

## 2. Implementations

| Consumer | Implementation | Notes |
|----------|----------------|-------|
| Rust CLI submission path | `crates/event-schema::canonical_bytes` | Same bytes as Worker verification and dry-run display. |
| CLI `--dry-run` printer | `crates/event-schema::canonical_bytes` | Dry-run bytes and submitted bytes must share the same formatter. |
| `xtask gen-fixtures` | `crates/event-schema::canonical_bytes` | Fixture drift gate catches changes. |
| Rust Worker verifier | `crates/event-schema::canonical_bytes` | Server recomputes payload hash from parsed request body. |
| Frontend `/data` page renderer | Reads the same canonical bytes re-encoded for display | The frontend renders protocol bytes; it does not reimplement JCS in TypeScript. |

## 3. Conformance Gate

`crates/event-schema/tests/jcs_conformance.rs` checks `serde_jcs = "0.2"` against official RFC 8785 KAT vectors from cyberphone/json-canonicalization.

If any vector fails, the dependency switch is mechanical:

```toml
serde_json_canonicalizer = "0.3"
```

Then rerun:

```bash
cargo test -p event-schema --locked
cargo test -p pow --locked
cargo run -p xtask --quiet --locked -- gen-fixtures --check
```

## 4. Computation

Given a logical JSON object `payload`:

1. Run JCS to produce a UTF-8 byte sequence: `canonical_bytes = JCS(payload)`.
2. Compute `payload_hash = SHA-256(canonical_bytes)` - exactly 32 bytes.
3. Use `payload_hash` raw (not its base64url encoding) inside the 72-byte PoW input per `spec/pow-v1.md` section 2.

The Worker performs step 1 server-side from the parsed request body and never trusts a client-supplied `payload_hash`.

## 5. CLI / `/data` Parity

- The CLI's `--dry-run` output prints `JCS(payload)` byte-for-byte.
- The CLI's `--yes` submit sends the same payload bytes from the same code path.
- The Rust Worker recomputes `JCS(payload)` from the parsed request body using the same shared crate before binding the resulting `payload_hash` against the PoW input.
- The website's `/data` page renders the same canonical bytes for users. Phase 4 picks the exact build/fetch mechanism, but it must not create a second canonicalization implementation in the SPA.

## 6. Edge Cases Enforced by Fixtures

`spec/pow-fixtures.json` includes vectors for:

- Empty payload (`{}`)
- Unicode-NFC/NFD preservation payloads (precomposed and combining forms remain distinct)
- Number-formatting payload (`{"k": 1.0}` vs `{"k": 1}` after parse canonicalizes as `{"k":1}`)
- Key-ordering payload (`{"b": 2, "a": 1}` canonicalizes to `{"a":1,"b":2}`)
- Maximum-size payload near the Worker payload cap

Any regression on these vectors fails `cargo test -p pow` and the `cargo xtask gen-fixtures --check` drift gate, blocking the PR.
