#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IngestCliError {
    #[error("payload rejected (CLI-Worker schema mismatch - please file an issue)")]
    SchemaMismatch,
    #[error("server unavailable, please retry")]
    ServerUnavailable,
    #[error("PoW solve timed out at K=22 (30s)")]
    PowTimeout,
}
