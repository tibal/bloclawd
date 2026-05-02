import { readFileSync } from "node:fs";
import path from "node:path";

import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/canonical";
import { routeTree } from "@/routeTree.gen";

const fixturePath = path.resolve(
  process.cwd(),
  "src",
  "__tests__",
  "canonical-fixtures",
  "cli-dryrun.json",
);

const fieldLabels = [
  "v",
  "model",
  "tier",
  "harness",
  "region",
  "tokens",
  "event_id (envelope)",
  "submission_group_id (envelope)",
  "challenge_id, sig, nonce (envelope)",
  "limit_type (envelope)",
];

const utf8 = new TextDecoder();

async function renderDataPage() {
  const history = createMemoryHistory({ initialEntries: ["/data"] });
  const router = createRouter({ history, routeTree });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(<RouterProvider router={router} />);
  });
  await router.load();
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("/data page", () => {
  it("renders canonical payload bytes and field annotations", async () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      payload: unknown;
    };
    const expectedCanonicalText = utf8.decode(canonicalize(fixture.payload));
    const { container, cleanup } = await renderDataPage();

    try {
      const canonicalPane = container.querySelector("pre");
      expect(canonicalPane).not.toBeNull();
      expect(canonicalPane?.textContent ?? "").toContain(expectedCanonicalText);

      for (const fieldLabel of fieldLabels) {
        expect(container.textContent).toContain(fieldLabel);
      }
    } finally {
      cleanup();
    }
  });
});
