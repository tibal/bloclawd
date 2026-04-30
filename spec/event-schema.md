# Event Payload Schema v1

**Status:** Frozen for v1.
**Last updated:** 2026-04-30
**Enums (machine-readable):** [`spec/enums.json`](./enums.json) - single source of truth, imported by the Worker (`z.enum(...)`) and copied byte-for-byte to R2 by the cron (per AGGR-12).

## 1. Logical request body - `POST /event`

```json
{
  "event_id":     "<base64url(uuidv4_bytes), 22 chars no padding>",
  "challenge_id": "<base64url(challenge_id_32B), 43 chars no padding>",
  "sig":          "<base64url(hmac_sig_32B),      43 chars no padding>",
  "nonce":        "<base64url(nonce_8B_be),       11 chars no padding>",
  "payload": {
    "v":               1,
    "model":           "<one of enums.model>",
    "tier":            "<one of enums.tier>",
    "harness":         "<one of enums.harness>",
    "region":          "<one of enums.region>",
    "tokens": {
      "input_5min":         <unsigned int>,
      "output_5min":        <unsigned int>,
      "cached_read_5min":   <unsigned int>,
      "cached_write_5min":  <unsigned int>,
      "input_5h":           <unsigned int>,
      "output_5h":          <unsigned int>,
      "cached_read_5h":     <unsigned int>,
      "cached_write_5h":    <unsigned int>
    }
  }
}
```

The `payload` object is canonicalized via RFC 8785 JCS (see `spec/payload-canonical.md`) before its hash is bound into the PoW input (see `spec/pow-v1.md` section 2).

`event_id`, `challenge_id`, `sig`, and `nonce` are transport fields for the request. They are not part of the canonical `payload` object.

## 2. Field constraints

| Field | Constraint | Source of truth |
|-------|------------|-----------------|
| `payload.v` | Must be `1` for v1 | This document |
| `payload.model` | Must match an entry in `enums.json#model` | `spec/enums.json` |
| `payload.tier` | Must match an entry in `enums.json#tier` | `spec/enums.json` |
| `payload.harness` | Must match an entry in `enums.json#harness` | `spec/enums.json` |
| `payload.region` | Must match an entry in `enums.json#region` (ISO continent code) | `spec/enums.json` |
| `payload.tokens.*` | Unsigned integer, 0 <= x <= 10_000_000 | This document |
| `event_id` | UUIDv4 (never v7), base64url-encoded as 16 raw bytes on the wire and decoded by the Worker into a Postgres `uuid` | `01-CONTEXT.md` carries forward CLI-09 |

## 3. Fields that MUST NOT appear in the payload

These are permanently excluded. Worker `zod` schema rejects (with status 400) if seen:

- `tz_offset` - coarsened to `region` client-side; never reaches the Worker, never reaches the DB, never reaches R2.
- `country` - intermediate-only on the CLI; coarsened to `region` client-side.
- `event_id` - top-level idempotency field only; never part of the canonical payload.
- `nonce` - top-level PoW field only; never part of the canonical payload.
- `ip` - never collected, never logged.
- `user_id`, `session_id`, `account_id` - bloclawd has no concept of identity.

## 4. Server-assigned fields (DB only, never on the wire)

The DB row also contains, populated by the Worker:

- `bucket_ts TIMESTAMPTZ` - server-assigned and floored to the 15-minute bucket, for example with `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)`. Client-supplied timestamps are never trusted. (Per BACK-02 + INGE-06.)
- `received_at TIMESTAMPTZ` - `now()` at insert.

## 5. Unknown enum value handling (D-20)

- Worker: `zod` `.enum(...)` produces a 400 with the offending field name and the allowed value list. Never silently coerced.
- CLI: starts up by loading `spec/enums.json` (vendored at build time via `include_bytes!`) and asserting the values it derived (`model`, `tier`, `harness`, `region`) against the enum sets before spending a 30s PoW solve. (Per CLI-12 in REQUIREMENTS.md.)

## 6. Anonymity guarantees (cron / R2)

The aggregation cron writes a derived form of the payload to R2 (see Phase 4):

- `tz_offset` is not in the wire payload at all (this document), so the cron has nothing to drop.
- `event_id` and `nonce` are dropped by the cron before R2 write (per AGGR-08).
- Token counts are log-binned before R2 emission (per AGGR-06).
- Cells with `n < 5` are suppressed (per AGGR-05, k-anonymity).

These properties are enforced at the materialization step, not at ingest. The DB rows retain the precise form for re-aggregation; only R2 is public.
