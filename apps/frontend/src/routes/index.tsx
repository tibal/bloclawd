import { createFileRoute } from "@tanstack/react-router";
import { m, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatus } from "@/lib/r2";
import { routeHead } from "@/lib/route-head";
import { useCountUp } from "@/lib/use-count-up";

const githubUrl = "https://github.com/bloclawd/bloclawd";

const EASE = [0.16, 1, 0.3, 1] as const;

const heroContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

const installVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.85, ease: EASE, delay: 0.15 },
  },
};

const cardReveal = {
  initial: { opacity: 0, y: 16 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true, amount: 0.4 } as const,
};

const kpiReveal = {
  initial: { opacity: 0, y: 10 } as const,
  animate: { opacity: 1, y: 0 } as const,
};

function kpiValue(
  loading: boolean,
  ready: boolean,
  rendered: ReactNode,
  skeletonWidth: string,
): ReactNode {
  if (loading) return <Skeleton className={`h-7 ${skeletonWidth}`} />;
  if (!ready) return "—";
  return rendered;
}

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => routeHead("/"),
});

function HomePage() {
  return (
    <div className="space-y-24 py-8">
      <section className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <m.div
          animate="show"
          className="space-y-7"
          initial="hidden"
          variants={heroContainer}
        >
          <m.div
            className="flex flex-wrap items-center gap-2"
            variants={heroItem}
          >
            <span className="tag dot">community-sourced</span>
            <span className="tag">no telemetry · no accounts</span>
          </m.div>

          <m.h1
            className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            variants={heroItem}
          >
            When do AI subscription users{" "}
            <ShimmerWord>actually</ShimmerWord>{" "}
            hit limits?
          </m.h1>

          <m.p
            className="max-w-xl text-base leading-7 text-muted-foreground"
            variants={heroItem}
          >
            An anonymous, public timeline of Claude Code &amp; Codex
            rate-limit hits. Submit your own with one CLI command after you
            bonk a 5-hour or weekly cap. No login, no tracking, k-anonymized
            at <span className="font-mono text-foreground">n ≥ 5</span>.
          </m.p>

          <m.div
            className="flex flex-wrap items-center gap-3 sm:flex-nowrap"
            variants={heroItem}
          >
            <Button asChild className="whitespace-nowrap" size="lg">
              <a href="/dashboard">Open dashboard</a>
            </Button>
            <Button
              asChild
              className="whitespace-nowrap"
              size="lg"
              variant="outline"
            >
              <a href="/methodology">Read the methodology</a>
            </Button>
            <Button
              asChild
              className="whitespace-nowrap"
              size="lg"
              variant="ghost"
            >
              <a href={githubUrl} rel="noreferrer" target="_blank">
                View source
              </a>
            </Button>
          </m.div>

          <m.div variants={heroItem}>
            <KpiStrip />
          </m.div>
        </m.div>

        <m.div animate="show" initial="hidden" variants={installVariants}>
          <InstallPreview />
        </m.div>
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
          <m.article
            {...cardReveal}
            className="surface-card p-6"
            key={p.t}
            transition={{ duration: 0.6, ease: EASE, delay: 0.08 * i }}
          >
            <div className="mb-4 inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-gradient-to-b from-[oklch(0.30_0.05_258)] to-[oklch(0.22_0.04_258)] font-mono text-xs font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="mb-1.5 text-base font-semibold text-foreground">
              {p.t}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">{p.d}</p>
          </m.article>
        ))}
      </section>
    </div>
  );
}

function ShimmerWord({ children }: { children: ReactNode }) {
  return (
    <m.span
      animate={{
        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
      }}
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, oklch(0.85 0.10 258) 0%, oklch(0.92 0.06 258) 50%, oklch(0.85 0.10 258) 100%)",
        backgroundSize: "200% 100%",
      }}
      transition={{
        duration: 6,
        ease: "linear",
        repeat: Infinity,
      }}
    >
      {children}
    </m.span>
  );
}

function KpiStrip() {
  const { data, isLoading } = useStatus();
  const submissions = useCountUp(data?.total_events_lifetime, {
    duration: 1.6,
  });
  const contributors = useCountUp(data?.approximate_contributors_30d, {
    duration: 1.4,
  });

  const ready = !!data;
  const items: Array<{ value: ReactNode; label: string }> = [
    {
      value: kpiValue(isLoading, ready, submissions, "w-24"),
      label: "submissions · all-time",
    },
    {
      value: kpiValue(isLoading, ready, `~${contributors}`, "w-20"),
      label: `contributors · ${data?.approximate_contributors_window_days ?? 30}d`,
    },
    { value: "n ≥ 5", label: "k-anonymity floor" },
  ];

  return (
    <div
      aria-label="Dataset summary"
      className="grid max-w-xl grid-cols-3 gap-3 pt-4"
      role="group"
    >
      {items.map((item, i) => (
        <m.div
          {...kpiReveal}
          className="surface-card px-4 py-3"
          key={item.label}
          transition={{ duration: 0.55, ease: EASE, delay: 0.4 + i * 0.06 }}
        >
          <div className="kpi-value tabular-nums">{item.value}</div>
          <div className="kpi-label mt-1">{item.label}</div>
        </m.div>
      ))}
    </div>
  );
}

function InstallPreview() {
  return (
    <div className="surface-card relative overflow-hidden p-6">
      <m.div
        animate={{
          x: ["0%", "3%", "-2%", "0%"],
          y: ["0%", "-2%", "1%", "0%"],
        }}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 80% 0%, oklch(0.55 0.22 258 / 0.18), transparent 70%)",
        }}
        transition={{
          duration: 14,
          ease: "easeInOut",
          repeat: Infinity,
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
            <m.div
              className="rounded-lg border border-border bg-[var(--bg-1)] px-3 py-2.5 font-mono text-xs text-muted-foreground"
              key={k}
              whileHover={{
                y: -2,
                borderColor: "oklch(0.55 0.22 258 / 0.45)",
                transition: { duration: 0.2, ease: EASE },
              }}
            >
              <span className="mr-2 text-[oklch(0.48_0.012_260)]">{k}</span>
              {v}
            </m.div>
          ))}
        </div>
      </div>
    </div>
  );
}

