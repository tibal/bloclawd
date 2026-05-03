# Supported harness versions

This file tracks the minimum-supported version (enforced as a non-fatal stderr warning at CLI startup; see Phase 3's graceful-degradation discipline) and the last-tested version (updated per release by the operator after `release-smoke.yml` passes; see [docs/RELEASE.md](./RELEASE.md)) for each harness.

The CLI will run against versions below the minimum, but defensive parsing covers fewer edge cases — you'll see a `[bloclawd] warning: detected $HARNESS version $V is below minimum supported $MIN` line on stderr.

## Claude Code (`--cc`)

| Property | Value |
|----------|-------|
| Minimum supported | `2.1.89` |
| Last tested       | TBD (pending first 0.1.0 smoke) |
| Source of minimum | `crates/cli/src/min_version.rs::MIN_CC_VERSION` |
| Tested fixture    | `crates/cli/tests/fixtures/cc/sample.jsonl` |

Minimum is `2.1.89` because that release ships `assistant.message.usage` fields with input, output, cache-read, and cache-write counts — bloclawd needs all four to compute per-window token totals.

## Codex (`--codex`)

| Property | Value |
|----------|-------|
| Minimum supported | `0.125.0` |
| Last tested       | TBD (pending first 0.1.0 smoke) |
| Source of minimum | `crates/cli/src/min_version.rs::MIN_CODEX_VERSION` |
| Tested fixture    | `crates/cli/tests/fixtures/codex/sample.jsonl` |

Minimum is `0.125.0` because that release ships token-count events with input, output, and cached-input counts — same reason as Claude Code.

## How "last tested" is updated

1. Operator runs `cargo release patch --execute` (or equivalent) which tags `vX.Y.Z` and triggers `.github/workflows/release.yml`.
2. After publish, `.github/workflows/release-smoke.yml` runs `bloclawd --5h --cc <fixture>` and `--codex <fixture>` against the checked-in fixtures. The fixture file headers record the harness versions they were captured against.
3. Operator updates the "Last tested" cells above and commits the change as part of the post-release ceremony documented in [docs/RELEASE.md](./RELEASE.md).

Pending automation: a future enhancement may have `release-smoke.yml` open an auto-PR to update this file directly. For v1 the update is operator-manual (the smoke job runs read-only).
