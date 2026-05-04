import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

const githubUrl = "https://github.com/bloclawd/bloclawd";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-24 py-8">
      <section className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div className="space-y-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag dot">community-sourced</span>
            <span className="tag">no telemetry · no accounts</span>
          </div>

          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            When do AI subscription users{" "}
            <span style={{ color: "oklch(0.85 0.10 258)" }}>actually</span>{" "}
            hit limits?
          </h1>

          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            An anonymous, public timeline of Claude Code &amp; Codex
            rate-limit hits. Submit your own with one CLI command after you
            bonk a 5-hour or weekly cap. No login, no tracking, k-anonymized
            at <span className="font-mono text-foreground">n ≥ 5</span>.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="/dashboard">Open dashboard</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="/methodology">Read the methodology</a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href={githubUrl} rel="noreferrer" target="_blank">
                View source
              </a>
            </Button>
          </div>

          <div className="grid max-w-xl grid-cols-3 gap-3 pt-4">
            {[
              ["12,481", "submissions · 30d"],
              ["8.4M", "tokens aggregated"],
              ["n ≥ 5", "k-anonymity floor"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="surface-card px-4 py-3"
              >
                <div className="kpi-value">{value}</div>
                <div className="kpi-label mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <InstallPreview />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            t: "Loginless by design",
            d: "No accounts, no fingerprinting, no IP-based geolocation. Submission is gated by a local proof-of-work, not identity.",
          },
          {
            t: "k-anonymized aggregates",
            d: "Public cells require n ≥ 5. Token counts are binned. No public event IDs, no per-event timestamps.",
          },
          {
            t: "Auditable end-to-end",
            d: "CLI, schema, worker and frontend are open source. The wire payload is canonicalized before signing — diffable in dry-run.",
          },
        ].map((p, i) => (
          <article key={p.t} className="surface-card p-6">
            <div className="mb-4 inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-gradient-to-b from-[oklch(0.30_0.05_258)] to-[oklch(0.22_0.04_258)] font-mono text-xs font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="mb-1.5 text-base font-semibold text-foreground">
              {p.t}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">{p.d}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function InstallPreview() {
  return (
    <div className="surface-card relative overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 80% 0%, oklch(0.55 0.22 258 / 0.18), transparent 70%)",
        }}
      />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            After you hit a limit, run
          </div>
          <span className="tag">macOS · Linux</span>
        </div>

        <pre className="code-block">{`# 1. Install (universal)
`}<span className="c-cmd">curl</span><span className="c-flag"> -fsSL</span><span className="c-str"> https://bloclawd.com/install.sh</span>{` | `}<span className="c-cmd">sh</span>{`

# 2. Submit a 5-hour window
`}<span className="c-cmd">bloclawd</span><span className="c-flag"> --cc --tier max20 --end 16:00 --5h</span>{`

`}<span className="c-com">› reads ~/.claude/projects/**/*.jsonl</span>{`
`}<span className="c-com">› shows the exact event before submission</span>{`
`}<span className="c-com">› solves a PoW challenge locally</span>
        </pre>

        <div className="grid grid-cols-2 gap-2">
          {[
            ["cargo", "cargo install bloclawd"],
            ["brew", "brew install bloclawd/tap/bloclawd"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-border bg-[var(--bg-1)] px-3 py-2.5 font-mono text-xs text-muted-foreground"
            >
              <span className="mr-2 text-[oklch(0.48_0.012_260)]">{k}</span>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
