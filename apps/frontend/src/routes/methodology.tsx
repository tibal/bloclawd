import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/methodology")({
  component: MethodologyPage,
});

function MethodologyPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname === "/methodology/changelog") {
    return <Outlet />;
  }

  return (
    <section className="max-w-4xl space-y-10 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold leading-tight text-foreground">
          How bloclawd computes what you see
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Methods, anonymity guarantees, and the trust contract.
        </p>
      </header>

      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Proof-of-work gate
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            Every event submission solves a 22-bit SHA-256 proof-of-work
            challenge bound to the canonicalized payload bytes. The gate makes
            bulk submission expensive without requiring accounts or tracking.
            See{" "}
            <a
              className="text-primary underline underline-offset-4"
              href="https://github.com/tibal/bloclawd/blob/main/spec/pow-v1.md"
            >
              spec/pow-v1.md
            </a>{" "}
            for the byte-exact contract.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Outlier handling: 2σ unified-cost trim
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            For each cohort of tier, harness, region, and limit type, bloclawd
            computes one unified token cost per submission. Submissions outside
            plus or minus 2σ of the cohort mean are trimmed before percentile
            computation. This public policy replaces the earlier double-MAD
            rule and keeps model-specific token mixes comparable.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Cohorts with trim rates above 10% are flagged for review instead of
            silently treated as clean data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            k-anonymity floor
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            Any cohort and limit-type cell with fewer than 5 distinct
            submission groups is suppressed at materialization. Suppressed
            cells carry <code>insufficient_data: true</code> and emit no
            percentile or model breakdown. The k≥5 floor is a hard public-data
            boundary.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Windowed L-estimator percentiles
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            When a trimmed cohort has enough contributors, each p10, p25, p50,
            p75, and p90 value is emitted as the arithmetic mean of a centered
            five-sample window. The public percentile is therefore a smoothed
            statistic, not an individual submission value.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Powers-of-2 log-bin fallback
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            If a five-sample percentile window cannot fit, bloclawd emits a
            powers-of-2 bin index instead of a raw token count. The bin edges
            span 2^10 through 2^28 tokens and are shared with the SPA so labels
            match the cron calculation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Ridge weight fit and stratified fallback
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            Per-model token weights are fit with ridge regression toward
            published Anthropic and OpenAI per-token prices as a Bayesian prior.
            Low-volume cohorts fall back from cohort to tier and harness, then
            to tier, then to the prior itself. Each public model entry records
            which weight source applied.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Aggregation cadence
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            The v1 cron worker runs daily by default. Cadence is config-driven,
            and q15, h1, and d1 file paths remain stable when cadence changes so
            the public R2 contract can evolve without breaking consumers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Approximate contributor count
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            The dashboard contributor count is computed server-side from
            distinct submission groups over the published window, then fuzzy
            rounded before display. This keeps the chrome useful while
            preventing differential-query precision.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            License
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
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
              href="https://github.com/tibal/bloclawd"
            >
            published on GitHub
            </a>
            , and <code>data.bloclawd.com</code> is the public data URL.
          </p>
        </section>
      </div>
      <Outlet />
    </section>
  );
}
