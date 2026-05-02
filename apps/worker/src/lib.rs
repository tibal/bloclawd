//! Plan 01.5 Rust Worker scaffold with Phase 2 ingest routes.

use worker::*;

mod body;
mod challenge;
mod cron;
mod errors;
mod event;
mod ratelimit;
mod secret;

#[cfg(feature = "staging-smoke")]
pub use cron::health::{COUNT_DISTINCT_CONTRIBUTORS_30D_SQL, COUNT_LIFETIME_EVENTS_SQL};
#[cfg(feature = "staging-smoke")]
pub use cron::state::{CLAIM_SQL, EAGER_INSERT_SQL, FINISH_SQL, REVERT_SQL, SWEEP_SQL};

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get("/", |_req, _ctx| Response::ok("ok"))
        .get_async("/challenge", challenge::handle_challenge)
        .post_async("/event", event::handle_event)
        .run(req, env)
        .await
}

#[event(scheduled)]
async fn scheduled(event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    let cron_expr = event.cron();
    let scheduled_ms = event.schedule();
    if let Err(e) = cron::tick::run(&cron_expr, scheduled_ms, &env).await {
        console_error!("cron tick unhandled err={}", e);
    }
}
