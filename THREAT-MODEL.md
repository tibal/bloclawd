# Threat Model

`bloclawd` is a community-operated, anonymous timeseries dashboard for AI
coding subscription users tracking when they (and others) hit rate limits.
The trust contract: (1) the public dataset cannot be used to deanonymize
you; (2) the wire format between CLI and ingest is bounded, validated, and
cryptographically gated; (3) the CLI does not fingerprint your identity to
upstream providers; (4) the source is dual-licensed
[MIT](./LICENSE-MIT) / [Apache-2.0](./LICENSE-APACHE) and open for audit.

This document is the canonical, verbatim-anchored statement of what
bloclawd PROMISES and EXPLICITLY DOES NOT PROMISE. Every promise is backed
by either a frozen spec (under `spec/`) or a project decision (under
`.planning/`) — file references included so the contract is auditable
end-to-end. (The legacy single-file `PROJECT.md` constraints have been
distributed across `.planning/research/SUMMARY.md` + per-phase CONTEXTs.)

---

## Promises (anonymity boundary)

Anonymity is **combinatorial**, not field-by-field — "we don't store IP" is
necessary but not sufficient. The combination
`(model, tier, harness, region, tz_offset, token_5min)` is a fingerprint
(Sweeney-style re-identification). Quoting `.planning/research/SUMMARY.md`
§Critical Pitfalls #2 (carried forward from `PITFALLS.md` Pitfall #1):

> **Anonymity is combinatorial, not field-by-field (Pitfall #1)** — "We
> don't store IP" is necessary but **not sufficient**. The combination
> `(model, tier, harness, region, tz_offset, token_5min)` is a fingerprint
> (Sweeney-style re-identification). Defense layer cake at *materialization*
> (cron, not ingest): k-anonymity suppression of any cell with n<5; publish
> only aggregate API-cost percentiles and average retained token mix; **drop
> `tz_offset` entirely** (or coarsen to {Americas, EMEA, APAC, Other});
> never write `event_id`, `submission_group_id`, or `nonce` to public R2
> files; never log per-event solve-time anywhere persistent.

Operational consequences enforced in the codebase:

- **k-anonymity floor `n ≥ 5` per public-R2 cell.** Quoting
  `.planning/phases/04-aggregation-dashboard/04-CONTEXT.md` D-87 (AGGR-05
  amendment):

  > k-anonymity enforced at materialization: cells (cohort × limit_type)
  > with `n_distinct_submission_groups < 5` carry `insufficient_data: true`
  > and emit no percentile / model data. n is the count of distinct
  > `submission_group_id`s contributing to the cell, NOT raw event count.

  Cohort = `(tier, harness, region)` (Phase 4 D-80; `model` was dropped to
  improve cohort fill-rates).

- **Token counts NEVER published as raw integers.** Quoting
  `.planning/phases/04-aggregation-dashboard/04-CONTEXT.md` D-87 (AGGR-06
  amendment):

  > Token counts NEVER published as raw integers. The windowed L-estimator
  > emits a smoothed mean of ≥5 trimmed neighbors; the powers-of-2 bin
  > fallback emits a bin index. Both encodings preserve the
  > no-individual-value-recoverable property.

- **`tz_offset` dropped from public R2.** TZ is collected on the wire to
  validate window alignment but never persisted into the public dataset.

- **`event_id`, `submission_group_id`, `nonce` never on R2.** They exist
  on the wire (UUIDv4) and in the private PostgreSQL `events` table for
  idempotency, but are stripped at cron (not ingest) before any R2 write.

- **Per-event timing not persisted.** PoW solve duration, sub-minute
  submit timestamps, and similar high-resolution per-event signals are
  never written to durable storage. The 15-minute `bucket_ts` is
  server-assigned via `date_bin('15 minutes', now(), ...)`; client clocks
  are never trusted (`spec/pow-v1.md` §3 step 5; Phase 2 D-43 step 10).

- **Manifest-last write to R2.** Cron writes per-cohort cells first, then
  the top-level manifest only after every cell has landed (Phase 4
  D-105). Readers see a complete snapshot or the previous manifest —
  never a half-published state with fingerprintable singleton rows.

**Proof-of-work as anti-spam (not anti-deanonymization).** Quoting
`spec/pow-v1.md` §2:

> The solver computes `nonce` such that:
>
> ```
> input_bytes   = challenge_id (32 bytes raw) || payload_hash (32 bytes raw) || nonce (8 bytes raw, big-endian u64)
>               // total: 72 bytes, no separators, no encoding inside the input
> hash          = SHA-256(input_bytes)
> leading_zero_bits(hash) >= K       // K = 22 for v1
> ```
>
> where `payload_hash = SHA-256(jcs_canonical_payload_bytes)` and
> `jcs_canonical_payload_bytes` is the byte sequence specified in
> `spec/payload-canonical.md` using RFC 8785 JCS.

The PoW gate is **stateless HMAC-signed** (no KV, no shared mutable state):
60-second `expires_in` per `spec/pow-v1.md` §1; `payload_hash` binding is
the primary replay defense; `event_id UUID PRIMARY KEY` with
`INSERT ... ON CONFLICT (event_id) DO NOTHING` is a layered defense
(`spec/pow-v1.md` §4). `K = 22` initial target (~1 second on a mid-2024
dev laptop) per `spec/pow-v1.md` §5; tunable via Worker env var
`POW_DIFFICULTY_K`.

Canonical payload form is **RFC 8785 JSON Canonicalization Scheme (JCS)**
per `spec/payload-canonical.md` §1 — byte-exact across CLI and Worker,
single workspace implementation in `crates/event-schema::canonical_bytes`.

---

## Promises (wire integrity)

The wire format between the CLI and `api.bloclawd.com/event` is bounded,
validated, idempotent, and gates server work behind cheap checks first.

- **Server-assigned `bucket_ts`.** Quoting `spec/pow-v1.md` §3 step 5:

  > Server assigns `bucket_ts` as the current Postgres timestamp floored
  > to the 15-minute bucket (for example with
  > `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)`).

  Client clocks are never trusted for the aggregation key.

- **UUIDv4-only `event_id` and `submission_group_id`.** No client
  sequence numbers, no embedded timestamps in IDs — purely random
  128-bit values. `spec/pow-v1.md` §6 wire-encoding table fixes
  `event_id` as "base64url, no padding (16 raw bytes -> 22 chars);
  UUIDv4 only."

- **Strict serde validation with `deny_unknown_fields` + closed enums.**
  Quoting `.planning/phases/02-ingest-backbone/02-CONTEXT.md` D-43
  (validation step 4):

  > `EventPayload` deserialize via `crates/event-schema` (closed enum +
  > `deny_unknown_fields` simultaneously) → 400 `enum_invalid` |
  > `unknown_field` | `version_invalid`

  Closed enum sets cover `harness` (`cc | codex`),
  `tier` (`pro | max5 | max20`), `region`, and `limit_type`
  (`5h | weekly`).

- **14-code flat error envelope.** Phase 2 D-41 / D-43 lock the closed
  set of error codes (`rate_limited`, `body_too_large`, `bad_json`,
  `enum_invalid`, `unknown_field`, `version_invalid`,
  `token_out_of_range`, `signature_invalid`, `challenge_expired`,
  `clock_skew`, `payload_hash_mismatch`, `pow_invalid`,
  `server_unavailable`, `internal`). Clients can disambiguate user
  errors from server errors without parsing free text.
  `.planning/phases/02-ingest-backbone/02-CONTEXT.md` D-41 also fixes:

  > Body never contains `event_id`, `nonce`, IP, `WORKER_SECRET`, or
  > per-event timing — INGE-11 boundary.

- **PostgreSQL `event_id UUID PRIMARY KEY` idempotency.** Replay of the
  same `event_id` short-circuits silently via
  `INSERT ... ON CONFLICT (event_id) DO NOTHING`
  (`spec/pow-v1.md` §3 step 5; §4 layer 2). No double-counting.

**Distribution-channel integrity** (Phase 5 DIST-03 / D-119 / D-122):

- **macOS binaries are signed and notarized via Apple's `notarytool`.**
  Notarize failure HALTS the cascade (Phase 5 D-119) — no public
  artifact, tap PR, or `cargo publish` happens until a clean re-tag.
- **`install.sh` carries inline per-target sha256 hashes** baked at
  release time (Phase 5 D-122). The script downloads the binary from
  GitHub Releases over TLS, then verifies via `shasum -a 256 -c` before
  extracting. Mismatch aborts with a clear error.
- **Cache headers `public, max-age=300, must-revalidate`,
  `Content-Type: text/plain`** on `bloclawd.com/install.sh` (Phase 5
  D-123) — `text/plain` keeps `curl ... | sh` clean and lets users
  `curl bloclawd.com/install.sh` to audit the script in their terminal
  before piping to shell.
- **HSTS + Always-HTTPS on the `bloclawd.com` zone** (Phase 5 DIST-08).
  HSTS preload is intentionally NOT submitted at v1 — preload is
  irreversible; deferred to v1.0.0 cut.

---

## Promises (no-fingerprinting)

The CLI deliberately does NOT identify itself to upstream providers when
running rate-limit detection probes.

- **No persistent CLI device key, ever.** Quoting
  `.planning/phases/04-aggregation-dashboard/04-CONTEXT.md` D-103
  (verbatim, including the user-question framing):

  > User asked: "don't users have a per-device generated key to sign
  > payloads?" Answer: **NO, by design.** PoW signing key is server-side
  > `WORKER_SECRET`; the wire `sig` is the worker-issued challenge HMAC,
  > not a CLI signature. CLI generates fresh UUIDv4 `event_id` per event
  > and `submission_group_id` per invocation. Any persistent CLI-side key
  > would (a) violate the anonymity boundary and (b) create an
  > upstream-provider fingerprinting signal (same threat as D-77).
  > `submission_group_id` distinct-count is the only honest contributor
  > proxy.

  The CLI is stateless across invocations — no `~/.bloclawd/device_id`,
  no machine-id read, no MAC-address hash.

- **CLI prompts and shell-outs to claude/codex contain zero
  bloclawd-identifiable strings.** Quoting
  `.planning/phases/03-rust-cli/03-CONTEXT.md` D-77:

  > **D-77: Probe prompt body MUST be opaque — bare UUIDv4 only.** The
  > prompt is literally a UUIDv4 string with no surrounding text, no
  > `bloclawd` token, no `probe` token, no version-tagged identifier, no
  > recognizable signature. **Reason:** Anthropic and OpenAI see the
  > upstream traffic from the harness binary; if they can fingerprint
  > bloclawd-CLI prompts, they can ban or selectively rate-limit users
  > who run bloclawd. Anonymity extends to the upstream provider
  > relationship. This rule is permanent and applies to any future
  > feature that shells out to provider tooling.

  The probe runs `claude --print "<uuidv4>"` for `--cc` and
  `codex exec "<uuidv4>"` for `--codex` (Phase 3 D-76); stdin closed,
  no `BLOCLAWD_*` env vars exported into the child.

- **Provider-fingerprinting-safe convergence.** Quoting
  `.planning/phases/03-rust-cli/03-CONTEXT.md` D-78:

  > All non-rate-limit-detected paths converge to one user-visible
  > response. ... ALL of these print
  > `error: server unavailable, please retry` ... and exit 4. ... No
  > probe-specific telemetry, no debug logging, no discriminating exit
  > codes. From a fraudster running just the compiled binary, the probe
  > is invisible.

  The CLI does not telegraph which detection branch it took.

---

## Non-promises

What `bloclawd` does NOT promise. Read these as carefully as the promises.

- **No formal third-party security audit at v1.** The promises above are
  self-asserted, code-and-spec-anchored, and open for community audit —
  but no professional audit firm has reviewed bloclawd (Phase 5 D-125).
- **AS-IS, no warranty.** Per the dual [MIT](./LICENSE-MIT) /
  [Apache-2.0](./LICENSE-APACHE) license. We provide bloclawd in good
  faith; we do not warrant fitness for any particular purpose, including
  deanonymization-resistance against well-resourced adversaries
  (state-level actors, network-position attackers, upstream-provider
  analytics teams with retroactive traffic-fingerprint access).
- **Not a substitute for Anthropic's or OpenAI's own usage telemetry.**
  Provider-side dashboards are authoritative for your account; bloclawd
  is a community-aggregate view of when other users hit limits.
- **API prices in `crates/event-schema/src/catalog.rs` are public-pricing
  best-effort and may be stale.** Per-token prices used for public
  API-equivalent cost are operator-curated from public Anthropic + OpenAI
  pricing pages; users see the "as-of" date on `/methodology`.
- **Supported-version table is best-effort.** Claude Code and Codex
  JSONL formats are upstream-driven; minimum-supported versions are
  enforced as a non-fatal stderr warning, not a hard block (Phase 3
  defensive-parsing discipline; Phase 5 D-126).
- **HSTS preload is NOT enabled at v1.** Preload commits us irrevocably
  to HTTPS on `bloclawd.com` + every subdomain for ~12 months. Deferred
  to v1.0.0 cut (Phase 5 research §Implementation Landmines #8).
- **No release-pipeline cryptographic provenance attestation
  (SLSA / sigstore) at v1.** macOS notarize + sha256 in `install.sh` +
  `cargo publish` from a tagged main commit are the trust chain at v1.
  SLSA-style attestations are a v1.x consideration.
- **No defense against compromised user machines.** If your laptop is
  compromised, an attacker can submit arbitrary events. bloclawd's
  anti-spam is PoW + rate-limit + idempotency; it is not endpoint-security.

---

## Boundary enforcement

Each promise above is automated-tested or grep-gated in CI:

| Promise | Enforcement surface |
|---------|---------------------|
| k-anonymity n ≥ 5 | `apps/worker/src/cron/aggregate.rs` (cron k-anon filter); Phase 4 verification harness |
| Public aggregates only | Cron materialization emits API-cost percentiles and average retained token mix, never raw event rows; `apps/worker/src/cron/aggregate.rs` |
| `tz_offset` / SGID / nonce / per-event timing stripped | Strip-at-cron (Phase 3 D-56, Phase 4 D-103); release-pipeline anonymity grep gate |
| UUIDv4 only | `crates/event-schema` JCS conformance test; `crates/cli` integration round-trip |
| PoW invariant | `crates/pow` Rust test suite + `spec/pow-fixtures.json` KAT vectors; CI gate in `.github/workflows/pow.yml` |
| `deny_unknown_fields` + closed enums | `crates/event-schema::EventPayload` serde derives; `apps/worker` ingest tests |
| Server-assigned `bucket_ts` | `apps/worker` `POST /event` handler (`date_bin` SQL); staging-e2e integration test (Phase 2 D-46) |
| Notarize gating cascade | `.github/workflows/release.yml` `notarize-macos` step (Phase 5 plan 05-04); Phase 5 D-119 fail-closed wiring |
| sha256 in `install.sh` | `cargo dist generate-installer --shell` (Phase 5 plan 05-04); `release-smoke.yml` verifies hash on actual install |
| No fingerprinting in shell-outs | `crates/cli/src/probe.rs` source review; user memory `feedback_no_provider_fingerprinting.md` |
| No `event_id` / nonce / IP in CI logs | `.github/workflows/release-smoke.yml` anonymity grep step (Phase 5 plan 05-05) |

---

## Reporting issues

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure (GitHub
Private Vulnerability Reporting). Non-security issues: open a GitHub Issue.

For the spec-level audit trail, start at:
[`spec/pow-v1.md`](./spec/pow-v1.md) (PoW invariant, 72-byte input, K=22,
60s expiry, JCS canonical form);
[`spec/payload-canonical.md`](./spec/payload-canonical.md) (RFC 8785 JCS
cross-language byte-exact contract);
[`spec/event-schema.md`](./spec/event-schema.md) (wire body shape, closed
enums, snake_case envelope).
