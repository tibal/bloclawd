import { describe, expect, it } from "vitest";

import { binLabel, LOG_BIN_EDGES } from "@/lib/log_bins";

describe("log bin helpers", () => {
  it("mirrors the Rust edge table", () => {
    expect(LOG_BIN_EDGES).toHaveLength(19);
    expect(LOG_BIN_EDGES[0]).toBe(1024);
    expect(LOG_BIN_EDGES[18]).toBe(268_435_456);
  });

  it("formats bin labels as powers-of-two intervals", () => {
    expect(binLabel(0)).toBe("[2^10, 2^11)");
  });
});
