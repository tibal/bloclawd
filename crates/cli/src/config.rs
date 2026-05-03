//! TOML config at ~/.config/bloclawd/config.toml.

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

pub fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let mut p: PathBuf = home.into();
    p.push(".config/bloclawd/config.toml");
    Some(p)
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct ConfigFile {
    tier: Option<String>,
    #[serde(flatten)]
    _other: BTreeMap<String, toml::Value>,
}

pub fn load_tier() -> Result<Option<String>> {
    let path = config_path().ok_or_else(|| anyhow!("HOME env var not set"))?;
    if !path.exists() {
        return Ok(None);
    }
    let text =
        std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let cfg: ConfigFile =
        toml::from_str(&text).with_context(|| format!("parse {} as TOML", path.display()))?;
    Ok(cfg.tier)
}

pub fn save_tier(tier: &str) -> Result<()> {
    let path = config_path().ok_or_else(|| anyhow!("HOME env var not set"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("mkdir -p {}", parent.display()))?;
    }
    let body = format!("tier = \"{}\"\n", tier);
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> MutexGuard<'static, ()> {
        crate::ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    struct HomeGuard {
        previous: Option<std::ffi::OsString>,
        path: PathBuf,
    }

    impl HomeGuard {
        fn set(name: &str) -> Self {
            let previous = std::env::var_os("HOME");
            let mut path = std::env::temp_dir();
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            path.push(format!("bloclawd-{name}-{}-{unique}", std::process::id()));
            fs::create_dir_all(&path).expect("create temp home");
            unsafe {
                std::env::set_var("HOME", &path);
            }
            Self { previous, path }
        }
    }

    impl Drop for HomeGuard {
        fn drop(&mut self) {
            match &self.previous {
                Some(value) => unsafe {
                    std::env::set_var("HOME", value);
                },
                None => unsafe {
                    std::env::remove_var("HOME");
                },
            }
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn config_path_returns_hardcoded_home_config_path() {
        let _env = env_lock();
        let home = HomeGuard::set("path");
        assert_eq!(
            config_path().expect("path"),
            home.path.join(".config/bloclawd/config.toml")
        );
    }

    #[test]
    fn load_tier_returns_none_when_file_absent() {
        let _env = env_lock();
        let _home = HomeGuard::set("absent");
        assert_eq!(load_tier().expect("load"), None);
    }

    #[test]
    fn load_tier_returns_some_for_valid_file() {
        let _env = env_lock();
        let _home = HomeGuard::set("valid");
        let path = config_path().expect("path");
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(&path, "tier = \"max20\"\n").expect("write config");
        assert_eq!(load_tier().expect("load"), Some("max20".to_string()));
    }

    #[test]
    fn load_tier_tolerates_unknown_keys() {
        let _env = env_lock();
        let _home = HomeGuard::set("unknown");
        let path = config_path().expect("path");
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(&path, "tier = \"max20\"\nfuture_key = \"foo\"\n").expect("write config");
        assert_eq!(load_tier().expect("load"), Some("max20".to_string()));
    }

    #[test]
    fn save_tier_creates_parent_directory_and_file() {
        let _env = env_lock();
        let _home = HomeGuard::set("save");
        save_tier("max20").expect("save tier");
        let body = fs::read_to_string(config_path().expect("path")).expect("read config");
        assert!(body.contains("tier = \"max20\""));
    }

    #[test]
    fn load_tier_errors_on_malformed_toml() {
        let _env = env_lock();
        let _home = HomeGuard::set("malformed");
        let path = config_path().expect("path");
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(&path, "tier = unquoted-bad\n").expect("write config");
        assert!(load_tier().is_err());
    }
}
