//! Per-request RateLimiter wrapper for ingest routes.
//!
//! The limiter key is consumed by the Cloudflare binding and never logged.

use crate::errors::IngestError;
use worker::{Env, RateLimiter, Request};

/// Window seconds for both ingest rate-limit bindings.
pub const WINDOW_SECONDS: u32 = 60;

/// Open the named RateLimiter binding and return Ok(()) when it allows the request.
pub async fn check(
    req: &Request,
    env: &Env,
    binding: &'static str,
    route: &'static str,
) -> std::result::Result<(), IngestError> {
    let ip = match req.headers().get("cf-connecting-ip") {
        Ok(Some(value)) => value,
        _ => {
            return Err(IngestError::RateLimited {
                route,
                retry_after_s: WINDOW_SECONDS,
            });
        }
    };

    let limiter = match env.get_binding::<RateLimiter>(binding) {
        Ok(limiter) => limiter,
        Err(_) => return Err(IngestError::Internal),
    };

    let outcome = match limiter.limit(ip).await {
        Ok(outcome) => outcome,
        Err(_) => return Err(IngestError::Internal),
    };

    if outcome.success {
        Ok(())
    } else {
        Err(IngestError::RateLimited {
            route,
            retry_after_s: WINDOW_SECONDS,
        })
    }
}
