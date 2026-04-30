//! Plan 01.5 Rust Worker scaffold.
//! `db_ping` lives in db.rs so the Hyperdrive smoke path stays isolated.

use worker::*;

mod db;

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get("/", |_req, _ctx| Response::ok("ok"))
        .get_async("/db-ping", db::db_ping)
        .run(req, env)
        .await
}
