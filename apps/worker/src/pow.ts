import canonicalize from "@rfc-8785/json-canonicalize";
import {
  CHALLENGE_ID_LEN,
  NONCE_LEN,
  PAYLOAD_HASH_LEN,
  POW_INPUT_LEN,
  SIG_LEN,
  type Bytes8,
  type Bytes32,
} from "./types.ts";

export type { Bytes8, Bytes32 } from "./types.ts";

export const K_V1 = 22;

export class VerifyError extends Error {
  constructor(
    public kind:
      | "invalid_sig"
      | "expired"
      | "payload_hash_mismatch"
      | "pow_insufficient",
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "VerifyError";
  }
}

export function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function b64uDecode(s: string): Uint8Array {
  const padded = s.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(s.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hmacSha256(secret: Uint8Array, msg: Uint8Array): Promise<Bytes32> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
}

export async function sha256(bytes: Uint8Array): Promise<Bytes32> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function verifyChallenge(opts: {
  secret: Uint8Array;
  challengeId: Bytes32;
  sig: Bytes32;
  nowMs: number;
  expiryMs?: number;
  clockSkewMs?: number;
}): Promise<void> {
  assertLen(opts.challengeId, CHALLENGE_ID_LEN, "challenge_id");
  assertLen(opts.sig, SIG_LEN, "sig");

  const expectedSig = await hmacSha256(opts.secret, opts.challengeId);
  if (!constantTimeEqual(expectedSig, opts.sig)) {
    throw new VerifyError("invalid_sig");
  }

  const issuedMs = readU64Be(opts.challengeId.subarray(0, 8));
  const expiryMs = opts.expiryMs ?? 60_000;
  const clockSkewMs = opts.clockSkewMs ?? 5_000;
  if (issuedMs > opts.nowMs + clockSkewMs || opts.nowMs - issuedMs > expiryMs) {
    throw new VerifyError("expired");
  }
}

export function jcsBytes(value: unknown): Uint8Array {
  const rendered = canonicalize(value);
  if (typeof rendered !== "string") {
    throw new TypeError("value is not JSON-canonicalizable");
  }
  return new TextEncoder().encode(rendered);
}

export async function payloadHash(payload: unknown): Promise<Bytes32> {
  return sha256(jcsBytes(payload));
}

export async function powHash(
  challengeId: Bytes32,
  ph: Bytes32,
  nonce: Bytes8,
): Promise<Bytes32> {
  assertLen(challengeId, CHALLENGE_ID_LEN, "challenge_id");
  assertLen(ph, PAYLOAD_HASH_LEN, "payload_hash");
  assertLen(nonce, NONCE_LEN, "nonce");

  const input = new Uint8Array(POW_INPUT_LEN);
  input.set(challengeId, 0);
  input.set(ph, 32);
  input.set(nonce, 64);
  return sha256(input);
}

export function leadingZeroBits(h: Bytes32): number {
  assertLen(h, 32, "hash");

  let bits = 0;
  for (const byte of h) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export async function verify(opts: {
  secret: Uint8Array;
  challengeId: Bytes32;
  sig: Bytes32;
  payload: unknown;
  claimedPayloadHash: Bytes32;
  nonce: Bytes8;
  k?: number;
  nowMs: number;
}): Promise<Bytes32> {
  await verifyChallenge({
    secret: opts.secret,
    challengeId: opts.challengeId,
    sig: opts.sig,
    nowMs: opts.nowMs,
  });

  const recomputed = await payloadHash(opts.payload);
  if (!constantTimeEqual(recomputed, opts.claimedPayloadHash)) {
    throw new VerifyError("payload_hash_mismatch");
  }

  const hash = await powHash(opts.challengeId, recomputed, opts.nonce);
  const got = leadingZeroBits(hash);
  const need = opts.k ?? K_V1;
  if (got < need) {
    throw new VerifyError("pow_insufficient", `got ${got}; need ${need}`);
  }
  return hash;
}

function assertLen(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new Error(`${label} must be ${expected} bytes`);
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function readU64Be(bytes: Uint8Array): number {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return Number(value);
}
