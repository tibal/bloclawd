import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Share2,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Chrome } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aggregateCohortCells,
  cellsMatching,
  type AggregatedCohortCell,
  type CohortCellFilter,
} from "@/lib/cohort";
import { formatTokens, formatUsd } from "@/lib/format";
import {
  MODEL_COLOR,
  TOKEN_MIX_FIELD_COLOR,
  TONE_GRADIENT,
  TONE_VAR,
  type Tone,
} from "@/lib/model-catalog";
import {
  CAVEMAN_URL,
  RANK_SHARE_PARAM,
  RTK_URL,
  analyzeRankReport,
  compactMetaParams,
  decodeRankReport,
  encodeRankReport,
  parseRankInput,
  type RankAnalysis,
  type RankReport,
  type Recommendation,
  type ShareEntry,
} from "@/lib/rank-report";
import { useBuckets, useManifest, type BucketEnvelope } from "@/lib/r2";
import { routeHead } from "@/lib/route-head";

const rankSearchSchema = z.object({
  [RANK_SHARE_PARAM]: z.string().optional(),
  profile: z.coerce.string().optional(),
  ratio: z.coerce.string().optional(),
  cost: z.coerce.string().optional(),
  seg: z.coerce.string().optional(),
});

export const Route = createFileRoute("/rank")({
  validateSearch: (search) => rankSearchSchema.parse(search),
  component: RankPage,
  head: () => routeHead("/rank"),
});

const SAMPLE_INPUT = `bloclawd submit - group 10000000... - 2 models

Limit card: claude-code / max20 / NA / 5h
Paste the block below into https://bloclawd.com/rank

--- bloclawd rank input ---
{
    "bloclawd_rank_v": 1,
    "harness": "claude-code",
    "limit_type": "5h",
    "models": [
        {
            "model": "claude-sonnet-4-5",
            "tokens": {
                "cache_read_input_tokens": 420000,
                "ephemeral_5m_input_tokens": 90000,
                "input_tokens": 360000,
                "output_tokens": 78000
            }
        },
        {
            "model": "claude-opus-4-7",
            "tokens": {
                "cache_read_input_tokens": 80000,
                "input_tokens": 120000,
                "output_tokens": 64000
            }
        }
    ],
    "region": "NA",
    "tier": "max20"
}
--- end bloclawd rank input ---`;

const RANK_DAILY_BUCKET_LIMIT = 7;
const RANK_MIN_RETAINED = 100;
const EMPTY_PATHS: string[] = [];

function RankPage() {
  const search = Route.useSearch();
  const decodedReport = useMemo(() => decodeRankReport(search.s), [search.s]);
  const [report, setReport] = useState<RankReport | null>(decodedReport);
  const [input, setInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const cohort = useRankCohorts(report);
  const analysis = useMemo(
    () => (report ? analyzeRankReport(report, cohort.exact) : null),
    [cohort.exact, report],
  );
  const broadAnalysis = useMemo(
    () => (report ? analyzeRankReport(report, cohort.broad) : null),
    [cohort.broad, report],
  );
  const shareUrl = useMemo(
    () => (report && analysis ? buildShareUrl(report, analysis) : null),
    [analysis, report],
  );

  useEffect(() => {
    setReport(decodedReport);
  }, [decodedReport]);

  useEffect(() => {
    if (!shareUrl || typeof window === "undefined") return;
    const next = new URL(shareUrl);
    const current = new URL(window.location.href);
    if (current.pathname === next.pathname && current.search === next.search) {
      return;
    }
    window.history.replaceState(null, "", `${next.pathname}${next.search}`);
  }, [shareUrl]);

  function analyzeInput(nextInput = input) {
    try {
      const parsed = parseRankInput(nextInput);
      setReport(parsed);
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }

  function loadSample() {
    setInput(SAMPLE_INPUT);
    analyzeInput(SAMPLE_INPUT);
  }

  return (
    <section className="space-y-10 py-4">
      <header className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
        <div className="flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag dot">rank card</span>
              <span className="tag teal dot">submit first</span>
              <span className="tag amber dot">shareable URL</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">
              Submit a limit hit and make a shareable card.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Run the normal bloclawd command after a cap. It asks before
              sending, contributes an anonymous public data point, and prints
              the rank block for this card. Use dry-run only if you want to
              preview without contributing yet.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href="/install">
                  <Terminal />
                  Install and submit
                </a>
              </Button>
              <Button onClick={loadSample} type="button" variant="outline">
                <Zap />
                Try sample card
              </Button>
            </div>
            <Chrome />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="cohort" value={report ? cohortLabel(report) : "pending"} />
            <StatTile
              label="api-equivalent"
              value={analysis ? formatUsd(analysis.apiCostUsd) : "--"}
            />
            <StatTile
              label="segment"
              value={analysis ? analysis.percentileLabel : "paste first"}
            />
          </div>
        </div>

        <RankPoster
          analysis={analysis}
          loading={Boolean(report && cohort.loading)}
          report={report}
          shareUrl={shareUrl}
        />
      </header>

      <section className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <div className="text-sm font-medium text-foreground">Paste submitted rank block</div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                normal run submits data · browser-only card math
              </div>
            </div>
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-3 p-5">
            <textarea
              aria-label="bloclawd CLI output"
              className="min-h-[300px] w-full resize-y rounded-lg border border-border bg-[var(--bg-1)] p-4 font-mono text-[12px] leading-5 text-foreground shadow-inner outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/40"
              onChange={(event) => setInput(event.target.value)}
              placeholder={SAMPLE_INPUT}
              spellCheck={false}
              value={input}
            />
            {parseError ? (
              <p className="text-sm text-destructive">{parseError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => analyzeInput()} type="button">
                <Zap />
                Analyze card
              </Button>
              <Button onClick={loadSample} type="button" variant="outline">
                Load sample
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ResultSummary
            analysis={analysis}
            broadAnalysis={broadAnalysis}
            broadCell={cohort.broad}
            exactCell={cohort.exact}
            error={cohort.error}
            loading={Boolean(report && cohort.loading)}
            report={report}
          />
          {analysis ? (
            <SharePanel analysis={analysis} report={report} shareUrl={shareUrl} />
          ) : null}
        </div>
      </section>

      {analysis ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <MixComparison
              left={analysis.tokenEntries}
              right={analysis.cohortTokenEntries}
              subtitle="raw token fields"
              title="Token posture"
              valueFormatter={formatTokens}
            />
            <MixComparison
              left={analysis.modelEntries}
              right={analysis.cohortModelEntries}
              subtitle="API-equivalent cost share"
              title="Model mix"
              valueFormatter={formatUsd}
            />
          </section>

          <RecommendationGrid recommendations={analysis.recommendations} />

          <section className="grid gap-3 sm:grid-cols-3">
            <ExternalProject
              href={CAVEMAN_URL}
              kicker="output discipline"
              title="Caveman"
            />
            <ExternalProject
              href={RTK_URL}
              kicker="terminal discipline"
              title="RTK"
            />
            <ExternalProject
              href="/dashboard"
              kicker="public data"
              title="Open dashboard"
            />
          </section>
        </>
      ) : null}
    </section>
  );
}

function useRankCohorts(report: RankReport | null) {
  const manifest = useManifest();
  const dailyPaths = useMemo(
    () => (report ? latestDailyBucketPaths(manifest.data?.tiers ?? null) : EMPTY_PATHS),
    [manifest.data?.tiers, report],
  );
  const bucketResults = useBuckets("d1", dailyPaths);
  const buckets = useMemo(
    () => bucketResults.flatMap((result) => (result.data ? [result.data] : [])),
    [bucketResults],
  );
  const exactFilter = useMemo(
    () => (report ? exactFilterForReport(report) : null),
    [report],
  );
  const broadFilter = useMemo(
    () => (report ? broadFilterForReport(report) : null),
    [report],
  );
  const exact = useMemo(
    () => (exactFilter ? aggregateRankBuckets(buckets, exactFilter) : null),
    [buckets, exactFilter],
  );
  const broad = useMemo(
    () => (broadFilter ? aggregateRankBuckets(buckets, broadFilter) : null),
    [buckets, broadFilter],
  );
  const bucketError = bucketResults.find((result) => result.error)?.error ?? null;

  return {
    exact,
    broad,
    loading: manifest.isLoading || bucketResults.some((result) => result.isLoading),
    error: manifest.error || bucketError ? "Public cohort data is unavailable." : null,
  };
}

function RankPoster({
  analysis,
  loading,
  report,
  shareUrl,
}: {
  analysis: RankAnalysis | null;
  loading: boolean;
  report: RankReport | null;
  shareUrl: string | null;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="relative min-h-[420px] overflow-hidden bg-[linear-gradient(135deg,oklch(0.18_0.01_260),oklch(0.20_0.03_250)_48%,oklch(0.18_0.025_180))] p-5 sm:p-6">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--teal),var(--amber),transparent)]"
        />
        <div className="relative z-10 flex h-full min-h-[372px] flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                alt=""
                className="h-10 w-10 rounded-lg"
                decoding="async"
                src="/logo.png"
              />
              <div>
                <div className="font-mono text-xs text-muted-foreground">
                  bloclawd / rank
                </div>
                <div className="text-sm font-medium text-foreground">
                  {report ? cohortLabel(report) : "paste a rank block"}
                </div>
              </div>
            </div>
            <span className="tag">{analysis?.percentileLabel ?? "no card yet"}</span>
          </div>

          {loading ? (
            <Skeleton className="h-44 w-full" />
          ) : analysis ? (
            <div className="space-y-5">
              <div>
                <div className="text-sm uppercase tracking-[0.22em] text-muted-foreground">
                  {analysis.segment}
                </div>
                <div className="mt-2 text-4xl font-semibold leading-none tracking-tight text-foreground sm:text-6xl">
                  {analysis.ratioLabel}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <PosterMetric label="API cost" value={formatUsd(analysis.apiCostUsd)} />
                <PosterMetric label="Tokens" value={formatTokens(analysis.rawTokens)} />
                <PosterMetric label="Profile" value={analysis.profile} />
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {analysis.profileBlurb}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm uppercase tracking-[0.22em] text-muted-foreground">
                virality vector
              </div>
              <div className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">
                Paste. Compare. Share the card.
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Install the CLI, run the normal command, then paste the rank
                block it prints. Dry-run is for previewing without contribution.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!shareUrl}
              onClick={() => void copyShareUrl(shareUrl)}
              type="button"
            >
              <Copy />
              Copy card URL
            </Button>
            <Button asChild disabled={!shareUrl} type="button" variant="outline">
              <a href={shareUrl ? xShareUrl(shareUrl, analysis) : "#"}>
                <Share2 />
                Share on X
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultSummary({
  analysis,
  broadAnalysis,
  broadCell,
  exactCell,
  error,
  loading,
  report,
}: {
  analysis: RankAnalysis | null;
  broadAnalysis: RankAnalysis | null;
  broadCell: AggregatedCohortCell | null;
  exactCell: AggregatedCohortCell | null;
  error: string | null;
  loading: boolean;
  report: RankReport | null;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-foreground">Cohort readout</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            exact cohort + same plan limit
          </div>
        </div>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="p-5">
        {!report ? (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              The card starts in your terminal.
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Run `bloclawd --cc --tier max20 --end 16:00 --5h` after a bonk.
              It asks before submitting, then prints the rank block for this
              card.
            </p>
          </div>
        ) : loading ? (
          <Skeleton className="h-36 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : analysis ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <CohortReadout
              analysis={analysis}
              cell={exactCell}
              label="Exact cohort"
              missing="No exact daily cohort match yet."
            />
            <CohortReadout
              analysis={broadAnalysis}
              cell={broadCell}
              label="Same plan + limit"
              missing="No same-plan daily cohort match yet."
            />
            <div className="rounded-lg border border-border/60 bg-[var(--bg-1)] p-4">
              <div className="text-sm text-muted-foreground">Profile category</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {analysis.profile}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {analysis.profileBlurb}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CohortReadout({
  analysis,
  cell,
  label,
  missing,
}: {
  analysis: RankAnalysis | null;
  cell: AggregatedCohortCell | null;
  label: string;
  missing: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        {cell ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            n={cell.n_retained}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {analysis?.segment ?? "No match"}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {analysis?.medianCostUsd == null
          ? missing
          : `Median ${formatUsd(analysis.medianCostUsd)}. Your card lands at ${formatUsd(
              analysis.apiCostUsd,
            )}.`}
      </p>
    </div>
  );
}

function SharePanel({
  analysis,
  report,
  shareUrl,
}: {
  analysis: RankAnalysis;
  report: RankReport | null;
  shareUrl: string | null;
}) {
  if (!report || !shareUrl) return null;
  return (
    <div className="surface-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Social metadata</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {analysis.shareTitle}. The URL stores the full card plus compact
            card fields.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={linkedinShareUrl(shareUrl)} rel="noreferrer" target="_blank">
              <LinkIcon />
              LinkedIn
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={xShareUrl(shareUrl, analysis)} rel="noreferrer" target="_blank">
              <Share2 />
              X
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MixComparison({
  left,
  right,
  subtitle,
  title,
  valueFormatter,
}: {
  left: ShareEntry[];
  right: ShareEntry[];
  subtitle: string;
  title: string;
  valueFormatter: (value: number) => string;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="font-mono text-[11.5px] text-muted-foreground">
          you vs similar users · {subtitle}
        </div>
      </div>
      <div className="space-y-5 p-5">
        <ShareBar entries={left} label="You" valueFormatter={valueFormatter} />
        <ShareBar
          entries={right}
          label="Similar users"
          valueFormatter={valueFormatter}
        />
      </div>
    </div>
  );
}

function ShareBar({
  entries,
  label,
  valueFormatter,
}: {
  entries: ShareEntry[];
  label: string;
  valueFormatter: (value: number) => string;
}) {
  const visible = entries.length > 0 ? entries : [{ id: "empty", label: "no public mix", value: 0, share: 1 }];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {entries.length ? `${entries.length} component${entries.length === 1 ? "" : "s"}` : "no public mix"}
        </span>
      </div>
      <div className="flex h-9 overflow-hidden rounded-md bg-[var(--bg-1)]">
        {visible.map((entry, index) => (
          <span
            aria-label={`${entry.label} ${(entry.share * 100).toFixed(0)}%`}
            className="min-w-[3px]"
            key={`${entry.id}-${index}`}
            style={{
              width: `${Math.max(0.01, entry.share) * 100}%`,
              background: colorForEntry(entry.id),
            }}
            title={`${entry.label}: ${(entry.share * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.slice(0, 4).map((entry) => (
          <div
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-[var(--bg-1)] px-3 py-2 text-[12px]"
            key={entry.id}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: colorForEntry(entry.id) }}
              />
              <span className="truncate text-muted-foreground">{entry.label}</span>
            </span>
            <span className="shrink-0 font-mono text-foreground">
              {(entry.share * 100).toFixed(0)}%
              <span className="ml-1 text-muted-foreground">
                {valueFormatter(entry.value)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationGrid({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Recommendations
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Provocative, but arithmetic-backed. The model-swap note is price
          math only; the Caveman and RTK notes depend on your workflow.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {recommendations.map((entry) => (
          <article className="surface-card p-5" key={entry.title}>
            <h3 className="text-base font-semibold text-foreground">
              {entry.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {entry.body}
            </p>
            {entry.href ? (
              <a
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-foreground"
                href={entry.href}
                rel="noreferrer"
                target="_blank"
              >
                {entry.cta ?? "Open project"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ExternalProject({
  href,
  kicker,
  title,
}: {
  href: string;
  kicker: string;
  title: string;
}) {
  const external = href.startsWith("http");
  return (
    <a
      className="surface-card block p-5 hover:text-foreground"
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {kicker}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-lg font-semibold text-foreground">{title}</span>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
    </a>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="kpi-label">{label}</div>
      <div className="mt-1 truncate font-mono text-lg text-foreground">{value}</div>
    </div>
  );
}

function PosterMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 min-h-[2.75rem] text-lg font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  );
}

function exactFilterForReport(report: RankReport): CohortCellFilter {
  return {
    harness: report.harness,
    tier: report.tier,
    region: report.region,
    limit_type: report.limit_type,
  };
}

function broadFilterForReport(report: RankReport): CohortCellFilter {
  return {
    tier: report.tier,
    limit_type: report.limit_type,
  };
}

function latestDailyBucketPaths(
  tiers: { q15: string[]; h1: string[]; d1: string[] } | null,
): string[] {
  return tiers?.d1.slice(0, RANK_DAILY_BUCKET_LIMIT) ?? EMPTY_PATHS;
}

function aggregateRankBuckets(
  buckets: readonly BucketEnvelope[],
  filter: CohortCellFilter,
): AggregatedCohortCell | null {
  const selected: BucketEnvelope["cells"] = [];
  let retained = 0;
  for (const bucket of buckets) {
    const matches = cellsMatching(bucket.cells, filter);
    if (matches.length === 0) continue;
    selected.push(...matches);
    retained += matches.reduce((sum, cell) => sum + cell.n_retained, 0);
    if (retained >= RANK_MIN_RETAINED) break;
  }
  return aggregateCohortCells(selected, filter);
}

function cohortLabel(report: RankReport): string {
  return `${report.harness} · ${report.tier} · ${report.region} · ${report.limit_type}`;
}

function buildShareUrl(report: RankReport, analysis: RankAnalysis): string {
  const origin =
    typeof window === "undefined" ? "https://bloclawd.com" : window.location.origin;
  const url = new URL("/rank", origin);
  url.searchParams.set(RANK_SHARE_PARAM, encodeRankReport(report));
  const meta = compactMetaParams(analysis);
  for (const [key, value] of Object.entries(meta)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function xShareUrl(shareUrl: string | null, analysis: RankAnalysis | null): string {
  if (!shareUrl) return "#";
  const text = analysis
    ? `${analysis.shareTitle}. ${analysis.shareDescription}`
    : "My bloclawd rate-limit rank card";
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", text);
  url.searchParams.set("url", shareUrl);
  return url.toString();
}

function linkedinShareUrl(shareUrl: string): string {
  const url = new URL("https://www.linkedin.com/sharing/share-offsite/");
  url.searchParams.set("url", shareUrl);
  return url.toString();
}

async function copyShareUrl(shareUrl: string | null) {
  if (!shareUrl || !navigator.clipboard) return;
  await navigator.clipboard.writeText(shareUrl);
}

function colorForEntry(id: string): string {
  if (id in TOKEN_MIX_FIELD_COLOR) {
    return TONE_GRADIENT[TOKEN_MIX_FIELD_COLOR[id as keyof typeof TOKEN_MIX_FIELD_COLOR]];
  }
  if (id in MODEL_COLOR) {
    const tone = MODEL_COLOR[id as keyof typeof MODEL_COLOR] as Tone;
    return TONE_VAR[tone];
  }
  return "var(--muted)";
}
