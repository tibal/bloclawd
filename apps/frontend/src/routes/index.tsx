import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

const githubUrl = "https://github.com/bloclawd/bloclawd";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="flex min-h-[calc(100vh-12rem)] flex-col justify-center gap-8 py-8">
      <div className="max-w-3xl space-y-5">
        <h1 className="text-3xl font-semibold leading-tight text-foreground">
          When do AI subscription users actually hit limits?
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Anonymous, community-sourced timeseries of Claude Code and Codex
          rate-limit hits. No accounts. No tracking. PoW-gated and open data.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild size="lg">
          <a href="/dashboard">Open dashboard</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/methodology">Read the methodology</a>
        </Button>
        <a
          className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3"
          href={githubUrl}
        >
          View on GitHub
        </a>
      </div>
    </section>
  );
}
