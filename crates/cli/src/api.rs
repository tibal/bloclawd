//! Ingest API URL constants and env override.
//!
//! There is NO command-line API URL flag. The env-only override keeps
//! the user's shell config as the trust root.

pub const BLOCLAWD_API_URL_DEFAULT: &str = "https://api.bloclawd.com";

pub fn ingest_url() -> String {
    std::env::var("BLOCLAWD_API_URL").unwrap_or_else(|_| BLOCLAWD_API_URL_DEFAULT.to_string())
}

pub fn challenge_endpoint() -> String {
    format!("{}/challenge", ingest_url())
}

pub fn event_endpoint() -> String {
    format!("{}/event", ingest_url())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_url_is_prod() {
        let _guard = crate::ENV_LOCK.lock().expect("env lock");
        unsafe {
            std::env::remove_var("BLOCLAWD_API_URL");
        }
        assert_eq!(BLOCLAWD_API_URL_DEFAULT, "https://api.bloclawd.com");
        assert_eq!(ingest_url(), "https://api.bloclawd.com");
    }

    #[test]
    fn env_override_replaces_default() {
        let _guard = crate::ENV_LOCK.lock().expect("env lock");
        unsafe {
            std::env::set_var("BLOCLAWD_API_URL", "https://staging.example.workers.dev");
        }
        assert_eq!(ingest_url(), "https://staging.example.workers.dev");
        unsafe {
            std::env::remove_var("BLOCLAWD_API_URL");
        }
    }
}
