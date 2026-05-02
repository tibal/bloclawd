//! Per-request `tokio-postgres` smoke path over Cloudflare Hyperdrive.
//! `GET /db-ping` proves BACK-08 and locks the INGE-08 open/query/drop idiom.
//! The pinned tokio-postgres fork/rev keeps the Hyperdrive pooler contract stable.
//! The spawned connection future is required; without it, client queries hang.

use std::str::FromStr;
use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use worker::*;

fn db_unavailable() -> Result<Response> {
    Response::error("database unavailable", 503)
}

pub async fn db_ping(_req: Request, ctx: RouteContext<()>) -> Result<Response> {
    // 1. Get the first-class workers-rs 0.8.1 Hyperdrive binding.
    let hyperdrive = ctx.env.get_binding::<Hyperdrive>("DB")?;

    // 2. Build tokio-postgres config from Hyperdrive's connection string.
    let conn_string = hyperdrive.connection_string();

    // 3. Open the bridged Socket directly from Hyperdrive.
    let socket = match hyperdrive.connect() {
        Ok(socket) => socket,
        Err(_) => return db_unavailable(),
    };

    // 4. Parse host/port/user/password/database into tokio-postgres config.
    let config = match PgConfig::from_str(&conn_string) {
        Ok(config) => config,
        Err(_) => return db_unavailable(),
    };

    // 5. Hand the worker::Socket to tokio-postgres; Hyperdrive terminates TLS.
    let (client, connection) = match config.connect_raw(socket, NoTls).await {
        Ok(parts) => parts,
        Err(_) => return db_unavailable(),
    };

    // 6. Drive the connection future, or client.query_one hangs forever.
    wasm_bindgen_futures::spawn_local(async move {
        if connection.await.is_err() {
            // Allowed: connection-task error has no event_id/nonce/IP context.
            console_log!("pg connection task ended");
        }
    });

    // 7. Run the smoke query against the PlanetScale staging branch.
    let row = match client.query_typed_one("SELECT 1::int4 AS one", &[]).await {
        Ok(row) => row,
        Err(_) => return db_unavailable(),
    };
    let one: i32 = row.get("one");

    drop(client);
    Response::from_json(&serde_json::json!({ "ok": one == 1 }))
}
