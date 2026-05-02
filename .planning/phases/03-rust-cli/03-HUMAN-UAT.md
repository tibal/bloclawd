---
status: partial
phase: 03-rust-cli
source: [03-VERIFICATION.md]
started: 2026-05-02T00:00:00Z
updated: 2026-05-02T13:07:23Z
---

# Phase 03 Human UAT

## Current Test

Deferred until the operator account is genuinely provider-rate-limited. The latest live attempt was made before hitting usage limits and correctly failed closed at the provider probe.

## Tests

### 1. Real Rate-Limited CLI Submit

expected: On a machine with a real Claude Code or Codex provider limit already reached, `bloclawd --cc --tier max20 --end <local-time> --5h --yes` or `bloclawd --codex --tier max20 --end <local-time> --5h --yes` prints the dry-run view, emits solve/probe/submit progress on stderr, recognizes the provider rate-limit probe, submits to the deployed ingest Worker, exits 0, and a row appears in PlanetScale.

result: deferred: expected probe failure observed while account was not rate-limited; retry during peak hours after provider usage limit is reached.

## Summary

total: 1
passed: 0
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- Positive live-submit proof still needs a genuinely rate-limited provider account. The non-rate-limited attempt is an expected failure mode, not an implementation gap.
