import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { routeHead } from "@/lib/route-head";

export const Route = createFileRoute("/compare")({
  component: CompareRedirect,
  head: () => routeHead("/rank"),
});

function CompareRedirect() {
  const target =
    typeof window === "undefined"
      ? "/rank"
      : `/rank${window.location.search}${window.location.hash}`;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <section className="mx-auto max-w-2xl space-y-4 py-12">
      <span className="tag dot">moved</span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Compare is now Rank.
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        The old tier comparison has been replaced by a shareable CLI rank card.
      </p>
      <Button asChild>
        <a href={target}>Open Rank</a>
      </Button>
    </section>
  );
}
