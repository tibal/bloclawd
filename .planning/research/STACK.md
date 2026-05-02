# Stack Research

**Domain:** PoW-gated anonymous analytics service (Rust CLI + Rust Cloudflare Worker + Vite/React SPA)
**Researched:** 2026-04-30
**Updated:** 2026-04-30 - Phase 1.5 Rust Worker migration complete
**Confidence:** HIGH for workers-rs 0.8.1 APIs and ts-rs 12; HIGH for the 01.5-03 Hyperdrive smoke result; MEDIUM for future ingest query shapes until Phase 2 validates them.

## Recommended Stack

### Rust CLI

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Rust | 1.86+ stable, 2024 edition | `bloclawd` CLI binary | Static binaries, fast SHA-256, easy cargo/Homebrew/install-script distribution. |
| `clap` | 4.5+ | CLI flag parsing | Standard derive-based UX. |
| `serde` + `serde_json` | 1.x | Defensive JSONL parsing and payload serialization | Matches workspace conventions. |
| `reqwest` | 0.12, blocking + rustls | HTTPS GET `/challenge` and POST `/event` | No async runtime needed in CLI. |
| `sha2` | 0.10 | PoW solver | Same hashing family as `crates/pow`. |
| `uuid` | 1.x, v4 only | Anonymous `event_id` | v4 avoids timestamp leakage. |

### Worker (Rust)

| Crate / Tool | Version / Source | Purpose | Current Decision |
|--------------|------------------|---------|------------------|
| `worker` | `0.8.1` | Cloudflare Workers Rust SDK: `Router`, `Env`, `Hyperdrive`, `RateLimiter`, `Socket`, event macros | Canonical Worker SDK. Plan 01.5-02 scaffold and 01.5-03 smoke test compile against it. |
| `worker-build` | `0.8.1` | Rust-to-WASM build pipeline from `wrangler.toml` | Matched to `worker` minor version. Emits Worker bundle for size gate. |
| `tokio-postgres` | upstream `rust-postgres/rust-postgres` rev `35a85bdbfeeac465e092950f65a10d9192418175`, `js` feature, default features off | Postgres client over workers-rs `Socket` | Plan 01.5-03 proved repeated `/db-ping` works through Hyperdrive when using `query_typed_one`. Earlier fork assumption is not current for this smoke path. |
| `wasm-bindgen-futures` | `0.4` | `spawn_local` for the Postgres connection future | Required to drive the background connection on the wasm event loop. |
| `url` | `2.5+` | URL parsing if a route needs connection-string parts | Supporting utility. |
| `console_error_panic_hook` | `0.1` | Panic visibility during Worker execution | Used at Worker startup. |
| path dep `crates/event-schema` | workspace | `EventPayload`, closed enums, JCS helper | Canonical schema source. |
| path dep `crates/pow` | workspace | PoW verify witness and future `/event` verification | Single Rust verifier. |

### Shared Types Crate

| Crate | Version | Purpose | Current Decision |
|-------|---------|---------|------------------|
| `serde` + `serde_json` | workspace | Typed payload deserialize/serialize | Closed enums and `#[serde(deny_unknown_fields)]` reject unknown data early. |
| `serde_jcs` | `0.2` workspace dep | RFC 8785 canonical bytes | Kept from Phase 1; covered by RFC 8785 KAT test in `crates/event-schema/tests/jcs_conformance.rs`. |
| `thiserror` | workspace | Typed validation errors | Matches `crates/pow` style. |
| `ts-rs` | `12` | TypeScript binding emission | `cargo test --features ts-export -p event-schema --locked` emits into `apps/web/src/generated/`; CI checks drift with `git diff --exit-code`. |

Canonical enum values live in `crates/event-schema/src/enums.rs`. The SPA imports generated TypeScript bindings from `apps/web/src/generated/`. No R2 enum manifest is part of v1.

### Frontend SPA

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Browser-only frontend language |
| Vite | 6.x | React SPA build |
| `@cloudflare/vite-plugin` | 1.x | Cloudflare Workers dev/deploy parity |
| React | 19.x | UI |
| TanStack Query | 5.x | R2 bucket fetching and cache policy |
| uPlot | 1.6 | Time-series charting with spread bands |

## Current Worker Patterns

### Hyperdrive

Use workers-rs 0.8.1 first-class typed binding:

```rust
let hyperdrive = ctx.env.get_binding::<Hyperdrive>("DB")?;
let socket = hyperdrive.connect()?;
let (client, connection) = config.connect_raw(socket, NoTls).await?;
wasm_bindgen_futures::spawn_local(async move {
    let _ = connection.await;
});
let row = client.query_typed_one("SELECT 1", &[]).await?;
drop(client);
```

Plan 01.5-03 deployed this pattern to staging at `https://bloclawd-worker-staging.<account-subdomain>.workers.dev/db-ping` and repeated smoke requests returned `{"ok":true}`.

### Rate Limiting

Use workers-rs 0.8.1 first-class `RateLimiter`:

```rust
let limiter = ctx.env.get_binding::<RateLimiter>("RL_EVENT")?;
let outcome = limiter.limit(key).await?;
```

The key is derived from `cf-connecting-ip` at the edge; bloclawd does not log or persist IPs.

### Validation

Use `crates/event-schema::EventPayload` with serde and the hand-rolled `EventPayload::validate()` method. This is smaller and clearer than adding a derive validation dependency for v1's closed enum sets and bounded token fields.

### Build Gates

`.github/workflows/pow.yml` runs:

- `cargo test -p pow --locked`
- `cargo run -p xtask --quiet --locked -- gen-fixtures --check`
- `cargo test --features ts-export -p event-schema --locked`
- `git diff --exit-code apps/web/src/generated/`
- log-boundary grep over `apps/worker/` and `crates/`
- `worker-build --release` with WASM size < 2,621,440 bytes

## Version Compatibility

| Component | Requires | Notes |
|-----------|----------|-------|
| `worker = "0.8.1"` | Rust-to-WASM Worker crate | Provides first-class `Hyperdrive` and `RateLimiter` bindings used by downstream phases. |
| `worker-build = "0.8.1"` | CLI installed locally/CI | The CLI may require a newer local Rust toolchain than the workspace MSRV because of transitive dependencies. |
| `tokio-postgres` upstream rev `35a85bdbfeeac465e092950f65a10d9192418175` | `features = ["js"]`, default features off | Use `query_typed_*` APIs through Hyperdrive. |
| `serde_jcs = "0.2"` | RFC 8785 KAT test must pass | If KAT fails, switch mechanically to `serde_json_canonicalizer = "0.3"`. |
| `ts-rs = "12"` | `TS_RS_EXPORT_DIR=apps/web/src/generated` | Set through `.cargo/config.toml`. |

## Sources

- Phase 01.5 research: `.planning/phases/01.5-worker-rust-migration-inserted/01.5-RESEARCH.md`
- Phase 01.5 Plan 01 summary: `crates/event-schema`, ts-rs bindings, JCS conformance
- Phase 01.5 Plan 02 summary: Rust Worker scaffold and `worker-build`
- Phase 01.5 Plan 03 summary: live Hyperdrive `/db-ping` with upstream `tokio-postgres` and `query_typed_one`
- Phase 01.5 Plan 04 summary: Rust-only cut-over, TS scaffold deletion, CI gate collapse

---
*Stack research for: PoW-gated anonymous analytics edge service*
*Updated: 2026-04-30*
