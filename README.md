# bloclawd

Anonymous, user-triggered analytics for AI coding subscription limits.

The `bloclawd` CLI reads local Claude Code or Codex session logs after you hit a provider limit, builds an anonymous token-usage payload for a fixed time window, shows the exact event that would be sent, and only submits after explicit confirmation.

## Install

From this repository:

```sh
cargo install --path crates/cli
```

That installs `bloclawd` to `$CARGO_HOME/bin/bloclawd`, usually `~/.cargo/bin/bloclawd`.

For local development without installing:

```sh
cargo run -p bloclawd-cli -- --cc --tier max20 --end 16:00 --5h --dry-run
```

Release distribution is planned for `cargo install bloclawd`, Homebrew, and a `curl | sh` installer with prebuilt binaries.

## Supported Inputs

`bloclawd` supports these local harness artifact roots:

| Harness | Flag | Session path |
| --- | --- | --- |
| Claude Code | `--cc` | `~/.claude/projects/**/*.jsonl` |
| Codex | `--codex` | `$CODEX_HOME/sessions/**/*.jsonl`, defaulting to `~/.codex/sessions/**/*.jsonl` |

Minimum supported producer versions are pinned in `crates/cli/src/min_version.rs`:

| Constant | Minimum version | Why |
| --- | --- | --- |
| `MIN_CC_VERSION` | `2.1.89` | Requires Claude Code assistant-message usage fields for input, output, cache read, and cache write counts. |
| `MIN_CODEX_VERSION` | `0.125.0` | Requires Codex token-count events with input, output, and cached-input counts. |

## Usage

Dry-run first. This does not contact the network and does not run the provider probe.

```sh
bloclawd --cc --tier max20 --end 16:00 --5h --dry-run
bloclawd --codex --tier pro_codex --end 16:00 --5h --dry-run
```

Submit mode prints the dry-run view, asks one `[y/N]` confirmation for the whole batch, fetches a PoW challenge per event, solves it locally, runs the provider rate-limit probe once, and submits each event.

```sh
bloclawd --cc --tier max20 --end 16:00 --5h
bloclawd --codex --tier pro_codex --end 16:00 --5h --yes
```

`--tier` is persisted to `~/.config/bloclawd/config.toml`. Later runs may omit `--tier` if the config exists.

`--week` is currently dry-run only in v1:

```sh
bloclawd --cc --tier max20 --end 16:00 --week --dry-run
```

## Tiers

Claude Code runs must use Anthropic tiers:

```text
pro, max5, max20
```

Codex runs must use OpenAI tiers:

```text
plus, pro_codex, business
```

The CLI rejects mismatched combinations such as `--cc --tier pro_codex`.

## Fixture Anonymization

The repository keeps anonymized fixture JSONL under `crates/cli/tests/fixtures/`. To generate a new fixture from a real session:

```sh
cargo run -p xtask -- anonymize-session --harness cc --input <real.jsonl> --output crates/cli/tests/fixtures/cc/<name>.jsonl
cargo run -p xtask -- anonymize-session --harness codex --input <real.jsonl> --output crates/cli/tests/fixtures/codex/<name>.jsonl
```

The anonymizer preserves model IDs, token counts, and JSON shape while replacing prompts, tool arguments, paths, UUIDs, and timestamps with deterministic placeholders.

## Privacy And Threat Model

The CLI is not background telemetry. It runs only when invoked by the user, derives the payload locally, and submits no account identity.

Phase 3's CLI threat model is documented in `.planning/phases/03-rust-cli/03-07-orchestration-fixtures-PLAN.md`. Later backend phases add the public-data anonymity controls: k-anonymity suppression, binned token counts, no public event IDs or nonces, and no persisted per-event timing.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success or user declined submit confirmation. |
| `1` | User error, such as bad flags, missing tier, malformed config, or unsupported `--week` submit. |
| `2` | No matching local events found in the selected window. |
| `3` | PoW solve timeout. |
| `4` | Server unavailable, Worker rejection, network failure, or provider probe convergence. |
