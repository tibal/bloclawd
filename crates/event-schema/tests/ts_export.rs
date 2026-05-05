//! ts-rs emission trigger. Running `cargo test --features ts-export -p bloclawd-schema`
//! writes the .ts files into apps/web/src/generated/ (per .cargo/config.toml's
//! TS_RS_EXPORT_DIR). CI then asserts `git diff --exit-code apps/web/src/generated/`.

use bloclawd_schema::{
    BucketCell, BucketEnvelope, Catalog, EventPayload, Harness, IngestHealth, LimitInfo, Manifest,
    ManifestTiers, Model, ModelInfo, ModelTokenMix, Percentiles, Plan, PlanInfo, PricePoint,
    Provider, Region, ReportResolution, StatusJson, Tier, TokenCounts, TokenMixTotals,
};

#[test]
fn types_load() {
    let _ = std::any::type_name::<EventPayload>();
    let _ = std::any::type_name::<TokenCounts>();
    let _ = std::any::type_name::<Model>();
    let _ = std::any::type_name::<Tier>();
    let _ = std::any::type_name::<Harness>();
    let _ = std::any::type_name::<Region>();
    let _ = std::any::type_name::<Provider>();
    let _ = std::any::type_name::<Plan>();
    let _ = std::any::type_name::<PricePoint>();
    let _ = std::any::type_name::<ModelInfo>();
    let _ = std::any::type_name::<PlanInfo>();
    let _ = std::any::type_name::<LimitInfo>();
    let _ = std::any::type_name::<Catalog>();
    let _ = std::any::type_name::<ReportResolution>();
    let _ = std::any::type_name::<IngestHealth>();
    let _ = std::any::type_name::<Percentiles>();
    let _ = std::any::type_name::<TokenMixTotals>();
    let _ = std::any::type_name::<ModelTokenMix>();
    let _ = std::any::type_name::<BucketCell>();
    let _ = std::any::type_name::<BucketEnvelope>();
    let _ = std::any::type_name::<ManifestTiers>();
    let _ = std::any::type_name::<Manifest>();
    let _ = std::any::type_name::<StatusJson>();
}
