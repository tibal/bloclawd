---
phase: 01-foundations
plan: 04
subsystem: worker-pow
tags: [typescript, worker, pow, vitest, jcs]
key-files:
  created:
    - apps/worker/package.json
    - apps/worker/tsconfig.json
    - apps/worker/vitest.config.ts
    - apps/worker/src/types.ts
    - apps/worker/src/pow.ts
    - apps/worker/test/pow.test.ts
    - apps/worker/test/fixtures.test.ts
  modified:
    - pnpm-lock.yaml
metrics:
  tasks_completed: 2
  tests_run: 2
---

# Plan 01-04 Summary: Worker PoW Verifier

## Objective

Implemented the Cloudflare Worker-compatible TypeScript verifier and validated it against the Rust-generated fixture file.

## Commits

| Commit | Description |
|--------|-------------|
| `f92efdf` | Added the `@bloclawd/worker` package, Worker runtime config, verifier API, and unit tests. |
| `9e7cf8d` | Added fixture round-trip tests against `spec/pow-fixtures.json`. |

## Public TypeScript API

- `K_V1`: v1 difficulty constant (`22`).
- `b64uEncode` / `b64uDecode`: base64url-no-padding helpers.
- `hmacSha256`: Web Crypto HMAC-SHA256.
- `sha256`: Web Crypto SHA-256.
- `verifyChallenge`: HMAC + expiry verifier.
- `jcsBytes`: RFC 8785 JCS canonical bytes.
- `payloadHash`: `SHA-256(JCS(payload))`.
- `powHash`: `SHA-256(challenge_id || payload_hash || nonce)` over exactly 72 bytes.
- `leadingZeroBits`: leading-zero counter for 32-byte hashes.
- `verify`: composite HMAC + expiry + payload-hash + PoW verifier.
- `VerifyError`: typed verifier failures.

## Dependency Resolution

The planned package name `@rfc-8785/json-canonicalize` is not published to npm. The Worker package uses an npm alias:

`@rfc-8785/json-canonicalize -> canonicalize@3.0.0`

The alias preserves the planned import name while locking the real RFC 8785 canonicalizer in `pnpm-lock.yaml`.

## Verification

| Command | Result |
|---------|--------|
| `pnpm install --no-frozen-lockfile` | Passed |
| `pnpm --filter @bloclawd/worker typecheck` | Passed |
| `pnpm --filter @bloclawd/worker test` | Passed: 2 test files, 45 tests |

Cross-language JCS parity passed for:

- `k1-unicode-nfc`
- `k1-key-ordering`
- `k1-number-formatting`

## Deviations

- Used npm aliasing for `@rfc-8785/json-canonicalize` because the exact scoped package from the plan does not exist in the npm registry.
- The installed `@cloudflare/vitest-pool-workers` runtime supports compatibility dates only through `2024-12-30`, so local tests warn and fall back from the requested `2026-03-17` date. Tests still ran in workerd and passed.

## Self-Check: PASSED

The TypeScript verifier is Worker-runtime compatible, uses Web Crypto, imports the aliased RFC 8785 canonicalizer, and round-trips every Rust-generated fixture byte-for-byte.
