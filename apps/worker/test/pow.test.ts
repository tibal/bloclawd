import { describe, expect, it } from "vitest";
import {
  b64uDecode,
  b64uEncode,
  hmacSha256,
  leadingZeroBits,
  payloadHash,
  powHash,
  verify,
  verifyChallenge,
  VerifyError,
} from "../src/pow.ts";

const encoder = new TextEncoder();

describe("leadingZeroBits", () => {
  it("matches known patterns", () => {
    const ten = new Uint8Array(32);
    ten[0] = 0x00;
    ten[1] = 0x3f;
    expect(leadingZeroBits(ten)).toBe(10);
    expect(leadingZeroBits(new Uint8Array(32).fill(0xff))).toBe(0);
    expect(leadingZeroBits(new Uint8Array(32).fill(0x80))).toBe(0);
    expect(leadingZeroBits(new Uint8Array(32).fill(0x40))).toBe(1);
    expect(leadingZeroBits(new Uint8Array(32))).toBe(256);
  });
});

describe("base64url", () => {
  it("round-trips 32-byte unpadded strings", () => {
    const s = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(b64uEncode(b64uDecode(s))).toBe(s);
  });
});

describe("hmacSha256", () => {
  it("matches RFC 4231 test case 1", async () => {
    const key = new Uint8Array(20).fill(0x0b);
    const msg = encoder.encode("Hi There");
    const mac = await hmacSha256(key, msg);
    const hex = Array.from(mac)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });
});

describe("payloadHash", () => {
  it("uses JCS key ordering", async () => {
    const left = await payloadHash({ b: 2, a: 1 });
    const right = await payloadHash({ a: 1, b: 2 });
    expect(Array.from(left)).toEqual(Array.from(right));
  });
});

describe("verifyChallenge", () => {
  it("accepts a valid signed challenge inside the expiry window", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(secret, challengeId);
    await expect(
      verifyChallenge({ secret, challengeId, sig, nowMs: nowMs + 1_000 }),
    ).resolves.toBeUndefined();
  });

  it("rejects a bad signature", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(encoder.encode("wrong-secret"), challengeId);
    await expect(
      verifyChallenge({ secret, challengeId, sig, nowMs: nowMs + 1_000 }),
    ).rejects.toMatchObject({ kind: "invalid_sig" });
  });

  it("rejects an expired challenge", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(secret, challengeId);
    await expect(
      verifyChallenge({ secret, challengeId, sig, nowMs: nowMs + 60_001 }),
    ).rejects.toMatchObject({ kind: "expired" });
  });
});

describe("verify", () => {
  it("accepts a matching low-difficulty proof", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(secret, challengeId);
    const payload = { a: 1, b: 2 };
    const ph = await payloadHash(payload);
    const nonce = await solveLowDifficulty(challengeId, ph, 1);
    const hash = await verify({
      secret,
      challengeId,
      sig,
      payload,
      claimedPayloadHash: ph,
      nonce,
      k: 1,
      nowMs: nowMs + 1_000,
    });
    expect(leadingZeroBits(hash)).toBeGreaterThanOrEqual(1);
  });

  it("rejects payload hash mismatch", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(secret, challengeId);
    const nonce = new Uint8Array(8);
    await expect(
      verify({
        secret,
        challengeId,
        sig,
        payload: { a: 1 },
        claimedPayloadHash: new Uint8Array(32),
        nonce,
        k: 0,
        nowMs: nowMs + 1_000,
      }),
    ).rejects.toMatchObject({ kind: "payload_hash_mismatch" });
  });

  it("rejects insufficient proof", async () => {
    const secret = encoder.encode("test-secret-do-not-use-in-prod");
    const nowMs = 1_760_000_000_000;
    const challengeId = challenge(nowMs);
    const sig = await hmacSha256(secret, challengeId);
    const payload = { a: 1 };
    const ph = await payloadHash(payload);
    const nonce = new Uint8Array(8);
    await expect(
      verify({
        secret,
        challengeId,
        sig,
        payload,
        claimedPayloadHash: ph,
        nonce,
        k: 257,
        nowMs: nowMs + 1_000,
      }),
    ).rejects.toBeInstanceOf(VerifyError);
  });
});

function challenge(nowMs: number): Uint8Array {
  const bytes = new Uint8Array(32);
  let value = BigInt(nowMs);
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  bytes.fill(7, 8);
  return bytes;
}

async function solveLowDifficulty(
  challengeId: Uint8Array,
  ph: Uint8Array,
  k: number,
): Promise<Uint8Array> {
  for (let n = 0; n < 10_000; n += 1) {
    const nonce = new Uint8Array(8);
    new DataView(nonce.buffer).setBigUint64(0, BigInt(n), false);
    const hash = await powHash(challengeId, ph, nonce);
    if (leadingZeroBits(hash) >= k) {
      return nonce;
    }
  }
  throw new Error("low difficulty solve failed");
}
