---
status: partial
phase: 03-rust-cli
source: [03-VERIFICATION.md]
started: 2026-05-02T00:00:00Z
updated: 2026-05-02T00:00:00Z
---

# Phase 03 Human UAT

## Current Test

Awaiting live rate-limited CLI submit verification.

## Tests

### 1. Real Rate-Limited CLI Submit

expected: On a machine with a real Claude Code or Codex provider limit already reached, `bloclawd --cc --tier max20 --end <local-time> --5h --yes` or `bloclawd --codex --tier pro_codex --end <local-time> --5h --yes` prints the dry-run view, emits solve/probe/submit progress on stderr, recognizes the provider rate-limit probe, submits to the deployed ingest Worker, exits 0, and a row appears in PlanetScale.

result: pending

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
