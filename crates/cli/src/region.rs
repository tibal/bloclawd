//! Resolve the user's region (D-65 + D-66 + CLI-07).

use anyhow::Result;
use event_schema::Region;

pub fn resolve_region() -> Result<Region> {
    todo!("RED: implement resolve_region")
}

pub fn resolve_region_from_locale(_locale: &str) -> Result<Region> {
    todo!("RED: implement resolve_region_from_locale")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    fn env_lock() -> MutexGuard<'static, ()> {
        crate::ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn env_country_us_returns_na() {
        let _env = env_lock();
        unsafe {
            std::env::set_var("BLOCLAWD_COUNTRY", "US");
        }
        assert_eq!(resolve_region().expect("region"), Region::Na);
        unsafe {
            std::env::remove_var("BLOCLAWD_COUNTRY");
        }
    }

    #[test]
    fn env_country_xx_errors_unrecognized() {
        let _env = env_lock();
        unsafe {
            std::env::set_var("BLOCLAWD_COUNTRY", "XX");
        }
        let err = resolve_region().expect_err("invalid country");
        assert!(err.to_string().contains("unrecognized"));
        unsafe {
            std::env::remove_var("BLOCLAWD_COUNTRY");
        }
    }

    #[test]
    fn locale_region_subtag_resolves() {
        assert_eq!(
            resolve_region_from_locale("en-US").expect("locale region"),
            Region::Na
        );
    }

    #[test]
    fn locale_without_region_subtag_errors_with_example() {
        let err = resolve_region_from_locale("en").expect_err("language-only locale");
        let message = err.to_string();
        assert!(message.contains("no region subtag"));
        assert!(message.contains("BLOCLAWD_COUNTRY=US"));
    }
}
