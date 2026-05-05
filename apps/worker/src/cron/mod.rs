//! Scheduled aggregation module.
//!
//! Handles claim tracking, cohort aggregation, R2 emission, health summaries,
//! and cron tick orchestration.

pub mod aggregate;
pub mod health;
pub mod r2_emit;
pub mod state;
pub mod tick;

#[cfg(test)]
mod tests;
