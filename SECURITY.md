# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | latest minor only  |
| < 0.1.0 | n/a (pre-release)  |

The "latest minor" support model means we backport security fixes only to
the most recent minor release line (e.g., 0.2.x receives fixes; 0.1.x does
not, once 0.2.0 is cut). v1.0.0+ may adopt a longer-tailed policy.

## Reporting a Vulnerability

To report a security vulnerability in bloclawd, please use GitHub Private
Vulnerability Reporting:

**[github.com/bloclawd/bloclawd/security/advisories/new](https://github.com/bloclawd/bloclawd/security/advisories/new)**

This channel is private; only the bloclawd maintainers see your report.

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (or a minimal proof-of-concept if relevant)
- Affected versions (if known)
- Any suggested mitigation or fix

We commit to:
- **Triage within 5 business days.** You'll receive an acknowledgement and
  an initial assessment of severity.
- **Fix-or-mitigate within 90 days** of triage. For Critical-severity
  vulnerabilities the timeline is shorter (typically 14 days).
- **Coordinated disclosure.** We publish a public advisory once a fix is
  released, crediting the reporter (unless you prefer to remain
  anonymous). For 90-day timelines we coordinate with the reporter on
  exact disclosure date.

If you don't hear back within 5 business days, please open a GitHub issue
saying "Pinging on private security advisory" (without disclosing details
in the public issue) so we can investigate the missed notification.

## Scope

In scope (please report):
- Vulnerabilities in the CLI (`crates/cli`) that allow privilege escalation,
  arbitrary code execution, or local file disclosure on the user's machine
- Vulnerabilities in the ingest Worker (`apps/worker`) that allow bypass
  of validation, replay outside the 60-second PoW window, or unauthorized
  database access
- Vulnerabilities in the public dataset materialization (cron) that violate
  the anonymity-boundary promises in [THREAT-MODEL.md](./THREAT-MODEL.md)
  (k-anonymity floor, log-binning, strip-at-cron of event_id/nonce/tz_offset)
- Vulnerabilities in the install.sh trust chain (TLS, sha256 verification)
- Supply-chain vulnerabilities in our published crates on crates.io

Out of scope (please don't report):
- Issues with upstream Claude Code or Codex (report to Anthropic / OpenAI)
- Issues with PlanetScale Postgres, Cloudflare Workers, or other vendor
  services (report to the vendor)
- Best-practice deviations that aren't exploitable (e.g., "you should rotate
  the .p12 cert more often")
- Bugs that are not security-impacting (file a GitHub issue instead)

For the anonymity contract that defines what "violation" means, see
[THREAT-MODEL.md](./THREAT-MODEL.md).
