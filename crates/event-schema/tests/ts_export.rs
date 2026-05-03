//! ts-rs emission trigger. Running `cargo test --features ts-export -p bloclawd-schema`
//! writes the .ts files into apps/web/src/generated/ (per .cargo/config.toml's
//! TS_RS_EXPORT_DIR). CI then asserts `git diff --exit-code apps/web/src/generated/`.

use bloclawd_schema::{EventPayload, Harness, Model, Region, Tier, TokenCounts};

#[test]
fn types_load() {
    let _ = std::any::type_name::<EventPayload>();
    let _ = std::any::type_name::<TokenCounts>();
    let _ = std::any::type_name::<Model>();
    let _ = std::any::type_name::<Tier>();
    let _ = std::any::type_name::<Harness>();
    let _ = std::any::type_name::<Region>();
}
