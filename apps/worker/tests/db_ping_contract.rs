#[test]
fn phase2_route_surface_excludes_db_ping_probe() {
    let lib = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs"),
    )
    .expect("read src/lib.rs");
    assert!(
        !lib.contains("/db-ping"),
        "Phase 2 production routes must not expose /db-ping"
    );
    assert!(
        !lib.contains("mod db;"),
        "Phase 2 production routes must not compile the db probe module"
    );
    assert!(
        lib.contains(".get_async(\"/challenge\", challenge::handle_challenge)"),
        "lib.rs should route /challenge"
    );
    assert!(
        lib.contains(".post_async(\"/event\", event::handle_event)"),
        "lib.rs should route /event"
    );
    assert!(
        !lib.contains("not implemented"),
        "lib.rs should not keep the 501 stub"
    );
}
