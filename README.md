# bloclawd

Live cohort percentiles for Claude Code and Codex rate limits — see where **Pro, Max5, and Max20** caps actually fire, how they **drift week to week**, and how your last bonked window compares to the cohort.

The dashboard at <https://bloclawd.com> renders a percentile envelope (p10–p90) for every tier × harness × model combination, with daily aggregates over 24h / 7d / 30d / 90d windows. The dataset is contributed by users themselves: after you hit a 5-hour or weekly cap, the `bloclawd` CLI reads your local Claude Code or Codex session logs, builds a canonicalized payload for a fixed window, shows you the exact event that would be sent, and only submits after explicit confirmation.

There are no accounts, no telemetry, no IP-based geolocation, no persistent device identifiers, and no per-event timestamps in the public dataset. Submission is gated by a local proof-of-work, not identity. Public cells require ≥ 5 distinct contributors. For the full anonymity contract, see [THREAT-MODEL.md](./THREAT-MODEL.md). For the wire format, see <https://bloclawd.com/data>. For the math, see <https://bloclawd.com/methodology>.

## Install

Three install paths are supported on macOS (Apple Silicon + Intel) and Linux (x86_64-musl):

### Via cargo (developers)

```sh
cargo install bloclawd
```

### Via Homebrew (macOS)

```sh
brew install bloclawd/tap/bloclawd
```

See the [latest release](https://github.com/bloclawd/bloclawd/releases) page for the canonical tap path.

### Via curl (universal)

```sh
curl -fsSL https://bloclawd.com/install.sh | sh
```

The `install.sh` script verifies a per-target sha256 hash before extracting the binary. You can audit the script before running it:

```sh
curl https://bloclawd.com/install.sh
```

macOS binaries are signed and notarized via Apple's `notarytool` starting with the first release after Apple Developer enrollment is active. Earlier `0.1.x` releases may trigger Gatekeeper friction on first launch; if you see "cannot be opened because the developer cannot be verified", right-click the binary and choose Open to bypass. This note will be removed once enrollment-completion confirms in plan 05-13 Checkpoint 1.

## Quick start

```sh
# Show what would be submitted (no network)
bloclawd --cc --tier max20 --end 16:00 --5h --dry-run

# Submit (asks for confirmation)
bloclawd --cc --tier max20 --end 16:00 --5h
```

`--tier` is persisted to `~/.config/bloclawd/config.toml` after first run.

See <https://bloclawd.com/methodology> for the trust contract and <https://bloclawd.com/data> for the wire format.

## Supported Inputs

`bloclawd` supports these local harness artifact roots:

| Harness | Flag | Session path |
| --- | --- | --- |
| Claude Code | `--cc` | `~/.claude/projects/**/*.jsonl` |
| Codex | `--codex` | `$CODEX_HOME/sessions/**/*.jsonl`, defaulting to `~/.codex/sessions/**/*.jsonl` |

## Supported Versions

| Harness          | Minimum supported | Last tested |
|------------------|-------------------|-------------|
| Claude Code (cc) | 2.1.89            | TBD         |
| Codex            | 0.125.0           | TBD         |

Minimum versions are enforced as a non-fatal stderr warning at startup; below-minimum invocations still proceed (defensive parsing handles unknown shapes), but you'll see a warning. See [docs/SUPPORTED-VERSIONS.md](./docs/SUPPORTED-VERSIONS.md) for the smoke-updated table.

## Usage

Dry-run first. This does not contact the network and does not run the provider probe.

```sh
bloclawd --cc --tier max20 --end 16:00 --5h --dry-run
bloclawd --codex --tier max20 --end 16:00 --5h --dry-run
```

Submit mode prints the dry-run view, asks one `[y/N]` confirmation for the whole batch, fetches a PoW challenge per event, solves it locally, runs the provider rate-limit probe once, and submits each event.

```sh
bloclawd --cc --tier max20 --end 16:00 --5h
bloclawd --codex --tier max20 --end 16:00 --5h --yes
```

`--week` is currently dry-run only in v1:

```sh
bloclawd --cc --tier max20 --end 16:00 --week --dry-run
```

## Tiers

`--tier` uses provider-neutral individual subscription price buckets for both Claude Code and Codex:

```text
pro    # $20 individual tier
max5   # $100 individual tier
max20  # $200 individual tier
```

## Privacy and Threat Model

`bloclawd` is not background telemetry. It runs only when invoked by the user, derives the payload locally, and submits no account identity.

Public outputs apply k-anonymity suppression (n ≥ 5), binned token counts, no public event IDs or nonces, and no persisted per-event timing.

See [THREAT-MODEL.md](./THREAT-MODEL.md) for the full anonymity boundary, wire-integrity promises, and AS-IS non-promises.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success or user declined submit confirmation. |
| `1` | User error, such as bad flags, missing tier, malformed config, or unsupported `--week` submit. |
| `2` | No matching local events found in the selected window. |
| `3` | PoW solve timeout. |
| `4` | Server unavailable, Worker rejection, network failure, or provider probe convergence. |

## Security

To report a vulnerability, please follow the process in [SECURITY.md](./SECURITY.md).

## Contributing

The repository keeps anonymized fixture JSONL under `crates/cli/tests/fixtures/`. To generate a new fixture from a real session:

```sh
cargo run -p xtask -- anonymize-session --harness cc --input <real.jsonl> --output crates/cli/tests/fixtures/cc/<name>.jsonl
cargo run -p xtask -- anonymize-session --harness codex --input <real.jsonl> --output crates/cli/tests/fixtures/codex/<name>.jsonl
```

The anonymizer preserves model IDs, token counts, and JSON shape while replacing prompts, tool arguments, paths, UUIDs, and timestamps with deterministic placeholders.

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](./LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](./LICENSE-MIT) or <https://opensource.org/licenses/MIT>)

at your option.

The aggregated public dataset at <https://data.bloclawd.com> is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
