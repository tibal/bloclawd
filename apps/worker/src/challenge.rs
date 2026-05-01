//! GET /challenge - stateless HMAC challenge issuance.
//!
//! Wire contract (INGE-01, locked by spec/pow-v1.md):
//!   200 {
//!     "challenge_id": "<base64url-no-pad of 32 bytes: unix_ms_be(8) || crypto_random(24)>",
//!     "sig":          "<base64url-no-pad of 32 bytes: HMAC-SHA256(WORKER_SECRET, challenge_id)>",
//!     "difficulty":   22,
//!     "expires_in":   60
//!   }
//!
//! Rate-limited per INGE-10:
//!   RL_CHALLENGE binding, 10/60s per cf-connecting-ip
//!   On exceed: 429 + Retry-After: 60 + {error: "rate_limited", route: "challenge", retry_after_s: 60}
//!
//! INGE-11: NO console_log of challenge_id, sig, random bytes, secret, or timing.
//! Stateless: no KV, no DB, no R2.

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use getrandom::fill as getrandom;
use pow::{K_V1, issue_challenge};
use serde_json::json;
use worker::{Date, Request, Response, Result, RouteContext};

use crate::errors::IngestError;
use crate::ratelimit;
use crate::secret;

/// Challenge expiry in seconds (D-41, spec/pow-v1.md). Echoed in the response
/// body so the client knows the verification window.
const EXPIRES_IN_S: u32 = 60;

pub async fn handle_challenge(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    // Step 1: RL_CHALLENGE per IP. INGE-10. Single concern.
    // ratelimit::check consumes cf-connecting-ip; never logs it.
    if let Err(e) = ratelimit::check(&req, &ctx.env, "RL_CHALLENGE", "challenge").await {
        return e.into_response();
    }

    // Step 2: time source (unix ms) - high half of challenge_id.
    // worker::Date provides unix milliseconds in workers-rs 0.8.1.
    let now_ms: u64 = Date::now().as_millis();

    // Step 3: 24 random bytes from crypto.getRandomValues (via getrandom wasm_js
    // feature, wired in 02-02). Forms the low 24 bytes of challenge_id.
    let mut random_24 = [0_u8; 24];
    if getrandom(&mut random_24).is_err() {
        // CSPRNG failure is server-side. Map to internal so the wire surface
        // does not leak the cause (which would be platform-specific).
        return IngestError::Internal.into_response();
    }

    // Step 4: WORKER_SECRET from per-env secret (D-38). Drops on return.
    let secret = match secret::worker_secret(&ctx.env) {
        Ok(secret) => secret,
        Err(e) => return e.into_response(),
    };

    // Step 5: produce (cid, sig) via the canonical helper. crates/pow lays out:
    //   cid.0[0..8]  = now_ms.to_be_bytes()
    //   cid.0[8..32] = random_24
    //   sig.0        = HMAC-SHA256(secret, cid.0)
    // Same primitive used by the e2e test in 02-05: wire identical.
    let (cid, sig) = issue_challenge(secret.as_bytes(), now_ms, random_24);

    // Step 6: encode for wire - base64url no padding (spec/event-schema.md section 1
    // + RESEARCH Discretion 5).
    let body = json!({
        "challenge_id": URL_SAFE_NO_PAD.encode(cid.0),
        "sig":          URL_SAFE_NO_PAD.encode(sig.0),
        "difficulty":   K_V1,
        "expires_in":   EXPIRES_IN_S,
    });

    // INGE-11: NO console_log here. The values above were generated for this
    // request; logging them would defeat the anonymity boundary.
    Response::from_json(&body)
}
