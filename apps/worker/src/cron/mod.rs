//! Phase 4 cron module - #[event(scheduled)] entry point.
//! state.rs: AGGR-17/18 work-queue (this plan)
//! tick.rs: orchestrator (stub here; full impl in 04-10)
//! aggregate.rs/ridge.rs (04-06), percentile.rs (04-07),
//! r2_emit.rs (04-08), health.rs (04-09) added by those plans.

pub mod aggregate;
pub mod health;
pub mod percentile;
pub mod r2_emit;
pub mod ridge;
pub mod state;
pub mod tick;

#[cfg(test)]
mod tests;
