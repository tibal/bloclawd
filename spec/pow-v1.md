# PoW Spec v1

**Status:** Frozen for v1. Changes require a new version doc (`pow-v2.md`) and a coordinated CLI + Worker release.
**Last updated:** 2026-04-30
**Hash:** SHA-256 (FIPS 180-4 / [RFC 6234](https://datatracker.ietf.org/doc/html/rfc6234))
**MAC:** HMAC-SHA256 ([RFC 2104](https://datatracker.ietf.org/doc/html/rfc2104))
**Wire encoding:** base64url, no padding (RFC 4648 section 5)

## 1. Challenge issuance (`GET /challenge`)

The Worker holds exactly one secret: `WORKER_SECRET` (at least 256 bits of entropy, set via `wrangler secret put WORKER_SECRET`). There is no per-challenge state and no challenge storage service.

For each `GET /challenge` request the Worker computes:

```
unix_ms_be    = current Unix time in milliseconds, encoded as 8-byte big-endian unsigned integer
crypto_random = 24 bytes from crypto.getRandomValues
challenge_id  = unix_ms_be (8 bytes) || crypto_random (24 bytes)        // total: 32 bytes
sig           = HMAC-SHA256(key=WORKER_SECRET, msg=challenge_id)         // total: 32 bytes
```

Response body (JSON):

```json
{
  "challenge_id": "<base64url(challenge_id), 43 chars no padding>",
  "sig":          "<base64url(sig),          43 chars no padding>",
  "difficulty":   22,
  "expires_in":   60
}
```

`expires_in` is the number of seconds the client has to submit a valid `POST /event` whose embedded `challenge_id` decodes to a `unix_ms_be` not older than 60 seconds (per section 3 step 2).

## 2. PoW input format (72 bytes, exact)

The solver computes `nonce` such that:

```
input_bytes   = challenge_id (32 bytes raw) || payload_hash (32 bytes raw) || nonce (8 bytes raw, big-endian u64)
              // total: 72 bytes, no separators, no encoding inside the input
hash          = SHA-256(input_bytes)
leading_zero_bits(hash) >= K       // K = 22 for v1
```

where `payload_hash = SHA-256(jcs_canonical_payload_bytes)` and `jcs_canonical_payload_bytes` is the byte sequence specified in `spec/payload-canonical.md` using RFC 8785 JCS.

Byte order is fixed: index 0..32 = `challenge_id`, index 32..64 = `payload_hash`, index 64..72 = `nonce`.

`nonce` is an unsigned 64-bit integer encoded big-endian (most significant byte first). For example, `nonce=1` is the bytes `00 00 00 00 00 00 00 01`.

`leading_zero_bits(hash)` is the count of consecutive zero bits starting from the most significant bit of byte 0 of the SHA-256 output. For example, a hash beginning `0x00 0x3F ...` has 10 leading zero bits (8 from `0x00` plus 2 from the leading two zeros of `0x3F = 0011 1111`).

## 3. Verification (`POST /event` server side)

The Worker receives `{ challenge_id, sig, payload, nonce, event_id, submission_group_id, limit_type }` (all base64url-decoded as needed; `payload` is the JSON object). It performs the following checks in this order and rejects with the listed status code on first failure:

1. **HMAC signature** (400 if invalid). Recompute `sig_prime = HMAC-SHA256(WORKER_SECRET, challenge_id_bytes)`. Reject if `constant_time_eq(sig_prime, sig_bytes) == false`.
2. **Expiry** (400 if expired). Decode `unix_ms_be` from the first 8 bytes of `challenge_id_bytes`. Reject if `now_ms - unix_ms_be > 60_000` or `unix_ms_be > now_ms + 5_000` (5s clock-skew tolerance).
3. **Payload-hash binding** (400 if mismatched). Recompute `payload_hash_prime = SHA-256(JCS(payload))` per `spec/payload-canonical.md`. The server reconstructs the 72-byte PoW input from server-side `challenge_id_bytes`, server-side `payload_hash_prime`, and client-supplied `nonce_bytes`; it never trusts a client-supplied `payload_hash`.
4. **PoW** (400 if invalid). Compute `hash = SHA-256(challenge_id_bytes || payload_hash_prime || nonce_bytes)`. Reject if `leading_zero_bits(hash) < 22`.
5. **DB insert.** Decode top-level `event_id` and `submission_group_id` from 16 raw UUIDv4 bytes into canonical Postgres `uuid`s, then insert `event_id`, `submission_group_id`, server-assigned `bucket_ts`, `payload JSONB`, and `limit_type` into `events`. The row is keyed on `event_id UUID PRIMARY KEY`; duplicate `event_id` requests use a no-op conflict update so the Worker can return the original `bucket_ts`. Server assigns `bucket_ts` as the current Postgres timestamp floored to the 15-minute bucket (for example with `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)`).

Verification ordering is: HMAC -> expiry -> payload-hash -> PoW -> DB insert.

## 4. Replay defense layers (in order)

1. **Cryptographic** - PoW input binds `payload_hash`. A solved challenge cannot be reused with a different payload because the PoW would need to be re-solved.
2. **Database** - `event_id UUID PRIMARY KEY` with an `ON CONFLICT (event_id)` no-op update that returns the original `bucket_ts`. A replay of the exact same request is silently absorbed.
3. **Temporal** - 60s expiry on `challenge_id`. The replay window is bounded.

There is no challenge persistence layer in this design. The original draft's consume-on-use layer is removed.

## 5. Difficulty (K=22)

K=22 is fixed for v1. Tunable via Worker env var `POW_DIFFICULTY_K` (defaults to 22). Expected solve time on a mid-2024 dev laptop: about 1 second; budget per CLI: 30 seconds hard timeout.

## 6. Wire encoding summary

| Field | Encoding |
|-------|----------|
| `challenge_id` | base64url, no padding (32 raw bytes -> 43 chars) |
| `sig` | base64url, no padding (32 raw bytes -> 43 chars) |
| `nonce` | base64url, no padding (8 raw bytes -> 11 chars) |
| `payload_hash` | Not sent on the wire; recomputed by Worker from received `payload` |
| `event_id` | base64url, no padding (16 raw bytes -> 22 chars); UUIDv4 only |

## 7. Worked example

A single canonical example is provided in `spec/pow-fixtures.json`. The shared `crates/pow` is the verifier/solver implementation used by the Rust CLI and the Rust Worker. It must round-trip every fixture in that file. CI verifies this in `.github/workflows/pow.yml` via `cargo test -p pow` plus the deterministic-fixture drift gate `cargo xtask gen-fixtures --check`.
