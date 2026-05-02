import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

import { Chrome } from "@/components/Chrome";
import { CodeBlock } from "@/components/CodeBlock";
import { FieldAnnotation } from "@/components/FieldAnnotation";
import { useStatus, type StatusJson } from "@/lib/r2";

vi.mock("@/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2")>();
  return {
    ...actual,
    useStatus: vi.fn(),
  };
});

function status(overrides: Partial<StatusJson> = {}): StatusJson {
  return {
    schema_version: "v1",
    last_cron_success_ts: new Date(Date.now() - 12 * 60_000).toISOString(),
    last_cron_attempted_ts: new Date(Date.now() - 12 * 60_000).toISOString(),
    ingest_health: "healthy",
    total_events_lifetime: 12_345,
    approximate_contributors_30d: 230,
    approximate_contributors_window_days: 30,
    ...overrides,
  };
}

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(node);
  });

  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("Chrome", () => {
  it("renders last update, events, approximate contributors, and healthy chip", () => {
    vi.mocked(useStatus).mockReturnValue({
      data: status(),
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStatus>);

    const { container, cleanup } = render(<Chrome />);

    try {
      expect(container.textContent).toContain("Last updated 12m ago");
      expect(container.textContent).toContain("12,345 events");
      expect(container.textContent).toContain("~230 contributors");
      expect(container.textContent).toContain("Healthy");
      expect(container.querySelector('[data-health="healthy"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("renders down health with destructive badge styling", () => {
    vi.mocked(useStatus).mockReturnValue({
      data: status({ ingest_health: "down" }),
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStatus>);

    const { container, cleanup } = render(<Chrome />);

    try {
      const badge = container.querySelector('[data-health="down"]');
      expect(badge?.textContent).toContain("Down");
      expect(badge?.className).toContain("bg-destructive");
    } finally {
      cleanup();
    }
  });

  it("renders CodeBlock and FieldAnnotation helpers", () => {
    const { container, cleanup } = render(
      <>
        <CodeBlock>{"{\"v\":1}"}</CodeBlock>
        <FieldAnnotation
          anonymity="No persistent user identifier."
          field="event_id"
          meaning="One submission event UUID."
        />
      </>,
    );

    try {
      expect(container.querySelector("pre code")?.textContent).toContain("\"v\"");
      expect(container.textContent).toContain("event_id");
      expect(container.textContent).toContain("No persistent user identifier.");
    } finally {
      cleanup();
    }
  });
});
