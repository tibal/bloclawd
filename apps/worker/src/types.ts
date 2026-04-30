export type Bytes32 = Uint8Array;
export type Bytes8 = Uint8Array;

export const CHALLENGE_ID_LEN = 32;
export const SIG_LEN = 32;
export const PAYLOAD_HASH_LEN = 32;
export const NONCE_LEN = 8;
export const POW_INPUT_LEN = CHALLENGE_ID_LEN + PAYLOAD_HASH_LEN + NONCE_LEN; // 72
