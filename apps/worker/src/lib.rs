//! Plan 01.5 Rust Worker scaffold.
//! `db_ping` lives in db.rs so the Hyperdrive smoke path stays isolated.

use pow::verify;
use worker::*;

mod body;
mod challenge;
mod db;
mod errors;
mod ratelimit;

// INGE-03 compile-only witness: `crates/pow::verify` is reachable from the Rust Worker.
// Phase 2 wires the actual call from the `POST /event` handler.
#[allow(dead_code)]
const _VERIFY_REACHABLE: for<'a> fn(
    pow::VerifyRequest<'a>,
) -> std::result::Result<pow::Hash, pow::VerifyError> = verify;

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get("/", |_req, _ctx| Response::ok("ok"))
        .get_async("/db-ping", db::db_ping)
        .get_async("/challenge", challenge::handle_challenge)
        .run(req, env)
        .await
}
