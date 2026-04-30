//! RFC 8785 JCS conformance test against cyberphone/json-canonicalization official
//! test vectors. If this fails, swap the workspace `serde_jcs = "0.2"` to
//! `serde_json_canonicalizer = "0.3"` (single dep flip + import path change in
//! src/jcs.rs); see RESEARCH.md Common Pitfalls Pitfall 3.

use std::path::Path;

#[test]
fn rfc8785_official_vectors() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/rfc8785");
    let entries: Vec<_> = std::fs::read_dir(&dir)
        .expect("rfc8785 test data dir present")
        .filter_map(|e| e.ok())
        .collect();
    assert!(
        !entries.is_empty(),
        "no RFC 8785 vectors vendored under {}",
        dir.display()
    );

    let mut checked = 0_u32;
    for entry in &entries {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().into_owned();
        if !name_str.ends_with(".input.json") {
            continue;
        }
        let stem = name_str.trim_end_matches(".input.json");

        let input_bytes = std::fs::read(entry.path()).expect("read input");
        let output_bytes = std::fs::read(dir.join(format!("{stem}.output.json"))).expect("read output");

        let value: serde_json::Value =
            serde_json::from_slice(&input_bytes).expect("input is valid JSON");
        let actual = serde_jcs::to_vec(&value).expect("serde_jcs emits");

        assert_eq!(
            actual, output_bytes,
            "RFC 8785 vector {stem} failed: serde_jcs output diverged from cyberphone reference"
        );
        checked += 1;
    }
    assert!(
        checked >= 3,
        "expected at least 3 vendored vectors (basic, key-ordering, number-formatting); got {checked}"
    );
}
