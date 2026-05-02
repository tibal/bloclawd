# Requirements: bloclawd

**Defined:** 2026-04-30
**Core Value:** A trustworthy, anonymous timeseries of "when do AI subscription users actually hit limits."

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases. Auto-included from research-validated table stakes plus user-stated requirements.

### Specs & Invariants

- [ ] **SPEC-01**: spec/pow-v1.md defines the byte-exact 72-byte PoW input format (32B challenge_id || 32B payload_hash || 8B big-endian nonce, no separators), the stateless HMAC-SHA256 challenge issuance model (single WORKER_SECRET, 60s expiry, no KV), the verification ordering (HMAC → expiry → payload-hash binding → PoW → DB insert), and the difficulty algorithm (K=22 leading zero bits over SHA-256)
- [ ] **SPEC-02**: spec/pow-fixtures.json contains ≥10 cross-language test vectors ({name, challenge_id_b64, payload_canonical_b64, payload_hash_b64, nonce_b64, expected_hash_b64, leading_zero_bits}) including edge cases (k=0, k=1, k=22, k=23, all-zero challenge, all-FF challenge, empty payload, unicode-NFC payload, key-ordering payload, number-formatting payload, max-size payload); generated deterministically by cargo xtask gen-fixtures with a CI drift gate via cargo xtask gen-fixtures --check
- [ ] **SPEC-03**: spec/event-schema.md documents the canonical POST /event payload (model, harness, tier, region, per-window token counts), points to `crates/event-schema/src/enums.rs` as the Rust source of truth for model/tier/harness/region enums, points to `apps/web/src/generated/` as the ts-rs TypeScript binding output consumed by the SPA, and excludes tz_offset / event_id / nonce / country / user_id / session_id / account_id / ip from the wire payload (region is derived client-side from tz_offset+country and is the only geographic field submitted)
- [ ] **SPEC-04**: CI workflow at `.github/workflows/pow.yml` runs the Rust PoW fixture suite (`cargo test -p pow`) plus the deterministic-fixture drift gate (`cargo xtask gen-fixtures --check`) plus the ts-rs binding drift gate (`cargo test --features ts-export -p event-schema --locked` and `git diff --exit-code apps/web/src/generated/`) plus the log-boundary grep gate (INGE-11) plus the WASM size gate (`worker-build --release` and size < 2,621,440 bytes) on every PR; any failure blocks merge. Pre-Phase-1.5 used a transitional TypeScript Worker verifier job; that verifier and job were retired in 01.5-04.
- [ ] **SPEC-05**: spec/payload-canonical.md documents RFC 8785 JCS as the canonical payload form and names a single Rust JCS implementation: `serde_jcs = "0.2"` (workspace dependency). CLI, xtask, and the Rust Worker consume it through `crates/event-schema::canonical_bytes`. RFC 8785 conformance is gated by `crates/event-schema/tests/jcs_conformance.rs` using official cyberphone/json-canonicalization KAT vectors; on vector failure the workspace dependency flips mechanically to `serde_json_canonicalizer = "0.3"` per Phase 1.5 research. The frontend `/data` page renderer reads the same canonical bytes re-encoded for display; it does not reimplement JCS in TypeScript.

### Backend (Pricing & Schema)

- [ ] **BACK-01**: PlanetScale tier confirmed and budget alert configured before any DB write (free tier deprecated 2024)
- [x] **BACK-02**: `events` table created in PlanetScale Postgres with `event_id UUID PRIMARY KEY`, `event_type TEXT`, `bucket_ts TIMESTAMPTZ` (server-assigned, floored to 15-min), `payload JSONB`, `received_at TIMESTAMPTZ DEFAULT now()`, split-out `model`, `tier`, `harness`, and `region` columns, plus an index on `(bucket_ts, model, tier, harness, region)`
- [x] **BACK-03**: Hyperdrive config attached to PlanetScale; ingest Worker bindings include Hyperdrive (DB), R2 (REPORTS), and a WORKER_SECRET secret (set via wrangler secret put; ≥256 bits of entropy; used to HMAC-sign PoW challenges per spec/pow-v1.md). No KV binding.
- [x] **BACK-04**: `compatibility_date` pinned with comment in `wrangler.toml` (rationale: workers-rs 0.8.1 build pipeline; Rust-to-WASM does not need Node compatibility flags). Worker placement set to `smart`. Build pipeline is `worker-build 0.8.1` matched 1:1 with `worker = 0.8.1`, producing the WASM artifact at `apps/worker/build/worker/index.wasm` for the size gate.

### Worker Rust Migration (Phase 1.5)

- [ ] **BACK-05**: `apps/worker/` is a Rust crate using the `worker` crate (workers-rs); `wrangler.toml` is configured for the Rust→WASM build (e.g., `worker-build`). The legacy TS scaffold (`apps/worker/src/*.ts`, `package.json`, `vitest.config.ts`, `test/*.ts`) is deleted in this phase. `worker::Router` (or equivalent) handles `GET /challenge` and `POST /event`; `#[event(scheduled)]` provides the cron stub.
- [ ] **BACK-06**: `crates/event-schema` exports the canonical `EventPayload` Rust struct, `TokenCounts`, the model/tier/harness/region enums from `crates/event-schema/src/enums.rs`, and the JCS canonical-form helper. Both `crates/cli` (Phase 3) and `apps/worker/` consume it. TypeScript bindings are generated via ts-rs into `apps/web/src/generated/`; there is no parallel hand-written TypeScript schema or runtime JSON schema source.
- [ ] **BACK-07**: `crates/pow` is consumed directly by the Worker for verification; the prior TypeScript verifier was deleted in 01.5-04. CI's `.github/workflows/pow.yml` is a Rust gate (`cargo test -p pow` + `cargo xtask gen-fixtures --check`) plus ts-rs drift, log-boundary, and WASM-size gates; the old TypeScript Worker test job is removed.
- [ ] **BACK-08**: A staging Rust Worker deploys; `GET /db-ping` opens a `tokio-postgres` connection through the workers-rs 0.8.1 first-class `Hyperdrive` binding to a PlanetScale staging branch, runs `SELECT 1` with the upstream `tokio-postgres` `query_typed_one` API, returns `{ok: true}`, and closes the client before the response future resolves — proving the workers-rs + tokio-postgres + Hyperdrive triplet works before Phase 2 builds ingest endpoints on top.

### Ingest Worker

- [x] **INGE-01**: GET /challenge issues a 32-byte challenge_id (8B unix_ms_be || 24B crypto_random) plus a 32-byte HMAC-SHA256(WORKER_SECRET, challenge_id) signature, returns {challenge_id, sig, difficulty, expires_in: 60} — no KV write, stateless
- [x] **INGE-02**: POST /event validates the request body, recomputes HMAC over challenge_id with WORKER_SECRET (constant-time compare against received sig), rejects if signature invalid; decodes unix_ms_be from challenge_id[0..8] and rejects if (now - unix_ms_be) > 60s or unix_ms_be > now + 5s clock-skew
- [x] **INGE-03**: `POST /event` verifies PoW by calling `crates/pow::verify` directly from the Rust Worker (`apps/worker/src/lib.rs`). The pre-Phase-1.5 TypeScript verifier was deleted in 01.5-04; there is no parallel TypeScript verifier and no parallel fixture loader.
- [x] **INGE-04**: POST /event recomputes payload_hash = SHA-256(JCS(payload)) server-side, rejects if it differs from the payload_hash bound into the PoW input; on PoW + payload-hash + signature + expiry success, inserts to PlanetScale Postgres via Hyperdrive with `ON CONFLICT (event_id) DO NOTHING` on `event_id UUID PRIMARY KEY` for idempotency
- [x] **INGE-05**: Worker decodes the top-level base64url `event_id` into a canonical Postgres `uuid`; insert uses PostgreSQL `INSERT ... ON CONFLICT (event_id) DO NOTHING` on `event_id` for idempotency
- [x] **INGE-06**: Server assigns `bucket_ts` with Postgres 15-minute bucketing, e.g. `date_bin('15 minutes', now(), '1970-01-01 00:00:00+00'::timestamptz)` — never trust client-provided timestamps
- [x] **INGE-07**: Payload validated by `crates/event-schema::EventPayload` (the shared workspace crate's strongly-typed serde struct + closed enum types from `crates/event-schema/src/enums.rs`) before insert. Validation order: (1) serde rejects unknown enum values natively with the offending variant; (2) `#[serde(deny_unknown_fields)]` on `EventPayload` and `TokenCounts` rejects unknown fields; (3) `EventPayload::validate()` rejects `v != 1` and any token field > 1_000_000_000. The validator is hand-rolled because closed enum sets plus bounded integer checks are smaller and clearer for WASM than a derive validation dependency.
- [x] **INGE-08**: Per-request `tokio-postgres` client opened from the workers-rs 0.8.1 first-class `Hyperdrive` binding (`env.get_binding::<Hyperdrive>("DB")?.connect()?` returns the bridged `Socket` directly) and closed before the Worker response future resolves; no global pool. The connection future is spawned on the wasm event loop via `wasm_bindgen_futures::spawn_local`. Plan 01.5-03 proved upstream `tokio-postgres` rev `35a85bdbfeeac465e092950f65a10d9192418175` works through Hyperdrive using `query_typed_one`; the earlier devsnek fork assumption is no longer current for this smoke path, but can be re-evaluated if Phase 2 needs APIs that cannot avoid prepared statements.
- [x] **INGE-09**: PoW input binds payload hash so a solved challenge cannot be reused with a different payload — this is the PRIMARY cryptographic replay defense (no KV consume-on-use exists); event_id PRIMARY KEY and 60s challenge expiry are the secondary database and temporal layers
- [x] **INGE-10**: Edge rate-limit per IP via the workers-rs 0.8.1 first-class `RateLimiter` binding (`env.get_binding::<RateLimiter>("RL_CHALLENGE")?.limit(key).await -> RateLimitOutcome`). Two separate bindings declared in `wrangler.toml`: `RL_CHALLENGE` at 10 / 60s for `GET /challenge`, `RL_EVENT` at 3 / 60s for `POST /event`, both keyed on `cf-connecting-ip`. On exceed, return HTTP 429 with `Retry-After: <seconds>` and JSON body `{error: "rate_limited", route: "challenge|event", retry_after_s: N}`. No log line anywhere contains the IP.
- [x] **INGE-11**: No log emitter (`worker::console_log!`, structured tracing, or any other) writes per-event timing data, nonce values, `event_id`, IPs, `WORKER_SECRET`, the Hyperdrive connection string, or any field of the Hyperdrive typed binding (`host`, `port`, `user`, `password`, `database`) anywhere in the Worker or in Cron. The CI gate at `.github/workflows/pow.yml` runs a `log-boundary` grep over `apps/worker/` and `crates/` and fails on forbidden `console_log!` output.

### CLI (Rust)

- [ ] **CLI-01**: Rust crate `bloclawd` builds a single static binary on darwin-arm64, darwin-x64, linux-x64-musl
- [ ] **CLI-02**: Flag parsing via `clap` derive: `--5h`, `--week`, `--end <local-time>`, `--cc`, `--codex`, `--dry-run`, `--yes`, `--json`, `--no-color`, `--version`, `--help`
- [ ] **CLI-03**: CC session walker discovers sessions at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and parses defensively (line-by-line, `serde_json::Value` + `.get()` walks, never strict serde structs)
- [ ] **CLI-04**: Codex session walker discovers sessions at `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl{,.zst}` (default `~/.codex`) and parses defensively
- [ ] **CLI-05**: Per-line parse-failure counter surfaced; CLI does not abort on any single bad line
- [ ] **CLI-06**: Computes per-window per-model token counts: input, output, cached read, cached write, 5-min and 1-hour windows; aggregates within the user-selected window
- [ ] **CLI-07**: Country derived via `sys-locale` crate (no IP lookup); `BLOCLAWD_COUNTRY=` env override accepted
- [ ] **CLI-08**: PoW solver uses `sha2` crate (auto-uses SHA-NI/ARM crypto extensions); reports progress; hard-times-out at 30s
- [ ] **CLI-09**: `event_id` is UUIDv4 only (never v7 — v7 leaks timestamp)
- [ ] **CLI-10**: `--dry-run` prints the payload that would be submitted, byte-identical to the actual submit (single canonical formatter shared by both paths)
- [ ] **CLI-11**: Pre-submit confirmation prompt `[y/N]` shown by default; `--yes` skips prompt for scripted use
- [ ] **CLI-12**: Helpful errors when no CC/Codex artifacts found, when neither `--cc` nor `--codex` is given, when both are given without disambiguation
- [ ] **CLI-13**: `NO_COLOR` and TTY auto-detect honored; `--no-color` forces off
- [ ] **CLI-14**: `--json` emits machine-readable status output (not the colorized human view)
- [ ] **CLI-15**: Documented exit codes (0 success, 1 user error, 2 no artifacts found, 3 PoW timeout, 4 server error)
- [ ] **CLI-16**: Submits via `reqwest` blocking + `rustls-tls` to `https://api.bloclawd.com/event`
- [ ] **CLI-17**: Anonymized fixture session files (CC + Codex) committed; CI asserts known token totals against them
- [ ] **CLI-18**: Minimum supported CC and Codex versions documented in README and asserted at startup with helpful error if older
- [ ] **CLI-19**: Before submitting events to the ingest Worker, the CLI shells out to the appropriate harness binary (`claude --print "<bare-uuidv4>"` for CC, `codex exec "<bare-uuidv4>"` for Codex) with an opaque UUIDv4 prompt and only proceeds with submission if the harness responds with an unambiguous rate-limit signature on stdout+stderr (substring match, lowercased). The probe runs AFTER PoW solve and AFTER user consent, BEFORE the first POST. Any deviation (binary missing, child exits 0, child times out, child returns a non-rate-limit error, child returns a rate-limit error of unrecognized shape) converges to a single `server_unavailable`-shape error response with exit code 4. The probe prompt body MUST be opaque (no `bloclawd`/`probe`/version-tagged identifier) to prevent provider fingerprinting that could ban or selectively rate-limit users running bloclawd. Child env strips all `BLOCLAWD_*` variables. `--dry-run` does NOT run the probe.

### Aggregation (Cron + R2 Materialization)

- [ ] **AGGR-01**: Cron runs every 15 min via Worker `scheduled` handler in the same Worker as ingest (split criteria documented but not yet triggered)
- [ ] **AGGR-02**: Per-cohort double-MAD outlier trim applied at `3 × MAD` threshold (separate upper/lower MAD for skew, cohort = `(model, tier, harness, region)`) before percentile aggregation
- [ ] **AGGR-03**: Trim rate per cohort surfaced as a metric; >5% triggers warning, >10% triggers escalation
- [ ] **AGGR-04**: Per-cohort percentiles (p10, p25, p50, p75, p90) computed via `PERCENT_RANK()` over trimmed rows
- [ ] **AGGR-05**: k-anonymity enforced at materialization: cells with `n < 5` are suppressed from public R2 output
- [ ] **AGGR-06**: Token counts binned to log-spaced buckets before public R2 emission (raw integers never published)
- [ ] **AGGR-07**: `tz_offset` dropped from public R2 output (and never persisted in raw form — coarse `region` only)
- [ ] **AGGR-08**: `event_id` and `nonce` never written to any R2 file
- [ ] **AGGR-09**: R2 layout is tiered: `reports/v1/q15/<YYYY>/<MM>/<DD>/<HH>-<mm>.json` for past 24h, `reports/v1/h1/<YYYY>/<MM>/<DD>/<HH>.json` for past 7 days, `reports/v1/d1/<YYYY>/<MM>/<DD>.json` indefinitely
- [ ] **AGGR-10**: Each bucket file contains dimension-pre-aggregated `cells[]` so the dashboard filters in-memory
- [ ] **AGGR-11**: `manifest.json` lists available buckets per tier; updated last after all bucket files written (write-order matters)
- [ ] **AGGR-12**: Frontend consumes enum sets via the ts-rs generated TypeScript bindings in `apps/web/src/generated/` (`Model.ts`, `Tier.ts`, `Harness.ts`, `Region.ts`, plus `EventPayload.ts`, `TokenCounts.ts`, and the hand-maintained `index.ts` barrel). No enums.json is published to R2; the Rust enum source of truth (`crates/event-schema/src/enums.rs`) is the single canonical list, kept in sync with the SPA by the ts-rs drift gate in CI. If a third-party non-SPA data consumer materializes in v2, an R2 enum manifest can be regenerated from the same Rust source via an `xtask gen-public-enums-json` command.
- [ ] **AGGR-13**: Cache-Control headers set per-object on R2 put: rolled-over buckets get `public, max-age=31536000, immutable`; `manifest.json` gets `public, max-age=60, must-revalidate`
- [ ] **AGGR-14**: Cron writes `_status.json` (last-cron-success-ts, ingest-health) for use by the dashboard

### Frontend (Marketing + Dashboard)

- [ ] **WEB-01**: Vite 6 + React 19 SPA deployed via `@cloudflare/vite-plugin` 1.x, `not_found_handling = "single-page-application"`
- [ ] **WEB-02**: Marketing page at `/` explains what bloclawd is, links to dashboard, methodology, source repo
- [ ] **WEB-03**: `/dashboard` renders a uPlot timeseries chart with toggleable spread bands (default p25/p75; toggle to p10/p90; persisted in URL state)
- [ ] **WEB-04**: Filter UI with model / tier / harness / region selectors and time-window picker; all state synced to URL parameters from day 1
- [ ] **WEB-05**: Side-by-side tier comparison overlay (e.g. Pro vs Max5 vs Max20 on the same chart)
- [ ] **WEB-06**: TanStack Query v5 fetcher with `staleTime: Infinity` for past q15/h1/d1 buckets, default for the live bucket; concurrency cap 8
- [ ] **WEB-07**: Lazy bucket loading respects the selected time window — picks the coarsest tier that fits (q15 for ≤24h, h1 for ≤7d, d1 beyond)
- [ ] **WEB-08**: Last-updated timestamp + total events + approximate contributor count visible in dashboard chrome
- [ ] **WEB-09**: Ingest health indicator visible (sourced from `_status.json`)
- [ ] **WEB-10**: Hover tooltips show numeric values for median + percentile bands at the hovered timestamp
- [ ] **WEB-11**: Color-independent line styling (different stroke patterns + color); accessible HTML `<table>` data fallback rendered below each chart
- [ ] **WEB-12**: Dark mode via `prefers-color-scheme` (no toggle in v1)
- [ ] **WEB-13**: Mobile responsive (charts and filters usable at phone widths)
- [ ] **WEB-14**: `/methodology` page documents the trust contract: PoW spec link, double-MAD outlier policy, k-anonymity policy, log-binning policy, link to source repo
- [ ] **WEB-15**: `/data` page renders the literal payload schema, byte-identical to the CLI dry-run output (single canonical formatter shared with the CLI)
- [ ] **WEB-16**: Public data license declared (CC BY 4.0)
- [ ] **WEB-17**: `/methodology/changelog` exists (may be empty at v1)

### Distribution & Launch

- [ ] **DIST-01**: `cargo dist init` configured with targets `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-musl`; installers `["shell", "homebrew"]`
- [ ] **DIST-02**: GitHub Release workflow uploads prebuilt binaries on tag push
- [ ] **DIST-03**: macOS binaries signed and notarized via `notarytool` (Apple Developer account active)
- [ ] **DIST-04**: Personal Homebrew tap `homebrew-bloclawd` repo created; cargo-dist auto-PRs the formula on each release
- [ ] **DIST-05**: `install.sh` served from `bloclawd.com/install.sh` (frontend Worker static asset)
- [ ] **DIST-06**: `crates.io` publish wired via `cargo publish` (or cargo-release) for `cargo install bloclawd`
- [ ] **DIST-07**: DNS configured: `bloclawd.com` apex + `www` → frontend Worker; `api.bloclawd.com` → ingest Worker (auto-CNAME via Worker custom-domain attach); `data.bloclawd.com` → R2 custom domain (one-time manual attach via Cloudflare dashboard); `bloclawd.org` → Cloudflare Bulk Redirect 301 → `bloclawd.com`
- [ ] **DIST-08**: "Always Use HTTPS" + HSTS enabled
- [ ] **DIST-09**: Public repo with MIT or Apache-2.0 license declared from day 1; LICENSE file present; README threat-model section ("we don't trust your CLI either") published
- [ ] **DIST-10**: README documents the install paths (cargo / brew / curl), supported CC and Codex versions, and links to `/methodology` and `/data`

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Trust & Transparency Polish

- **TRST-01**: Versioned `/v1/` data API formal announcement (after R2 layout has been stable ~1 month)
- **TRST-02**: Nightly point-in-time data dump for researchers
- **TRST-03**: First-run CLI summary with community comparison
- **TRST-04**: Compare-to-self mode (CLI prints a dashboard URL with the just-submitted snapshot in the fragment)
- **TRST-05**: PNG / CSV chart export

### Provider Expansion

- **PROV-01**: Cursor session artifact parsing
- **PROV-02**: Aider, Cline, Continue support
- **PROV-03**: Generic adapter for new harnesses (plugin model)

### Observability

- **OBSV-01**: PoW K-difficulty calibration dashboard (consume/issue ratio, solve-time p95 by hardware class)
- **OBSV-02**: Quarterly compatibility-date bump checklist
- **OBSV-03**: Trim-rate alerting wired to a status page

### Accessibility & i18n

- **A11Y-01**: Full WAI-ARIA Graphics Module chart accessibility
- **A11Y-02**: i18n / localization
- **A11Y-03**: Embeddable iframe widget

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. Anti-features tied to bloclawd's anonymity / trust contract.

| Feature | Reason |
|---------|--------|
| User accounts / sign-in | Anonymity is core to the trust model |
| Per-user history view | Anonymity precludes correlating events back to a user |
| Real-time / sub-15min freshness | 15-min cron is enough for community trends; cheaper, simpler |
| Background daemon / always-on telemetry | CLI is invocation-only at moment of pain — reduces noise, reinforces trust |
| `--opt-out` flag | CLI never runs uninvited; uninstall == opt-out |
| IP-based geolocation | TZ + locale-derived country is enough; IP geo would erode anonymity |
| Server-side IP logging | Erodes anonymity; rate-limits use in-memory buckets only |
| Workers Queues for batched ingest | At ≤1 event/user/5h, direct write is fine |
| Workers Analytics Engine as primary store | PlanetScale chosen; revisit only at huge scale |
| Turnstile / CAPTCHA | PoW + payload validation + outlier trim should suffice |
| Dynamic / per-IP PoW difficulty tuning | `K=22` static and config-driven for v1 |
| GDPR consent banner | Collects no personal data; banner would be theater |
| API keys on `data.bloclawd.com` | Public data is the product |
| Auto-update for the CLI | Surprise binary changes break trust |
| Mobile native apps | Web dashboard only |
| Email / push notifications | No accounts to notify |
| Tracking AI providers / harnesses beyond Claude Code and Codex in v1 | Start narrow, expand once schema is proven |
| Schema migrations workflow tooling | Use PlanetScale branches when this matters; not v1 |
| Production observability tooling (Logs, Workers Analytics) | Ship without; add when there's traffic to look at |
| Hidden / obfuscated CLI binary | Anti-pattern; security through obscurity is not the defense |
| Server-side blocklist of "bad" submitters | Recreates identity; defenses are validation + outlier trim |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPEC-01 | Phase 1 | Pending |
| SPEC-02 | Phase 1 | Pending |
| SPEC-03 | Phase 1 | Pending |
| SPEC-04 | Phase 1 | Pending |
| SPEC-05 | Phase 1 | Pending |
| BACK-01 | Phase 1 | Pending |
| BACK-02 | Phase 2 | Complete |
| BACK-03 | Phase 2 | Complete |
| BACK-04 | Phase 2 | Complete |
| BACK-05 | Phase 1.5 | Pending |
| BACK-06 | Phase 1.5 | Pending |
| BACK-07 | Phase 1.5 | Pending |
| BACK-08 | Phase 1.5 | Pending |
| INGE-01 | Phase 2 | Complete |
| INGE-02 | Phase 2 | Complete |
| INGE-03 | Phase 2 | Complete |
| INGE-04 | Phase 2 | Complete |
| INGE-05 | Phase 2 | Complete |
| INGE-06 | Phase 2 | Complete |
| INGE-07 | Phase 2 | Complete |
| INGE-08 | Phase 2 | Complete |
| INGE-09 | Phase 2 | Complete |
| INGE-10 | Phase 2 | Complete |
| INGE-11 | Phase 2 | Complete |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| CLI-04 | Phase 3 | Pending |
| CLI-05 | Phase 3 | Pending |
| CLI-06 | Phase 3 | Pending |
| CLI-07 | Phase 3 | Pending |
| CLI-08 | Phase 3 | Pending |
| CLI-09 | Phase 3 | Pending |
| CLI-10 | Phase 3 | Pending |
| CLI-11 | Phase 3 | Pending |
| CLI-12 | Phase 3 | Pending |
| CLI-13 | Phase 3 | Pending |
| CLI-14 | Phase 3 | Pending |
| CLI-15 | Phase 3 | Pending |
| CLI-16 | Phase 3 | Pending |
| CLI-17 | Phase 3 | Pending |
| CLI-18 | Phase 3 | Pending |
| CLI-19 | Phase 3 | Pending |
| AGGR-01 | Phase 4 | Pending |
| AGGR-02 | Phase 4 | Pending |
| AGGR-03 | Phase 4 | Pending |
| AGGR-04 | Phase 4 | Pending |
| AGGR-05 | Phase 4 | Pending |
| AGGR-06 | Phase 4 | Pending |
| AGGR-07 | Phase 4 | Pending |
| AGGR-08 | Phase 4 | Pending |
| AGGR-09 | Phase 4 | Pending |
| AGGR-10 | Phase 4 | Pending |
| AGGR-11 | Phase 4 | Pending |
| AGGR-12 | Phase 4 | Pending |
| AGGR-13 | Phase 4 | Pending |
| AGGR-14 | Phase 4 | Pending |
| WEB-01 | Phase 4 | Pending |
| WEB-02 | Phase 4 | Pending |
| WEB-03 | Phase 4 | Pending |
| WEB-04 | Phase 4 | Pending |
| WEB-05 | Phase 4 | Pending |
| WEB-06 | Phase 4 | Pending |
| WEB-07 | Phase 4 | Pending |
| WEB-08 | Phase 4 | Pending |
| WEB-09 | Phase 4 | Pending |
| WEB-10 | Phase 4 | Pending |
| WEB-11 | Phase 4 | Pending |
| WEB-12 | Phase 4 | Pending |
| WEB-13 | Phase 4 | Pending |
| WEB-14 | Phase 4 | Pending |
| WEB-15 | Phase 4 | Pending |
| WEB-16 | Phase 4 | Pending |
| WEB-17 | Phase 4 | Pending |
| DIST-01 | Phase 5 | Pending |
| DIST-02 | Phase 5 | Pending |
| DIST-03 | Phase 5 | Pending |
| DIST-04 | Phase 5 | Pending |
| DIST-05 | Phase 5 | Pending |
| DIST-06 | Phase 5 | Pending |
| DIST-07 | Phase 5 | Pending |
| DIST-08 | Phase 5 | Pending |
| DIST-09 | Phase 5 | Pending |
| DIST-10 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 82 total
- Mapped to phases: 82
- Unmapped: 0

**By phase:**
- Phase 1 (Foundations): 6 requirements (SPEC-01..05, BACK-01)
- Phase 1.5 (Worker Rust Migration): 4 requirements (BACK-05..08)
- Phase 2 (Ingest Backbone): 14 requirements (BACK-02..04, INGE-01..11)
- Phase 3 (Rust CLI): 19 requirements (CLI-01..19)
- Phase 4 (Aggregation + Dashboard): 31 requirements (AGGR-01..14, WEB-01..17)
- Phase 5 (Launch): 10 requirements (DIST-01..10)

---
*Requirements defined: 2026-04-30*
*Last updated: 2026-04-30 — Phase 1 doc-conflict resolution: SPEC-01/02/03 rewritten for 72-byte input + JCS; SPEC-05 added; INGE-01/02/04/09 rewritten for HMAC model; BACK-03 KV removed (5 phases, 77/77 mapped)*
*2026-04-30 — Phase 1.5 inserted: SPEC-04, SPEC-05, BACK-04, INGE-03, INGE-07, INGE-08, INGE-10, INGE-11 rewritten for Rust Worker; BACK-05..08 added (6 phases, 81/81 mapped).*
*2026-04-30 — Phase 1.5 complete: BACK-04, INGE-03, INGE-07, INGE-08, INGE-10, INGE-11, SPEC-04, SPEC-05, AGGR-12 rewritten for Rust Worker + crates/event-schema source of truth + ts-rs bindings + R2 enums.json drop.*
*2026-05-02 — Phase 3 Wave 0: CLI-19 added (post-PoW liveness probe per D-74); Phase 3 count 18 → 19; total 81 → 82.*
