//! Plan 01.5 Rust Worker scaffold with Phase 2 ingest routes.

use worker::*;

mod body;
mod challenge;
mod errors;
mod event;
mod ratelimit;

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
