#[test]
fn cron_skeleton_exposes_scheduled_entry_and_modules() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let lib = std::fs::read_to_string(manifest_dir.join("src/lib.rs")).expect("read src/lib.rs");

    assert!(
        lib.contains("mod cron;"),
        "lib.rs should compile the cron module"
    );
    assert!(
        lib.contains("#[event(scheduled)]"),
        "lib.rs should expose a scheduled Worker handler"
    );
    assert!(
        lib.contains("cron::tick::run(&cron_expr, scheduled_ms, &env).await"),
        "scheduled handler should delegate to cron::tick::run"
    );

    let cron_mod =
        std::fs::read_to_string(manifest_dir.join("src/cron/mod.rs")).expect("read cron/mod.rs");
    assert!(cron_mod.contains("pub mod state;"));
    assert!(cron_mod.contains("pub mod tick;"));

    let tick =
        std::fs::read_to_string(manifest_dir.join("src/cron/tick.rs")).expect("read cron/tick.rs");
    assert!(tick.contains("pub async fn run("));
}
