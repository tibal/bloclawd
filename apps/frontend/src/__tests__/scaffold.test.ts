import { describe, expect, it } from "vitest";

describe("vite scaffold smoke", () => {
  it("compiles and runs", () => {
    expect(true).toBe(true);
  });

  it("imports a shadcn primitive", async () => {
    const mod = await import("@/components/ui/button");
    expect(mod.Button).toBeDefined();
  });
});
