//! Resolve the user's region.

use anyhow::{Result, anyhow};
use bloclawd_schema::{Region, country_to_region};

pub fn resolve_region() -> Result<Region> {
    if let Ok(iso) = std::env::var("BLOCLAWD_COUNTRY") {
        return country_to_region(&iso).ok_or_else(|| {
            anyhow!(
                "BLOCLAWD_COUNTRY={iso} unrecognized; example: BLOCLAWD_COUNTRY=US (use ISO 3166-1 alpha-2)"
            )
        });
    }
    let locale = sys_locale::get_locale()
        .ok_or_else(|| anyhow!("sys-locale returned None; set BLOCLAWD_COUNTRY=US (or similar)"))?;
    resolve_region_from_locale(&locale)
}

pub(crate) fn resolve_region_from_locale(locale: &str) -> Result<Region> {
    let iso = locale.split_once('-').map(|(_, region)| region).ok_or_else(|| {
        anyhow!(
            "locale {locale:?} has no region subtag (BCP47); set BLOCLAWD_COUNTRY=US (or similar)"
        )
    })?;
    country_to_region(iso).ok_or_else(|| {
        anyhow!("region {iso:?} unrecognized; set BLOCLAWD_COUNTRY=<ISO2> (example: US)")
    })
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
