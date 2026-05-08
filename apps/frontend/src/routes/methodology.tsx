import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { routeHead } from "@/lib/route-head";

export const Route = createFileRoute("/methodology")({
  component: MethodologyPage,
  head: () => routeHead("/methodology"),
});

interface Section {
  id: string;
  n: string;
  title: string;
  body: ReactNode;
}

const sections: Section[] = [
  {
    id: "pow",
    n: "01",
    title: "Proof-of-work gate",
    body: (
      <>
        <p>
          Every event submission solves a 22-bit SHA-256 proof-of-work
          challenge bound to the canonicalized payload bytes. The gate makes
          bulk submission expensive without requiring accounts or tracking.
          See{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="https://github.com/bloclawd/bloclawd/blob/main/spec/pow-v1.md"
          >
            spec/pow-v1.md
          </a>{" "}
          for the byte-exact contract.
        </p>
      </>
    ),
  },
  {
    id: "outliers",
    n: "02",
    title: "Outlier handling: 2σ API-cost trim",
    body: (
      <>
        <p>
          For each cohort of tier, harness, region, and limit type, bloclawd
          computes one API-equivalent cost per submission from the published
          per-model, per-token-type prices in the shared catalog. Submissions
          outside plus or minus 2σ of the cohort mean are trimmed before
          percentile computation.
        </p>
        <p className="text-sm">
          The public cell records how many submissions were dropped and how
          many remained after trimming.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    n: "03",
    title: "Rounded public cells",
    body: (
      <p>
        Every non-empty cohort cell is published with exact retained counts
        and API-cost percentiles rounded to one significant digit. For small
        cells, token mix is privacy-processed per submission before averaging:
        token fields are rounded to one significant digit, fields below 10k
        tokens become zero, and per-submission model totals below 100k tokens
        are dropped.
      </p>
    ),
  },
  {
    id: "percentiles",
    n: "04",
    title: "API-cost percentiles",
    body: (
      <p>
        Every public R2 cell emits p10, p25, p50, p75, and p90 for
        API-equivalent cost in USD. These rounded values are computed from
        retained submissions only.
      </p>
    ),
  },
  {
    id: "mix",
    n: "05",
    title: "Typical model and token mix",
    body: (
      <p>
        Each public cell also emits the average token mix across retained
        submissions, grouped by model and token type: input, output,
        cached-read, and cached-write. This shows what the typical
        rate-limit-hitting workload looked like without publishing raw events.
        Small cells use the additional per-submission redaction described above.
      </p>
    ),
  },
  {
    id: "catalog",
    n: "06",
    title: "Catalog-backed pricing",
    body: (
      <p>
        Model lists, harness mappings, supported limit types, token types,
        and API prices come from the shared Rust catalog. Adding a model or
        changing pricing in that catalog updates aggregation inputs and the
        generated TypeScript catalog used by the frontend.
      </p>
    ),
  },
  {
    id: "cadence",
    n: "07",
    title: "Aggregation cadence",
    body: (
      <p>
        The v1 cron worker runs every 15 minutes. It writes q15 buckets for
        the live feed and rolls up h1 and d1 buckets from raw database events
        when those larger windows close.
      </p>
    ),
  },
  {
    id: "contributors",
    n: "08",
    title: "Approximate contributor count",
    body: (
      <p>
        The dashboard contributor count is computed server-side from
        distinct submission groups over the published window, then fuzzy
        rounded before display. This keeps the chrome useful while
        preventing differential-query precision.
      </p>
    ),
  },
  {
    id: "license",
    n: "09",
    title: "License",
    body: (
      <p>
        Aggregated public data is licensed under{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://creativecommons.org/licenses/by/4.0/"
        >
          CC BY 4.0
        </a>
        . The source repository is{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://github.com/bloclawd/bloclawd"
        >
          published on GitHub
        </a>
        , and{" "}
        <code className="font-mono text-foreground">data.bloclawd.com</code>{" "}
        is the public data URL.
      </p>
    ),
  },
];

function MethodologyPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname === "/methodology/changelog") {
    return <Outlet />;
  }

  return (
    <section className="py-4">
      <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-5">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              methodology · v0.4
            </div>
            <nav className="flex flex-col gap-1">
              {sections.map((s) => (
                <a
                  className="nav-link justify-start px-3 py-2 text-left text-sm"
                  href={`#${s.id}`}
                  key={s.id}
                >
                  <span className="mr-2 font-mono text-[11px] text-muted-foreground">
                    {s.n}
                  </span>
                  {s.title}
                </a>
              ))}
            </nav>
            <div className="rounded-xl border border-border bg-[var(--bg-1)] p-3.5 text-xs leading-5 text-muted-foreground">
              <div className="kpi-label mb-1">cite this</div>
              <div className="font-mono text-[11px] text-foreground">
                bloclawd 0.4.2 · 2026-05-04
              </div>
            </div>
          </div>
        </aside>

        <article className="space-y-10">
          <header className="space-y-3">
            <span className="tag">methodology</span>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              How bloclawd computes what you see
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              The aggregate dashboard is only useful if you can trust how the
              numbers got there. This page documents every transformation
              between the raw session log on a contributor's laptop and the
              public cell on the timeline.
            </p>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              Read it adversarially. The math is in{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://github.com/bloclawd/bloclawd/tree/main/spec"
                rel="noreferrer"
                target="_blank"
              >
                spec/
              </a>
              , the code is in the{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://github.com/bloclawd/bloclawd"
                rel="noreferrer"
                target="_blank"
              >
                repo
              </a>
              , and the CLI prints the canonical bytes in dry-run before any
              byte leaves your machine.
            </p>
          </header>

          <div className="flex flex-col gap-5">
            {sections.map((s) => (
              <section
                className="surface-card flex gap-4 p-6"
                id={s.id}
                key={s.id}
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-primary/40 bg-gradient-to-b from-[oklch(0.30_0.05_258)] to-[oklch(0.22_0.04_258)] font-mono text-sm font-semibold text-primary">
                  {s.n}
                </div>
                <div className="space-y-2 text-[13.5px] leading-7 text-muted-foreground [&_p]:leading-7">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {s.title}
                  </h2>
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
      <Outlet />
    </section>
  );
}
