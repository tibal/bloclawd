//! Per-request `tokio-postgres` smoke path over Cloudflare Hyperdrive.
//! `GET /db-ping` proves BACK-08 and locks the INGE-08 open/query/drop idiom.
//! The pinned tokio-postgres fork/rev keeps the Hyperdrive pooler contract stable.
//! The spawned connection future is required; without it, client queries hang.

use std::str::FromStr;
use tokio_postgres::config::Config as PgConfig;
use tokio_postgres::tls::NoTls;
use worker::*;

pub async fn db_ping(_req: Request, ctx: RouteContext<()>) -> Result<Response> {
    // 1. Get the first-class workers-rs 0.8.1 Hyperdrive binding.
    let hyperdrive = ctx.env.get_binding::<Hyperdrive>("DB")?;

    // 2. Build tokio-postgres config from Hyperdrive's connection string.
    let conn_string = hyperdrive.connection_string();

    // 3. Open the bridged Socket directly from Hyperdrive.
    let socket = hyperdrive.connect()?;

    // 4. Parse host/port/user/password/database into tokio-postgres config.
    let config = PgConfig::from_str(&conn_string)
        .map_err(|e| Error::RustError(format!("pg config: {e:?}")))?;

    // 5. Hand the worker::Socket to tokio-postgres; Hyperdrive terminates TLS.
    let (client, connection) = config
        .connect_raw(socket, NoTls)
        .await
        .map_err(|e| Error::RustError(format!("pg connect: {e:?}")))?;

    // 6. Drive the connection future, or client.query_one hangs forever.
    wasm_bindgen_futures::spawn_local(async move {
        if let Err(e) = connection.await {
            // Allowed: connection-task error has no event_id/nonce/IP context.
            console_log!("pg connection task ended: {:?}", e);
        }
    });

    // 7. Run the smoke query against the PlanetScale staging branch.
    let row = client
        .query_one("SELECT 1::int4 AS one", &[])
        .await
        .map_err(|e| Error::RustError(format!("pg query: {e:?}")))?;
    let one: i32 = row.get("one");

    drop(client);
    Response::from_json(&serde_json::json!({ "ok": one == 1 }))
}
