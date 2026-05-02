//! bloclawd CLI library, consumed by the bin entry and in-process tests.

pub mod aggregate;
pub mod api;
pub mod cli;
pub mod config;
pub mod canonical;
pub mod min_version;
pub mod parsers;
pub mod probe;
pub mod probe_sig;
pub mod region;
pub mod solve;
pub mod submit;
pub mod window;
pub mod wire_error;

pub use cli::Args;
pub use wire_error::IngestCliError;

/// Stub entry. Plan 07 wires parsers, canonicalization, PoW, submit, probe,
/// and rendering into a real run-loop.
pub fn run(_args: Args) -> anyhow::Result<i32> {
    eprintln!("bloclawd: scaffold-only build (Plan 03); end-to-end orchestration lands in Plan 07");
    Ok(1)
}

#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
