//! Plan 01.5-02 Rust Worker scaffold.
//! `db_ping` is an intentional 501 stub until Plan 01.5-03 wires Hyperdrive.

use worker::*;

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get("/", |_req, _ctx| Response::ok("ok"))
        .get_async("/db-ping", db_ping)
        .run(req, env)
        .await
}

async fn db_ping(_req: Request, _ctx: RouteContext<()>) -> Result<Response> {
    // TODO(01.5-03): replace this D-31 cut-over stub with Hyperdrive smoke test.
    Response::error("not implemented", 501)
}
