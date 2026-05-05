import { createFileRoute } from "@tanstack/react-router";

import { CodeBlock } from "@/components/CodeBlock";
import { FieldAnnotation } from "@/components/FieldAnnotation";
import sampleFixture from "@/__tests__/canonical-fixtures/cli-dryrun.json";
import { canonicalize } from "@/lib/canonical";
import { routeHead } from "@/lib/route-head";
import type { EventPayload } from "@web/EventPayload";

export const Route = createFileRoute("/data")({
  component: DataPage,
  head: () => routeHead("/data"),
});

const samplePayload = (sampleFixture as { payload: EventPayload }).payload;
const canonicalText = new TextDecoder().decode(canonicalize(samplePayload));
const dataSubhead =
  "Below is the literal canonical-form JSON your CLI sent — byte-identical to what the ingest worker received. Each field is annotated with what it means and why it's there.";

const fieldAnnotations = [
  {
    field: "v",
    meaning: "Schema version. Always 1 for the v1 event payload.",
    anonymity: "Public contract field; it does not identify a contributor.",
  },
  {
    field: "model",
    meaning: "Model identifier from the closed public enum.",
    anonymity: "Coarsened to accepted model names; arbitrary client strings are rejected.",
  },
  {
    field: "tier",
    meaning: "Subscription tier: pro, max5, or max20.",
    anonymity: "Closed enum; no provider account details are submitted.",
  },
  {
    field: "harness",
    meaning: "Client harness that observed the limit event: claude-code or codex.",
    anonymity: "Closed enum; no local project, shell, or editor metadata is included.",
  },
  {
    field: "region",
    meaning: "Coarse continent-level geography: NA, EU, AS, SA, OC, AF, or AN.",
    anonymity: "Derived client-side from local context; no IP geolocation is used.",
  },
  {
    field: "tokens",
    meaning:
      "Raw provider token fields for Claude Code and Codex, including distinct cache and reasoning counters.",
    anonymity:
      "Validated below 1e12 server-side and emitted publicly only through smoothed percentiles or powers-of-2 bins.",
  },
  {
    field: "event_id (envelope)",
    meaning: "Fresh UUIDv4-style event identifier outside the canonical payload.",
    anonymity: "Wire-only identifier; stripped before public R2 materialization.",
  },
  {
    field: "submission_group_id (envelope)",
    meaning: "Fresh per-CLI-invocation group identifier for related limit events.",
    anonymity:
      "Wire-only identifier; only aggregate distinct counts survive public emission.",
  },
  {
    field: "challenge_id, sig, nonce (envelope)",
    meaning: "Proof-of-work challenge id, HMAC signature, and solved nonce.",
    anonymity: "Used by ingest validation only; never appears in public R2 files.",
  },
  {
    field: "limit_type (envelope)",
    meaning: "Which subscription window was hit: 5h or weekly.",
    anonymity: "Envelope field outside the JCS canonical payload bytes.",
  },
];

function DataPage() {
  return (
    <section className="space-y-8 py-8">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-semibold leading-tight text-foreground">
          What your CLI submits
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {dataSubhead}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          See{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="https://github.com/bloclawd/bloclawd/blob/main/spec/event-schema.md"
          >
            spec/event-schema.md
          </a>{" "}
          and{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="https://github.com/bloclawd/bloclawd/blob/main/spec/payload-canonical.md"
          >
            spec/payload-canonical.md
          </a>
          .
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Canonical bytes
          </h2>
          <CodeBlock>{canonicalText}</CodeBlock>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            Annotated fields
          </h2>
          <div className="space-y-2">
            {fieldAnnotations.map((annotation) => (
              <FieldAnnotation
                key={annotation.field}
                field={annotation.field}
                meaning={annotation.meaning}
                anonymity={annotation.anonymity}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
