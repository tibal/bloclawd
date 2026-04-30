use std::fs;
use std::path::Path;

fn manifest_path(path: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(path)
}

#[test]
fn db_ping_handler_contract_is_wired() {
    let db_path = manifest_path("src/db.rs");
    assert!(db_path.exists(), "src/db.rs should define db_ping");

    let db = fs::read_to_string(&db_path).expect("read src/db.rs");
    for needle in [
        "wasm_bindgen_futures::spawn_local",
        "connect_raw",
        "Hyperdrive",
        "query_typed_one(\"SELECT 1::int4 AS one\"",
        "NoTls",
        "Response::from_json",
    ] {
        assert!(db.contains(needle), "src/db.rs missing {needle}");
    }

    for forbidden in ["Socket::builder()", "lazy_static", "OnceCell"] {
        assert!(
            !db.contains(forbidden),
            "src/db.rs should not contain {forbidden}"
        );
    }

    let lib = fs::read_to_string(manifest_path("src/lib.rs")).expect("read src/lib.rs");
    assert!(lib.contains("mod db;"), "lib.rs should declare mod db");
    assert!(
        lib.contains(".get_async(\"/db-ping\", db::db_ping)"),
        "lib.rs should route /db-ping to db::db_ping"
    );
    assert!(
        !lib.contains("not implemented"),
        "lib.rs should not keep the 501 stub"
    );
}
