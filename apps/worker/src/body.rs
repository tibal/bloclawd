//! Body cap helper for POST /event.
//!
//! Enforces both the Content-Length fast check and the materialized byte check.

use crate::errors::IngestError;
use worker::Request;

/// 8 KB body cap for POST /event.
pub const BODY_CAP_EVENT: usize = 8 * 1024;

/// Read request bytes while enforcing the caller-provided cap.
pub async fn read_capped(
    req: &mut Request,
    cap: usize,
) -> std::result::Result<Vec<u8>, IngestError> {
    if let Ok(Some(len_str)) = req.headers().get("content-length") {
        if let Ok(len) = len_str.parse::<usize>() {
            if len > cap {
                return Err(IngestError::BodyTooLarge);
            }
        }
    }

    let body = match req.bytes().await {
        Ok(body) => body,
        Err(_) => {
            return Err(IngestError::BadJson {
                position: None,
                message: None,
            });
        }
    };

    if body.len() > cap {
        return Err(IngestError::BodyTooLarge);
    }

    Ok(body)
}
