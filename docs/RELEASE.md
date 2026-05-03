# Release runbook (operator-only)

This document is the canonical runbook for cutting a `bloclawd` release. It is opinionated and concrete: every command is copy-paste-able. If a step diverges from what this document says, document the divergence here so the next operator (which may be future-you) knows.

The full release pipeline is `.github/workflows/release.yml` (cascade) and `.github/workflows/release-smoke.yml` (post-publish smoke). cargo-dist 0.31.0 + cargo-release 1.1.2 are the pinned tools (see `dist-workspace.toml` + `release.toml`).

---

## Prerequisites (one-time, BEFORE first 0.1.0)

The following operator-side prerequisites must be in place before the first `0.1.0` tag fires. Each item is a Phase 5 Wave 5 checkpoint (`.planning/phases/05-launch/05-13-PLAN.md`).

| # | Prerequisite | Notes |
|---|--------------|-------|
| 1 | Apple Developer Program enrollment ($99/yr) | Individual: 24-48h activation. Org: 1-3 weeks (DUNS verification) |
| 2 | Developer ID Application certificate exported as `.p12` | Generate in Keychain Access; export with strong password |
| 3 | App Store Connect API key (.p8) generated | App Store Connect → Users and Access → Keys; **download the .p8 ONCE** (cannot be re-downloaded) |
| 4 | `homebrew-bloclawd` GitHub repo created | Convention: `homebrew-<name>`. One initial commit on `main` (README only) |
| 5 | crates.io account exists for the operator | Account linked to GitHub recommended |
| 6 | Cloudflare zone access for `bloclawd.com` (and `bloclawd.org`) | Admin-level for DNS attach + Bulk Redirect + HSTS toggle |
| 7 | GitHub branch protection on `main` configured | Required reviewers = 0 OR install.sh-sync PAT on bypass list (D-121 auto-merge); ALSO enable Private Vulnerability Reporting (Settings → Security) |
| 8 | Pre-existing CNAME records for the four canonical domains DELETED | Custom-domain attach fails if a CNAME shadows the target name |

## GH Actions secrets

Set these via Repo Settings → Secrets and variables → Actions:

| Secret name | Source |
|-------------|--------|
| `CODESIGN_CERTIFICATE` | `base64 < developer_id.p12 \| pbcopy` |
| `CODESIGN_CERTIFICATE_PASSWORD` | The .p12 export password |
| `CODESIGN_IDENTITY` | The cert CN string, e.g. `Developer ID Application: <Operator Name> (<TEAMID>)` (visible in Keychain Access) |
| `APPLE_API_KEY_P8` | `base64 < AuthKey_XXXXXXXXXX.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | 10-char alphanumeric, App Store Connect → Keys |
| `APPLE_API_ISSUER` | UUID, App Store Connect → Keys → Issuer ID |
| `CARGO_REGISTRY_TOKEN` | crates.io → Account → API tokens → New token (publish-only scope, ideally per-package) |
| `HOMEBREW_TAP_TOKEN` | GitHub fine-grained PAT scoped to `homebrew-bloclawd` only with `Contents: Write` + `Pull Requests: Write` |

(`CODESIGN_OPTIONS=runtime` is set in workflow YAML, NOT a secret — see `.github/workflows/release.yml`. Hardened runtime is REQUIRED for notarize.)

### Toolchain prerequisites for installing the pinned tools

The two pinned operator-side tools each demand a recent stable rustc to install from source:

| Tool | Pinned version | Minimum rustc to install |
|------|---------------|--------------------------|
| `cargo-dist` | 0.31.0 | rustc ≥ 1.88 |
| `cargo-release` | 1.1.2 | rustc ≥ 1.91 |

If your default toolchain is older, install a stable channel and invoke explicitly:

```bash
rustup install stable
rustup install 1.91   # if your default stable is older
cargo +stable install cargo-dist@0.31.0 --locked
cargo +1.91   install cargo-release@1.1.2 --locked
# Or simply: rustup default stable; cargo install cargo-dist@0.31.0 --locked
```

The repo's `rust-toolchain.toml` pins the BUILD toolchain (currently 1.86, 2024 edition); the operator's tool-install toolchain is independent and only used to bootstrap cargo-dist + cargo-release on the operator's laptop.

---

## First `0.1.x` ceremony (one-time, manual fresh-laptop validation)

The first cut is operator-manual. Subsequent releases ride `release.yml` + `release-smoke.yml`.

Version-management upgrade path (post-ISSUE-01 fix in plan 05-03): the workspace is uniformly `0.1.0` pre-release. The operator's FIRST `cargo release --execute patch` produces `0.1.1` as the first PUBLISHED version (`bloclawd-schema`, `bloclawd-pow`, `bloclawd` all bump together; tag `v0.1.1`). There is no `v0.1.0` published tag — `0.1.0` is the pre-release workspace state only.

> **Crate-name note (`bloclawd-pow`)**: The internal proof-of-work crate is published as `bloclawd-pow`, not `pow`. The unprefixed `pow` name on crates.io belongs to a third-party SHA-256 utility crate; we renamed our crate during phase 5 (intercalary plan `05-INTERCALARY-pow-rename.md`) to avoid the collision. The publish cascade is `bloclawd-schema` → `bloclawd-pow` → `bloclawd` (path deps resolve in that order).

1. **Verify all prerequisites above are in place.**
2. **On the operator's primary laptop**, run a full pre-flight in dry-run:
   ```bash
   cargo install cargo-dist@0.31.0 --locked       # see Toolchain prerequisites above
   cargo install cargo-release@1.1.2 --locked

   dist --version          # expect: dist 0.31.0   (binary is `dist`, not `cargo-dist`)
   cargo release --version # expect: cargo-release 1.1.2

   dist plan
   cargo release --workspace --execute=false patch    # expects 0.1.0 -> 0.1.1
   ```
   All three must exit 0.
3. **Execute the bump:**
   ```bash
   git checkout main && git pull
   cargo release --workspace --execute patch
   ```
   This bumps every member's version from `0.1.0` to `0.1.1`, makes one commit, makes one tag `v0.1.1`, and pushes both. The tag push triggers `.github/workflows/release.yml`.
4. **Watch `release.yml` run.** Expected duration: 15-25 min for the cascade. The slowest stage is notarize (5-15 min wall-clock against Apple's queue). The job graph is `plan → build-local → notarize → host → publish-homebrew → publish-crates → announce → update-install-sh`.
5. **If notarize fails**, see "Notarize-failure recovery" below. **Do NOT push another `v0.1.1` tag** — bump to `v0.1.2` instead.
6. **After `release.yml` succeeds**, fetch the binary from a fresh laptop (or VM) via each of the three channels and verify:
   ```bash
   # Cargo
   cargo install bloclawd
   bloclawd --version

   # Brew (macOS only)
   brew install tibal/bloclawd/bloclawd
   bloclawd --version

   # Curl
   curl -fsSL https://bloclawd.com/install.sh | sh
   bloclawd --version
   ```
7. **Run a real smoke** against an actual session (not the fixture):
   ```bash
   bloclawd --5h --cc --tier max20 --dry-run
   ```
   Confirm: exit 0; no crash; no error envelopes; output looks reasonable.
8. **Update `docs/SUPPORTED-VERSIONS.md`** "Last tested" cells with the actual harness versions used during the smoke (CC version + Codex version).
9. **Tag the release as "validated"** in the GH Release UI (manual badge / pin to top of releases page).

From `0.1.1` onward, `release-smoke.yml` (the GH Actions matrix) carries the smoke load. Manual fresh-laptop validation is OPTIONAL after the first cut.

---

## Subsequent releases (steady state)

1. `git checkout main && git pull`
2. `cargo release --workspace --execute=false patch` (dry-run)
3. `cargo release --workspace --execute patch` (execute)
4. Watch `release.yml`. If it fails, see recovery sections below.
5. After `release.yml` succeeds, watch `release-smoke.yml` (auto-triggered on `release.published`; matrix covers cargo / brew / curl across ubuntu-latest + macos-14 + macos-13 cells).
6. If smoke is green: announce per Phase 5 D-discretion (out of scope for this runbook).
7. If smoke is red: download smoke artifact logs, identify the failed cell (e.g., curl-on-ubuntu), fix root cause, cut a hotfix `cargo release --execute patch`.

For minor bumps (e.g., new flag added): `cargo release --execute minor` cuts `0.x.0`. For breaking changes: `cargo release --execute major` is reserved for the `1.0.0` cut.

---

## Notarize-failure recovery (D-119)

Symptom: `release.yml` `notarize-macos` job fails. The workflow halts BEFORE GH Release create — so no public artifact, no tap PR, no `cargo publish`. The git tag exists; partial state is contained.

Steps:

1. Open the failed `release.yml` run in GitHub Actions UI.
2. Download the `notarytool-log-vX.Y.Z` artifact (uploaded by the notarize step on failure; 14-day retention).
3. Inspect the log. Common failure modes:
   - **`status: invalid` from notarytool**: open the inner JSON log; common causes are missing entitlements, missing hardened runtime (`CODESIGN_OPTIONS=runtime` not set?), or expired Developer ID cert.
   - **30-minute timeout**: Apple's notarize queue is degraded. Re-run the workflow (GH Actions → Re-run jobs). If it times out twice in a row, increase the `--timeout 30m` to `--timeout 60m` in `.github/workflows/release.yml` step "Decode .p8 + notarize" and commit.
   - **Cert expired**: see "Secret rotation" below.
4. Fix the root cause locally.
5. Bump version with `cargo release --execute patch`. **NEVER reuse the failed tag** — partial state on the homebrew tap or other surfaces may otherwise confuse subsequent runs. The new tag (e.g., `v0.1.1`) is treated as a fresh release.
6. Push the new tag. `release.yml` runs from clean.

crates.io is untouched on a halt-at-notarize, so no `cargo yank` ceremony is needed.

---

## crates.io publish-failure recovery (rare; index-propagation lag)

Symptom: cargo-dist's `cargo:publish` job fails on the second or third sequential `cargo publish` call (typically `cargo publish -p bloclawd-pow` or `-p bloclawd`) with an error like `error: failed to verify package tarball ... no matching version found for bloclawd-schema = "^0.1.X"` — i.e. the path-dep resolves against the OLD version because crates.io's index hasn't propagated the just-published predecessor yet (ISSUE-05 acceptance: documented as "rare but recoverable").

cargo-dist 0.31.0 has internal sequencing between `cargo publish` calls but does not poll the index; under high crates.io load, the propagation lag can exceed cargo-dist's internal wait.

Recovery (irreversible-publish-aware):

1. The `cargo:publish` job halted on (e.g.) `bloclawd-pow`. `bloclawd-schema` is already published. Do NOT yank `bloclawd-schema` — it is correct.
2. The git tag exists. The remaining publishes (`bloclawd-pow`, `bloclawd`) need to land.
3. Bump version: `cargo release --workspace --execute patch` (produces e.g. `0.1.2` if the failure was on `0.1.1`). cargo-release re-publishes ALL three crates; the already-published `bloclawd-schema 0.1.1` is a noop on the new run because cargo-dist's `cargo:publish` will publish `bloclawd-schema 0.1.2` afresh.
4. Push the new tag. release.yml runs from clean.

Alternative (only if the operator is comfortable manually publishing): on the operator's local machine, poll the crates.io index until the predecessor surfaces, then `cargo publish -p bloclawd-pow` and `cargo publish -p bloclawd` manually. Poll loop:

```bash
PKG=bloclawd-schema
VER=0.1.1
until cargo search "$PKG" | grep -qE "^$PKG = \"$VER\""; do sleep 5; echo "waiting for $PKG=$VER on crates.io"; done
cargo publish -p bloclawd-pow
cargo publish -p bloclawd
```

This bypasses cargo-dist for the remaining publishes; document the divergence in the SUMMARY for the next operator. Bumping the tag (option 1) is the recommended, GitOps-clean path.

---

## Cloudflare cutover (one-time per zone, before or shortly after first 0.1.x)

Cloudflare cutover happens once per zone, typically the day of (or shortly before) the first `0.1.x` tag fires. Plans 05-06 and 05-07 left the worker + frontend configs in **edits-only** mode — the operator runs the deploys + DNS attaches below to flip live traffic to the production custom domains.

### Recommended sequence (DNS cutover ordering, D-discretion)

The cutover is staged so dashboard verification doesn't depend on the apex switch:

1. `data.bloclawd.com` (R2) first → verify dashboard reads.
2. `api.bloclawd.com` (ingest Worker) second → verify CLI submit.
3. `bloclawd.com` apex + `www` (frontend Worker) third → verify install.sh delivery.
4. `bloclawd.org` Bulk Redirect → verify 301 forwarding.
5. HSTS toggle on `bloclawd.com` zone → verify response header.

### data.bloclawd.com (R2 attach)

This is the highest-friction step historically — `wrangler r2 bucket domain add` was added in 2024 and is now scriptable (RESEARCH §Implementation Landmines #6 corrects the prior "manual dashboard" assumption):

```bash
# Look up the bloclawd.com zone ID (Cloudflare dashboard → bloclawd.com → right sidebar → API section → Zone ID)
export ZONE_ID="<paste-zone-id-here>"
export CF_API_TOKEN="<token-with-Zone:Edit-and-R2:Edit>"

npx --yes wrangler r2 bucket domain add bloclawd-reports \
  --domain data.bloclawd.com \
  --zone-id "$ZONE_ID"
```

Verify:
```bash
curl -I https://data.bloclawd.com/reports/v1/manifest.json
# Expect: 200 OK, Content-Type: application/json
```

Fallback: if `wrangler r2 bucket domain add` is unavailable in the installed wrangler version (pre-3.50 or so), fall back to the dashboard:
Cloudflare dashboard → R2 → bloclawd-reports → Settings → Custom Domains → Connect Domain → `data.bloclawd.com`.

### api.bloclawd.com (ingest Worker)

The wrangler config in `apps/worker/wrangler.toml` already declares `[[env.production.routes]]` (Phase 5 plan 05-07). Deploy:

```bash
cd apps/worker
npx --yes wrangler@4.34.0 deploy --env production
```

Verify:
```bash
curl -s https://api.bloclawd.com/challenge | jq .
# Expect: { "challenge_id": "...", "expires_at": "...", "k": 22 }
```

### bloclawd.com apex + www (frontend Worker)

Same pattern:
```bash
cd apps/frontend
pnpm build       # ensures dist/ is up-to-date including install.sh
npx --yes wrangler@4.34.0 deploy --env production
```

Verify:
```bash
curl -I https://bloclawd.com/install.sh
# Expect: 200 OK, Content-Type: text/plain; charset=utf-8, Cache-Control: public, max-age=300, must-revalidate
```

### bloclawd.org Bulk Redirect

Cloudflare dashboard → Rules → URL Forwarding → Bulk Redirects → Create List → Add Rule.

| Field | Value |
|-------|-------|
| Source URL | `https://bloclawd.org/*` (and add a second entry for `https://www.bloclawd.org/*`) |
| Target URL | `https://bloclawd.com${1}` |
| Status code | 301 (Permanent Redirect) |
| preserve_query_string | true |
| preserve_path_suffix | true |
| subpath_matching | true |

Save and Deploy. Verify:
```bash
curl -I https://bloclawd.org
# Expect: 301, Location: https://bloclawd.com
curl -I https://bloclawd.org/methodology
# Expect: 301, Location: https://bloclawd.com/methodology
```

(Bulk Redirects are available on the Cloudflare Free plan; quota differs by plan tier.)

### HSTS + Always-Use-HTTPS toggle (DIST-08)

Cloudflare dashboard → SSL/TLS → Edge Certificates.

| Setting | Value |
|---------|-------|
| Always Use HTTPS | **On** |
| Minimum TLS Version | TLS 1.2 |
| Opportunistic Encryption | On |

HSTS section:

| Setting | Value |
|---------|-------|
| Enable HSTS | **Yes** |
| Max Age | 12 months (`max-age=31536000`) |
| Apply HSTS to subdomains (Include subDomains) | **On** |
| Preload | **OFF** ⚠ |
| No-Sniff Header | On |

**Why preload OFF**: HSTS preload submission to https://hstspreload.org is IRREVERSIBLE for ~12 months (RESEARCH §Implementation Landmines #8). Once preloaded, every browser visiting `bloclawd.com` (or any subdomain like `data.bloclawd.com`) refuses to ever talk HTTP. If we ever need HTTP for testing, migration, or vendor compatibility, we cannot. v1 ships preload OFF; reconsider preload at the `1.0.0` cut.

Verify:
```bash
curl -I https://bloclawd.com | grep -i strict-transport-security
# Expect: Strict-Transport-Security: max-age=31536000; includeSubDomains
# (NO 'preload' token)
```

(`bloclawd.org` is a separate zone. Either onboard it to the same Cloudflare account and apply the same settings, OR rely solely on the Bulk Redirect to bounce traffic to `bloclawd.com` where HSTS is enforced. Recommend onboarding both zones for symmetry.)

---

## Rollback

Once a release tag has fired and `release.yml` has produced public artifacts, the bytes are essentially immutable: crates.io publishes are append-only (only `cargo yank` is available, which hides from the resolver but does not delete), homebrew tap commits are public history, and curl-installed binaries already on user laptops cannot be unshipped.

The supported recovery surface is therefore **roll-forward**, not rollback:

1. **Code regression**: cut a fresh patch (`cargo release --execute patch`) reverting the offending commit. The new version supersedes the bad one across all three channels.
2. **crates.io poison**: `cargo yank --version X.Y.Z -p bloclawd` (and per-crate as needed). Yank does NOT remove the tarball — anyone with `Cargo.lock` pinned can still resolve it — but new `cargo install bloclawd` invocations will skip the yanked version. Always pair a yank with a roll-forward patch release.
3. **Homebrew tap regression**: revert the offending commit on `homebrew-bloclawd` `main` directly (operator push), OR cut a fresh patch which auto-updates the tap.
4. **install.sh regression**: revert in `apps/frontend/public/install.sh` (or rebuild output dir) and `npx wrangler deploy --env production` from `apps/frontend/`. Cache-Control is `max-age=300` (D-123), so global propagation is ≤5 min.
5. **Cloudflare custom domain misconfig**: `npx wrangler r2 bucket domain remove bloclawd-reports --domain data.bloclawd.com --zone-id "$ZONE_ID"` reverts the R2 attach. For Worker routes, edit `apps/{worker,frontend}/wrangler.toml` and redeploy.

There is no "undo last release" button. If a release is so broken that roll-forward is impossible (e.g., breaks the `cargo install` step itself), bias toward yanking and shipping a hotfix within hours.

---

## Secret rotation (rare, planned)

### `CODESIGN_CERTIFICATE` (.p12) — every 5 years

Apple Developer ID Application certificates are valid for 5 years. Calendar-reminder at 4y6m to start rotation:

1. Generate a new Developer ID Application cert via Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority.
2. Upload the CSR to developer.apple.com → Certificates, IDs & Profiles → Create. Download the new cert.
3. Install the cert into Keychain (double-click). Export as `.p12` with a fresh strong password.
4. Update GH Actions secrets:
   - `CODESIGN_CERTIFICATE`: `base64 < new_developer_id.p12 \| pbcopy`
   - `CODESIGN_CERTIFICATE_PASSWORD`: new password
   - `CODESIGN_IDENTITY`: usually unchanged (same CN), but verify via Keychain Access
5. Cut a tagged release (`cargo release patch --execute`) to validate the new cert.

### `APPLE_API_KEY_P8` (.p8) — annually (no expiry, but rotate for hygiene)

1. App Store Connect → Users and Access → Keys → Generate API Key (Developer role).
2. Download the new .p8 ONCE.
3. Update secrets:
   - `APPLE_API_KEY_P8`: `base64 < AuthKey_NEWKEY.p8 \| pbcopy`
   - `APPLE_API_KEY_ID`: new 10-char ID
   - `APPLE_API_ISSUER`: UUID (unchanged across keys; same team)
4. Revoke the old key in App Store Connect.

### `CARGO_REGISTRY_TOKEN` — annually

1. crates.io → Account → API tokens → Generate new token (per-package scope: `bloclawd`, `bloclawd-schema`, `bloclawd-pow`).
2. Update GH Actions secret `CARGO_REGISTRY_TOKEN`.
3. Revoke the old token.

### `HOMEBREW_TAP_TOKEN` — annually

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Scope: `homebrew-bloclawd` repo only; `Contents: Write` + `Pull Requests: Write`.
3. Update GH Actions secret `HOMEBREW_TAP_TOKEN`.
4. Revoke the old token.

---

## Anonymity rule for release-pipeline logs

The `release.yml` and `release-smoke.yml` logs are public on a public repo. The cross-cutting anonymity boundary (see [THREAT-MODEL.md](./THREAT-MODEL.md)) requires that no `event_id`, `nonce`, IP address, or per-event timing surface in any log.

In practice this is naturally satisfied because the release pipeline does not touch the `events` PostgreSQL table or the public R2 reports. But:

- `release-smoke.yml` runs `bloclawd --5h --cc <fixture> --dry-run` — and has an inline anonymity grep that fails the cell if `event_id` (UUIDv4 regex), nonce (literal string), IPv4, or IPv6 appear in stdout. This is the canonical enforcement (Phase 5 plan 05-05).
- If the operator ever adds a step to `release.yml` that touches events data (e.g., a future "post-release verification" that hits the production R2 manifest), they MUST add the same anonymity grep to that step's output capture.

---

## install.sh sync (auto-PR on release; manual merge if branch protection blocks auto-merge)

After `release.yml` succeeds, the final job in the cascade (`update-install-sh`) opens a pull request against `main` updating the SHA-256 checksums embedded in `apps/frontend/public/install.sh` to match the just-published tarballs. The PR is auto-merged if the install.sh-sync PAT is on the branch-protection bypass list (D-121); if not, the operator must manually merge it before the next release ceremony to keep `https://bloclawd.com/install.sh` in sync with the latest published binaries.

To verify the auto-PR landed:

```bash
gh pr list --state merged --search "install.sh sync" --limit 1
gh run list --workflow release.yml --limit 1
```

If the PR is open and unmerged, review the diff (it should be limited to checksum lines + the embedded `BLOCLAWD_VERSION` constant) and merge manually. Then redeploy the frontend Worker:

```bash
cd apps/frontend
pnpm build
npx --yes wrangler@4.34.0 deploy --env production
```

Cache-Control on `install.sh` is `max-age=300` (D-123), so global propagation completes ≤5 min.

---

## Tool versions reference

| Tool | Version | Pin location |
|------|---------|--------------|
| cargo-dist | 0.31.0 | `dist-workspace.toml` `cargo-dist-version` |
| cargo-release | 1.1.2 | (operator-side install: `cargo install cargo-release@1.1.2 --locked`; requires rustc ≥ 1.91 to install) |
| wrangler | 4.34.0 (pinned per ISSUE-11) | `apps/{frontend,worker}/wrangler.toml` (config); operator runs `npx --yes wrangler@4.34.0 ...` (NOT `@latest`) per docs/RELEASE.md commands |
| rustc (build) | 1.86 (2024 edition) | `rust-toolchain.toml` |
| rustc (cargo-dist install) | ≥ 1.88 | operator's default stable channel |
| rustc (cargo-release install) | ≥ 1.91 | operator's default stable channel |
| worker-build | 0.8.1 | `apps/worker/wrangler.toml` `[build] command = "...worker-build@0.8.1..."` |

Re-pin if any of these are bumped via a pre-release-replacements step in `release.toml` (currently empty).

---

## When to update this runbook

After any release ceremony where:
- A step diverged from this document (e.g., notarize timeout had to be bumped → update the file).
- A new prerequisite became necessary (e.g., a Cloudflare API quota change).
- A secret rotation procedure changed.
- A new release channel or target was added.

Commit the runbook change as part of the same PR/commit cluster as the underlying change so future-you sees both.
