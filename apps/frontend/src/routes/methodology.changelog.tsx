import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/EmptyState";
import { routeHead } from "@/lib/route-head";

export const Route = createFileRoute("/methodology/changelog")({
  component: MethodologyChangelogPage,
  head: () => routeHead("/methodology/changelog"),
});

function MethodologyChangelogPage() {
  return (
    <section className="py-8">
      <EmptyState
        heading="Methodology changelog"
        subhead="No changes yet. Each future change to outlier policy, rounding policy, token redaction, or aggregation cadence will be logged here."
      />
    </section>
  );
}
