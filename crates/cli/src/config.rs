//! TOML config at ~/.config/bloclawd/config.toml (D-48 + D-49).

use anyhow::Result;
use std::path::PathBuf;

pub fn config_path() -> Option<PathBuf> {
    todo!("RED: implement config_path")
}

pub fn load_tier() -> Result<Option<String>> {
    todo!("RED: implement load_tier")
}

pub fn save_tier(_tier: &str) -> Result<()> {
    todo!("RED: implement save_tier")
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
            path.push(format!(
                "bloclawd-cli-{name}-{}-{unique}",
                std::process::id()
            ));
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
        save_tier("pro_codex").expect("save tier");
        let body = fs::read_to_string(config_path().expect("path")).expect("read config");
        assert!(body.contains("tier = \"pro_codex\""));
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
