//! bloclawd CLI library, consumed by the bin entry and in-process tests.

pub mod api;
pub mod cli;
pub mod config;
pub mod min_version;
pub mod parsers;
pub mod region;
pub mod window;

pub use cli::Args;

/// Stub entry. Plan 07 wires parsers, canonicalization, PoW, submit, probe,
/// and rendering into a real run-loop.
pub fn run(_args: Args) -> anyhow::Result<i32> {
    eprintln!("bloclawd: scaffold-only build (Plan 03); end-to-end orchestration lands in Plan 07");
    Ok(1)
}

#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
