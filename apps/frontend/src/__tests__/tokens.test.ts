import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourcePath = (...segments: string[]) =>
  path.resolve(process.cwd(), "src", ...segments);

describe("design tokens", () => {
  it("defines chart tokens and prefers-color-scheme dark mode", () => {
    const css = readFileSync(sourcePath("styles", "tokens.css"), "utf8");

    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--chart-1");
    expect(css).toContain("--chart-2");
    expect(css).toContain("--chart-3");
    expect(css).toContain("--chart-grid");
    expect(css).toContain("--chart-crosshair");
  });

  it("imports tokens after tailwind and does not use class-based dark mode", () => {
    const css = readFileSync(sourcePath("styles", "globals.css"), "utf8");
    const importLines = css
      .split("\n")
      .filter((line) => line.startsWith("@import"));

    expect(importLines[0]).toBe('@import "tailwindcss";');
    expect(importLines[1]).toBe('@import "./tokens.css";');
    expect(css).not.toContain(".dark {");
  });
});
