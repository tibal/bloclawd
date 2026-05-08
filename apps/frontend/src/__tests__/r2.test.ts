import { useQueries, useQuery } from "@tanstack/react-query";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchR2, useBucket, useBuckets, type BucketResult } from "@/lib/r2";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueries: vi.fn(({ queries }) =>
    queries.map((query: { queryKey: readonly unknown[] }, index: number) => ({
      data: {
        path: String(query.queryKey[1]).split("/").at(-1),
        index,
      },
      isLoading: false,
      error: null,
    })),
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useQuery).mockClear();
  vi.mocked(useQueries).mockClear();
});

describe("fetchR2", () => {
  it("caps in-flight fetches at eight", async () => {
    let active = 0;
    let maxActive = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        fetchR2<{ ok: boolean }>(`https://data.test/${idx}.json`),
      ),
    );

    expect(maxActive).toBeLessThanOrEqual(8);
    expect(maxActive).toBe(8);
  });

  it("throws on non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("missing", { status: 404 }),
    );

    await expect(fetchR2("https://data.test/missing.json")).rejects.toThrow(
      "r2 404 https://data.test/missing.json",
    );
  });
});

describe("useBuckets", () => {
  it("uses one useQueries call and returns results aligned with input paths", () => {
    function Probe({ onResults }: { onResults: (results: BucketResult[]) => void }) {
      const results = useBuckets("q15", ["a.json", "b.json", "c.json"]);
      onResults(results);
      return null;
    }

    const observed: BucketResult[][] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          React.createElement(Probe, {
            onResults: (results) => observed.push(results),
          }),
        );
      });

      expect(useQueries).toHaveBeenCalledTimes(1);
      expect(observed[0]).toHaveLength(3);
      expect(
        observed[0].map(
          (result) => (result.data as unknown as { path: string } | undefined)?.path,
        ),
      ).toEqual(["a.json", "b.json", "c.json"]);
    } finally {
      root.unmount();
      container.remove();
    }
  });
});

describe("useBucket", () => {
  it("disables the query for an empty path", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>);

    function Probe() {
      useBucket("h1", "");
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(React.createElement(Probe));
      });

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          queryKey: ["r2", "/reports/v1/h1/"],
        }),
      );
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
