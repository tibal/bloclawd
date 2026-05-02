---
phase: 01-foundations
plan: 02
subsystem: repo-foundation
tags: [adr, planetscale, billing, license, monorepo, workspace]
key-files:
  created:
    - .planning/decisions/ADR-001-planetscale-tier.md
    - LICENSE
    - Cargo.toml
    - package.json
    - pnpm-workspace.yaml
    - rust-toolchain.toml
    - .env.example
  modified:
    - .gitignore
metrics:
  tasks_completed: 2
  checkpoints_completed: 1
---

# Plan 01-02 Summary: Workspace Skeleton + PlanetScale Gate

## Objective

Established the monorepo skeleton, Apache-2.0 licensing, and the PlanetScale pricing gate required before Phase 2 database work.

## Commits

| Commit | Description |
|--------|-------------|
| `187d836` | Added ADR-001 skeleton, Apache-2.0 license, Cargo workspace, pnpm workspace, Rust toolchain pin, and base `.gitignore`. |
| Pending current commit | Filled ADR-001 with user-confirmed PlanetScale tier and added `.env.example` while ignoring local `.env` files. |

## PlanetScale Decision

| Field | Value |
|-------|-------|
| Tier | PlanetScale Postgres `PS-5` HA / highly available |
| Monthly base cost | $15/month |
| Billing alert threshold | $25 |
| Alert recipient | maintainer billing email |
| Confirmation | User confirmation in Codex session on 2026-04-30 |

## Files

- `LICENSE`: Apache-2.0 license text.
- `Cargo.toml`: workspace root for `crates/pow` and `xtask`.
- `package.json`: pnpm workspace root.
- `pnpm-workspace.yaml`: includes `apps/*`.
- `rust-toolchain.toml`: pins Rust 1.86.
- `.gitignore`: ignores local secret-bearing `.env` files while allowing `.env.example`.
- `.env.example`: documents required PlanetScale connection variables without secrets.

## Deviations

- The confirmed PlanetScale endpoint uses PlanetScale Postgres (`pg.psdb.cloud`). Phase 2 source-of-truth docs now target Postgres, `pg`/node-postgres, `UUID`, `JSONB`, `TIMESTAMPTZ`, and `ON CONFLICT` idempotency.
- No billing-alert screenshot was saved. The ADR records user confirmation instead.

## Self-Check: PASSED

ADR-001 is accepted, contains no unfilled placeholders, records a monthly base cost and alert threshold, and `.env` is ignored so local secrets are not committed.
