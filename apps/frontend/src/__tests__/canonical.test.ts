import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/canonical";

const fixturePath = (...segments: string[]) =>
  path.resolve(process.cwd(), "src", "__tests__", "canonical-fixtures", ...segments);

const utf8 = new TextDecoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalText(value: unknown): string {
  return utf8.decode(canonicalize(value));
}

describe("canonicalize", () => {
  it("matches Rust canonical_bytes for the CLI dry-run payload fixture", () => {
    const fixture = JSON.parse(readFileSync(fixturePath("cli-dryrun.json"), "utf8")) as {
      payload: unknown;
    };
    const expected = readFileSync(
      fixturePath("cli-dryrun-expected-bytes.txt"),
      "utf8",
    ).trim();

    expect(hex(canonicalize(fixture.payload))).toBe(expected);
  });

  it("sorts object keys independently of input insertion order", () => {
    expect(canonicalText({ a: 1, b: 2 })).toBe(canonicalText({ b: 2, a: 1 }));
    expect(canonicalText({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("canonicalizes primitives", () => {
    expect(canonicalText(null)).toBe("null");
    expect(canonicalText(true)).toBe("true");
    expect(canonicalText(false)).toBe("false");
    expect(canonicalText(123.4)).toBe("123.4");
    expect(canonicalText("plain string")).toBe('"plain string"');
  });

  it("sorts keys at every nested object level", () => {
    expect(canonicalText({ z: { b: 2, a: 1 }, a: [3, { d: 4, c: 5 }] })).toBe(
      '{"a":[3,{"c":5,"d":4}],"z":{"a":1,"b":2}}',
    );
  });
});
