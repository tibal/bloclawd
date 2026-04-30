# Canonical Payload Form v1

**Status:** Frozen for v1.
**Standard:** [RFC 8785 - JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
**Last updated:** 2026-04-30

## 1. Why this exists

`spec/pow-v1.md` section 2 binds `payload_hash = SHA-256(jcs_canonical_payload_bytes)` into the PoW input. For Rust solver and TypeScript verifier to agree on `payload_hash` for the same logical JSON object, both sides must serialize that object to the exact same byte sequence.

Hand-rolled canonicalization (sort keys, no whitespace, etc.) historically drifts on:

- Number formatting (`1.0` vs `1` vs `1e0`)
- Unicode preservation and escaping (precomposed vs combining forms, and escapes such as `\u0000`)
- Exponent casing in scientific notation
- Insignificant zeroes in fractions

RFC 8785 specifies these serialization rules. It does not normalize Unicode string data; it preserves parsed JSON string values. Fixtures therefore include NFC/NFD-shaped payloads to catch accidental normalization.

## 2. Implementations

| Side | Crate / package | Notes |
|------|-----------------|-------|
| Rust (CLI solver, `xtask` fixture generator) | [`serde_jcs`](https://crates.io/crates/serde_jcs) | Returns `Vec<u8>` of the canonical bytes. Used wherever `payload_hash` is computed: CLI submission path, CLI `--dry-run` printer, `xtask gen-fixtures`. |
| TypeScript (Worker verifier, `/data` page renderer) | [`@rfc-8785/json-canonicalize`](https://www.npmjs.com/package/@rfc-8785/json-canonicalize) | Returns `string` of the canonical bytes (UTF-8). Convert via `new TextEncoder().encode(s)` before SHA-256. |

Both implementations are conformance-tested against the official RFC 8785 test vectors as of their published versions. `spec/pow-fixtures.json` includes payloads that exercise key-ordering, Unicode preservation, and number-formatting edge cases to detect drift between the two libraries.

## 3. Computation

Given a logical JSON object `payload`:

1. Run JCS to produce a UTF-8 byte sequence: `canonical_bytes = JCS(payload)`.
2. Compute `payload_hash = SHA-256(canonical_bytes)` - exactly 32 bytes.
3. Use `payload_hash` raw (not its base64url encoding) inside the 72-byte PoW input per `spec/pow-v1.md` section 2.

The Worker performs step 1 server-side from the parsed request body, never trusts a client-supplied `payload_hash`.

## 4. CLI / `/data` parity

Per `01-CONTEXT.md`:

- The CLI's `--dry-run` output prints `JCS(payload)` byte-for-byte.
- The CLI's `--yes` submit sends `JCS(payload)` byte-for-byte (same bytes, same code path).
- The website's `/data` page renders the `JCS(payload)` schema using the same JCS library on the TS side.

A user can therefore byte-compare the dry-run with what the website documents and what the Worker actually receives.

## 5. Edge cases enforced by fixtures

`spec/pow-fixtures.json` includes vectors for:

- Empty payload (`{}`).
- Unicode-NFC/NFD preservation payloads (precomposed and combining forms remain distinct; fixtures catch accidental normalization).
- Number-formatting payload (`{"k": 1.0}` vs `{"k": 1}` after parse should canonicalize as `{"k":1}`).
- Key-ordering payload (`{"b": 2, "a": 1}` should canonicalize to `{"a":1,"b":2}`).
- Maximum-size payload near the 4 KB Worker payload cap.

Drift between Rust and TypeScript on any of these breaks the bilingual CI gate.
