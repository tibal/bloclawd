import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { DataTable } from "@/components/DataTable";

describe("DataTable", () => {
  it("renders timestamp and percentile columns with tabular numeric cells", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <DataTable
            ariaLabel="API cost table"
            rows={[
              { ts: "2026-05-02T00:00:00Z", p10: 10, p25: 25, p50: 50, p75: 75, p90: 90 },
              { ts: "2026-05-02T01:00:00Z", p10: 11, p25: 26, p50: 51, p75: 76, p90: 91 },
              { ts: "2026-05-02T02:00:00Z", p10: 12, p25: 27, p50: 52, p75: 77, p90: 92 },
            ]}
          />,
        );
      });

      const table = container.querySelector("table");
      expect(table?.getAttribute("aria-label")).toBe("API cost table");
      for (const heading of ["Timestamp", "p10", "p25", "p50", "p75", "p90"]) {
        expect(table?.textContent).toContain(heading);
      }
      expect(table?.textContent).toContain("2026-05-02T01:00:00Z");
      expect(container.querySelector("td.tabular-nums")).not.toBeNull();
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it("renders a no-data empty state", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(<DataTable ariaLabel="Empty API cost table" rows={[]} />);
      });

      expect(container.textContent).toContain("No data");
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
