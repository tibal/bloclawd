# Staging access lockdown — operator runbook

This document describes the manual steps to complete after the wrangler config + CI workflow changes have landed. Goal: **staging worker + frontend are reachable only by authorized humans (Cloudflare Access SSO) and the CI service token**, while the CD pipeline (`deploy-staging.yml`) continues to ship every push to `main`.

R2 staging bucket and PlanetScale staging branch are already private (no public domain attach on R2; Hyperdrive credentials gate the DB). This runbook only locks down the two worker hostnames.

---

## Architecture (after this runbook is complete)

| Component | Hostname | Public? | Auth |
|---|---|---|---|
| Worker (staging) | `api-staging.bloclawd.com` | No `*.workers.dev` URL | Cloudflare Access (SSO) + service token for CI |
| Frontend (staging) | `staging.bloclawd.com` | No `*.workers.dev` URL | Cloudflare Access (SSO) + service token for CI |
| R2 (staging) | n/a | No public attach | Worker reads only via `BUCKET` binding |
| PlanetScale (staging branch) | n/a | No public attach | Hyperdrive credentials |

CD path unchanged: push to `main` → `deploy-staging.yml` → both workers re-deploy → health check curls each hostname with `CF-Access-Client-*` headers.

---

## One-time setup (in order)

### 1. (already done) `deploy-staging.yml` restored from stash + health checks added

`.github/workflows/deploy-staging.yml` is in the worktree, untracked. It already includes the Access-aware health checks (worker `/challenge` JSON probe, frontend root probe), both gated on `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET` from the `staging` GitHub Environment.

Cleanup once you have verified the file is correct:

```bash
git stash drop stash@{0}    # remove the now-redundant stash entry
```

### 2. Cloudflare DNS preflight

Custom-domain attach via wrangler fails if a CNAME / A record already shadows the target hostname. Delete pre-existing records for both:

- `api-staging.bloclawd.com`
- `staging.bloclawd.com`

Cloudflare dashboard → bloclawd.com zone → DNS → Records. Filter for `staging`. Delete any that exist (these will be re-created by wrangler as proxied CNAMEs to the worker).

### 3. Re-issue the staging Cloudflare API token (now needs Zone perms)

The custom-domain attach requires zone-level permissions. The previous staging token (Account-only) was no longer sufficient.

Reference shape for future rotations — Cloudflare dashboard → My Profile → API Tokens → Create/Roll:

| Scope | Permission |
|---|---|
| Account | Workers Scripts: Edit |
| Account | Workers R2 Storage: Edit |
| Zone (bloclawd.com only) | Zone: Edit |
| Zone (bloclawd.com only) | DNS: Edit |

**Account Resources**: include only the bloclawd account.
**Zone Resources**: include only the `bloclawd.com` zone.

The current value is already loaded into the `staging` GitHub Environment as `CLOUDFLARE_API_TOKEN`. Rotate via:

```bash
gh secret set CLOUDFLARE_API_TOKEN --env staging --repo bloclawd/bloclawd
# pastes new value via stdin; old value is overwritten
```

Then revoke the old token in the Cloudflare dashboard.

### 4. (already applied) Staging R2 CORS rules

`apps/worker/r2-cors-staging.json` was updated to allow only `https://staging.bloclawd.com` as a CORS origin, and the rule was applied to the `bloclawd-reports-staging` bucket. To re-apply (after editing the JSON):

```bash
npx --yes wrangler@4.34.0 r2 bucket cors set bloclawd-reports-staging \
  --file apps/worker/r2-cors-staging.json
```

Verify: `wrangler r2 bucket cors list bloclawd-reports-staging`.

### 5. Create the Cloudflare Access application

Open Cloudflare Zero Trust at <https://one.dash.cloudflare.com/> and select your account. (If this is your first time, Cloudflare will ask you to choose a team subdomain — pick something like `bloclawd` and click Save. The subdomain only matters internally and can be changed later.)

#### 5a. Add an identity provider (one-time, recommended)

If you have never set up an identity provider for Zero Trust, you will get email OTPs (one-time codes by email) on every login by default. That works but is friction-heavy. Set up GitHub OAuth or Google once and reuse it.

1. Left sidebar → **Settings** → **Authentication**.
2. Under "Login methods" click **Add new**.
3. Pick **GitHub** (simplest for a developer org) or **Google**.
4. For GitHub:
   - Cloudflare shows a Client ID + Client Secret it expects you to fill in. Open <https://github.com/settings/applications/new> in another tab.
   - Application name: `bloclawd Cloudflare Access` · Homepage URL: `https://bloclawd.com` · Authorization callback URL: copy the value Cloudflare displays in the **Authorize URL** field (looks like `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`).
   - Click "Register application", then "Generate a new client secret".
   - Paste the Client ID + Client Secret back into the Cloudflare form.
5. Click **Save**. Cloudflare offers a "Test" button — click it to verify the OAuth round-trip works.

You can keep "One-time PIN" enabled in addition (Cloudflare allows multiple methods); the user picks at login time.

#### 5b. Create the application

1. Left sidebar → **Access** → **Applications** → **Add an application**.
2. On the "Select an application type" screen, click **Self-hosted**.
3. **Configure application** screen:

   | Field | Value |
   |---|---|
   | Application name | `bloclawd-staging` |
   | Session duration | `24 hours` (adjust to taste; longer = fewer logins, shorter = tighter blast radius) |
   | Application domain | Two domains, added one at a time. **First**: type `api-staging.bloclawd.com` and leave Path blank. Click "Add domain" / "+" to add a second. **Second**: `staging.bloclawd.com`, Path blank. |
   | Identity providers | Tick the provider(s) you set up in 5a. If you skipped 5a, leave "One-time PIN" ticked. |
   | App launcher visibility | Off (no app-launcher tile needed; you bookmark the URLs) |

   Leave everything else at defaults. Click **Next**.

4. **Add policies** screen — Cloudflare requires at least one policy before you can save.

   Click **Add a policy**:

   | Field | Value |
   |---|---|
   | Policy name | `operators` |
   | Action | **Allow** |
   | Session duration | "Same as application session timeout" (default) |

   Under **Configure rules**:
   - Rule 1 (the only one for now): **Include** → **Emails** → enter your operator email(s) comma-separated.
     Alternative: **Emails ending in** → `@yourdomain.com` if you trust everyone on a domain.
   - You can leave **Require** and **Exclude** empty.

   Click **Next**.

5. **Setup** screen — leave all defaults (CORS settings, cookie attributes, additional settings). Click **Add application**.

The application is now live. The staging URLs are immediately gated. Test from a browser:

- Open `https://api-staging.bloclawd.com/challenge` (after first deploy lands; until then it 522s on no origin).
- You should see the Cloudflare login page. Authenticate via your identity provider or email OTP.
- After login you reach the worker response.

### 6. Create the service token for CI

Service tokens are non-human credentials that bypass the identity-provider login flow by sending two HTTP headers. CI uses one for the post-deploy health check.

#### 6a. Create the token

1. Left sidebar → **Access** → **Service Auth** → **Service Tokens** tab → **Create Service Token**.
2. Form:

   | Field | Value |
   |---|---|
   | Service Token name | `gh-actions-deploy-staging` |
   | Service Token Duration | **Non-expiring** (you will rotate annually; see Day-2) |

   Click **Generate token**.

3. Cloudflare displays the **Client ID** and **Client Secret**. **The secret is shown ONCE.** If you close the dialog without copying, you must delete the token and re-create it.

   Copy both into a temporary scratch buffer (or paste straight into the `gh secret set` commands below — either works, just don't lose them).

#### 6b. Attach the token to your application's policy

The token exists but cannot reach your app yet — you must add it to a policy on the `bloclawd-staging` application.

1. **Access** → **Applications** → click the `bloclawd-staging` row → **Edit**.
2. Top tabs → **Policies** → next to the `operators` policy click **Edit** (pencil icon).
3. Scroll to **Configure rules** → **Include** section → click **Add include**.

   New rule:
   - Selector: **Service Token**
   - Value: pick `gh-actions-deploy-staging` from the dropdown.

4. Click **Save**.

   Note: this puts humans + CI in the same policy ("either an allowed email OR the service token"). If you prefer to separate them — say, audit-trail reasons or different session durations — instead create a second policy `ci` (Action: Allow, single Include rule = Service Token), leaving the `operators` policy human-only. Both work; the single-policy approach is simpler.

#### 6c. (Optional) Smoke-test the token from your laptop

Once a deploy has landed (step 8), you can confirm the token works without going through the GitHub Actions flow:

```bash
export CF_ACCESS_CLIENT_ID='<paste from 6a>'
export CF_ACCESS_CLIENT_SECRET='<paste from 6a>'
curl -fsS \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://api-staging.bloclawd.com/challenge | jq .
```

Expect a JSON challenge envelope. If you get an HTML login page back, the token is not attached to the policy correctly — re-check 6b.

### 7. Add the service token to GitHub Actions secrets

Already done by setup automation:
- Both `staging` and `production` GitHub Environments exist.
- `CLOUDFLARE_ACCOUNT_ID` is set in both.
- `CLOUDFLARE_API_TOKEN` is set in `staging`.
- `tibal` is configured as a required reviewer on the `production` environment (deploys will pause and wait for click-Approve).

Remaining secrets (you supply the values from step 6):

```bash
gh secret set CF_ACCESS_CLIENT_ID     --env staging --repo bloclawd/bloclawd     # paste Client ID from step 6a
gh secret set CF_ACCESS_CLIENT_SECRET --env staging --repo bloclawd/bloclawd     # paste Client Secret from step 6a
```

Both prompt for the value on stdin so the secret never appears in shell history. Or via the dashboard: Repo Settings → Environments → `staging` → Add secret.

For `production` (when you cut your first release), the only remaining secret is `CLOUDFLARE_API_TOKEN`:

```bash
gh secret set CLOUDFLARE_API_TOKEN --env production --repo bloclawd/bloclawd
```

Production token needs broader scope than staging — see `.github/workflows/deploy-production.yml` header comment for permissions.

### 8. First deploy + verify

```bash
git push origin main      # or use Actions tab → deploy-staging → Run workflow
```

Watch the workflow. Two things to check:
- Both `Deploy worker` / `Deploy frontend` steps succeed (proves the new token + zone perms work, custom domain attach succeeded).
- Both `Health check` steps succeed (proves the service token works through Access).

Then verify from a browser:
- Visit `https://api-staging.bloclawd.com/challenge` → should bounce you to a Cloudflare login page. Authenticate → the JSON response loads.
- Visit `https://staging.bloclawd.com` → same flow → frontend loads.

Open an incognito window without authentication and confirm both URLs return the Access login page (not the JSON / not the frontend).

---

## Day-2 operations

### Add or remove an operator

Zero Trust → Access → Applications → `bloclawd-staging` → Edit → Policies → `operators` → edit the Emails rule → save. Effective immediately on next browser session (existing sessions stay valid until session duration expires).

### Rotate the service token (annual hygiene)

1. Service Auth → Service Tokens → Create new token `gh-actions-deploy-staging-v2`.
2. Attach the new token to the application policy alongside the old one.
3. Update GH secrets `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET` with the new values.
4. Trigger a deploy via `workflow_dispatch` and confirm the health check passes with the new token.
5. Remove the old token from the policy and revoke it (Service Auth → Service Tokens → Revoke).

### "I deleted my own email from the policy and locked myself out"

Two recovery paths:
- If you still have the Cloudflare account login (separate from the Access SSO), Zero Trust → Access → Applications → edit the policy.
- If even that is locked, the `CLOUDFLARE_API_TOKEN` in GH Secrets has Zone:Edit; you can delete the Access application entirely via API (`DELETE /accounts/:id/access/apps/:app_id`), then re-create.

### Smoke-test from your laptop with the service token

If you want to mimic the CI health check locally:

```bash
export CF_ACCESS_CLIENT_ID=<from step 6>
export CF_ACCESS_CLIENT_SECRET=<from step 6>
curl -fsS \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://api-staging.bloclawd.com/challenge | jq .
```

### What to do if a `wrangler deploy --env staging` fails with "domain already attached"

Means a stale custom-domain binding exists from a prior deploy or an aborted attach. Detach via dashboard: Workers & Pages → `bloclawd-worker-staging` → Settings → Triggers → Custom Domains → remove. Then re-deploy.

---

## Quick reference

**URLs:**
- Worker: `https://api-staging.bloclawd.com`
- Frontend: `https://staging.bloclawd.com`
- (No `*.workers.dev` URLs exist; `workers_dev = false` in both wrangler.toml files.)

**GitHub Environment `staging` secrets (4 total):**
- `CLOUDFLARE_API_TOKEN` — Account: Workers Scripts/R2 Edit; Zone (bloclawd.com): Zone+DNS Edit
- `CLOUDFLARE_ACCOUNT_ID` — account UUID
- `CF_ACCESS_CLIENT_ID` — service token ID (from Access)
- `CF_ACCESS_CLIENT_SECRET` — service token secret (from Access)

**Out-of-band, not in CI:**
- `WORKER_SECRET` (set per env via `wrangler secret put WORKER_SECRET --env staging`)
