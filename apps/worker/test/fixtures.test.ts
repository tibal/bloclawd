import fixtures from "../../../spec/pow-fixtures.json";
import { describe, expect, it } from "vitest";
import { b64uDecode, leadingZeroBits, payloadHash, powHash } from "../src/pow.ts";

interface Vector {
  name: string;
  challenge_id_b64: string;
  payload_canonical_b64: string;
  payload_hash_b64: string;
  nonce_b64: string;
  expected_hash_b64: string;
  leading_zero_bits: number;
}

const vectors: Vector[] = (fixtures as { vectors?: Vector[] }).vectors ?? (fixtures as Vector[]);

describe("spec/pow-fixtures.json round-trip", () => {
  it("contains at least 10 vectors", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10);
  });

  it("every vector has the D-10 schema (7 keys)", () => {
    const required = new Set([
      "name",
      "challenge_id_b64",
      "payload_canonical_b64",
      "payload_hash_b64",
      "nonce_b64",
      "expected_hash_b64",
      "leading_zero_bits",
    ]);
    for (const v of vectors) {
      expect(new Set(Object.keys(v))).toEqual(required);
    }
  });

  for (const v of vectors) {
    it(`vector "${v.name}": pow_hash byte-matches expected_hash`, async () => {
      const cid = b64uDecode(v.challenge_id_b64);
      const ph = b64uDecode(v.payload_hash_b64);
      const nonce = b64uDecode(v.nonce_b64);
      const expected = b64uDecode(v.expected_hash_b64);
      expect(cid.length).toBe(32);
      expect(ph.length).toBe(32);
      expect(nonce.length).toBe(8);
      expect(expected.length).toBe(32);

      const got = await powHash(cid, ph, nonce);
      expect(Array.from(got)).toEqual(Array.from(expected));
    });

    it(`vector "${v.name}": leading_zero_bits matches`, () => {
      const expected = b64uDecode(v.expected_hash_b64);
      expect(leadingZeroBits(expected)).toBe(v.leading_zero_bits);
    });

    it(`vector "${v.name}": JCS payload round-trip matches payload_hash`, async () => {
      const canonicalBytes = b64uDecode(v.payload_canonical_b64);
      const parsed = JSON.parse(new TextDecoder().decode(canonicalBytes));
      const recomputed = await payloadHash(parsed);
      const expectedPh = b64uDecode(v.payload_hash_b64);
      expect(Array.from(recomputed)).toEqual(Array.from(expectedPh));
    });
  }
});
