# Event Payload Schema v1

**Status:** Frozen for v1.
**Last updated:** 2026-05-02
**Source of truth:** canonical types are defined in Rust under `crates/event-schema/`. Enum definitions live in `crates/event-schema/src/enums.rs`; payload structs live in `crates/event-schema/src/payload.rs`; TypeScript bindings for the SPA are generated via `ts-rs` into `apps/web/src/generated/`.

The former enum JSON artifact is not a v1 schema source and is not published to R2. Frontend filters import enum values from the generated TypeScript bindings.

## 1. Logical Request Body - `POST /event`

```json
{
  "event_id":     "<base64url(uuidv4_bytes), 22 chars no padding>",
  "challenge_id": "<base64url(challenge_id_32B), 43 chars no padding>",
  "sig":          "<base64url(hmac_sig_32B),      43 chars no padding>",
  "nonce":        "<base64url(nonce_8B_be),       11 chars no padding>",
  "submission_group_id": "<base64url(uuidv4_bytes), 22 chars no padding>",
  "limit_type":   "5h",
  "payload": {
    "v":               1,
    "model":           "<one of Model>",
    "tier":            "<one of Tier>",
    "harness":         "<one of Harness>",
    "region":          "<one of Region>",
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

**`submission_group_id`** (string, base64url no-padding UUIDv4, REQUIRED). Per-invocation linkage id; all events emitted by ONE `bloclawd` invocation share the same value. It is a TRANSPORT field: it is NOT included in the JCS-canonical bytes that produce `payload_hash`, is NOT bound into the 72-byte PoW input, and is NOT signed by HMAC. The Worker validates UUIDv4 format and persists it on the row; cron strips it before any R2 emission. Logging boundary: `submission_group_id` MUST NOT appear in any log line.

**`limit_type`** (`"5h" | "weekly"`, REQUIRED). Top-level transport field, NOT inside payload. Source: CLI flag (`--5h` | `--week`). Used by cron to split each cohort into per-limit-type cells.

## 2. Field Constraints

| Field | Constraint | Source of truth |
|-------|------------|-----------------|
| `payload.v` | Must be `1` for v1 | `crates/event-schema/src/payload.rs` |
| `payload.model` | Must match `Model` | `crates/event-schema/src/enums.rs` and `apps/web/src/generated/Model.ts` |
| `payload.tier` | Must match `Tier` | `crates/event-schema/src/enums.rs` and `apps/web/src/generated/Tier.ts` |
| `payload.harness` | Must match `Harness` | `crates/event-schema/src/enums.rs` and `apps/web/src/generated/Harness.ts` |
| `payload.region` | Must match `Region` (ISO continent code) | `crates/event-schema/src/enums.rs` and `apps/web/src/generated/Region.ts` |
| `payload.tokens.*` | Unsigned integer, 0 <= x <= 1_000_000_000_000 | `crates/event-schema/src/payload.rs` |
| `event_id` | UUIDv4 (never v7), base64url-encoded as 16 raw bytes on the wire and decoded by the Worker into a Postgres `uuid` | CLI schema |
| `submission_group_id` | UUIDv4 (never v7), base64url-encoded as 16 raw bytes on the wire and decoded by the Worker into a Postgres `uuid`; one value is shared by all events from one CLI invocation | `crates/event-schema/src/wire.rs` |
| `limit_type` | Closed enum `"5h" | "weekly"`; top-level transport field set by the CLI from `--5h` or `--week` | `crates/event-schema/src/enums.rs` and `crates/event-schema/src/wire.rs` |

The generated SPA bindings also include `apps/web/src/generated/EventPayload.ts`, `TokenCounts.ts`, and the hand-maintained `apps/web/src/generated/index.ts` barrel.

## 3. Fields That MUST NOT Appear in the Payload

These are permanently excluded. The Worker's typed deserializer (`crates/event-schema::EventPayload`, with `#[serde(deny_unknown_fields)]`) rejects unknown fields with status 400 if seen:

- `tz_offset` - coarsened to `region` client-side; never reaches the Worker, DB, or R2.
- `country` - intermediate-only on the CLI; coarsened to `region` client-side.
- `event_id` - top-level idempotency field only; never part of the canonical payload.
- `nonce` - top-level PoW field only; never part of the canonical payload.
- `submission_group_id` - top-level per-invocation linkage field only; never part of the canonical payload.
- `limit_type` - top-level transport field only; never part of the canonical payload.
- `ip` - never collected, never logged.
- `user_id`, `session_id`, `account_id` - bloclawd has no concept of identity.

## 4. Server-Assigned Fields

The DB row also contains, populated by the Worker:

- `bucket_ts TIMESTAMPTZ` - server-assigned and floored to the 15-minute bucket, for example with `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)`. Client-supplied timestamps are never trusted.
- `received_at TIMESTAMPTZ` - `now()` at insert.
- The private row stores `payload JSONB` plus transport fields (`event_id`, `submission_group_id`, `limit_type`). It does not duplicate `payload.model`, `payload.tier`, `payload.harness`, or `payload.region` into separate dimension columns.

These fields are never on the wire payload.

## 5. Unknown Enum Value Handling

- Worker: serde deserialization into `crates/event-schema::EventPayload` rejects unknown enum values before insert. Rejections should surface a 400 with the offending field name and allowed values derived from the Rust enum source.
- CLI: validates derived `model`, `tier`, `harness`, and `region` against `crates/event-schema` before spending the PoW solve budget.
- Frontend: imports enum sets from `apps/web/src/generated/` and does not maintain its own list.

## 6. Anonymity Guarantees

The aggregation cron writes a derived form of the payload to R2:

- `tz_offset` is not in the wire payload at all, so the cron has nothing to drop.
- `event_id` and `nonce` are dropped before R2 write.
- `submission_group_id` is used only to group rows into one submission before R2 write.
- Each submission is priced with catalog-backed per-model/per-token-type API prices.
- Public cells emit `api_cost_usd` percentiles (`p10`, `p25`, `p50`, `p75`, `p90`), `n_dropped`, `n_retained`, and `typical_mix` averaged over retained submissions.
- Cells with `n < 5` are suppressed for k-anonymity.
- Enum sets for filters come from `apps/web/src/generated/`, not an R2 enum manifest.

These properties are enforced at materialization, not at ingest. The DB rows retain the precise private form for re-aggregation; only R2 is public.

---
*2026-05-05 - R2 aggregation changed from ridge/unified-token output to direct API-cost percentiles plus typical token mix.*
*2026-05-02 - `limit_type` added as wire envelope field.*
