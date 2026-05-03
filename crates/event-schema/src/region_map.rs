//! Hand-curated ISO 3166-1 alpha-2 -> Region match.
//! Source: UN M49 standard. AN included for partition exhaustiveness even
//! though no users derive it.
//! Audited in PR; do NOT swap for celes/iso_country crate (WASM-size + partition mismatch).

use crate::enums::Region;

pub fn country_to_region(iso2: &str) -> Option<Region> {
    match iso2.to_ascii_uppercase().as_str() {
        // North America
        "US" | "CA" | "MX" | "BS" | "BB" | "BZ" | "CR" | "CU" | "DM" | "DO" | "SV" | "GD"
        | "GT" | "HT" | "HN" | "JM" | "NI" | "PA" | "KN" | "LC" | "VC" | "TT" | "AG" | "AI"
        | "AW" | "BM" | "VG" | "BQ" | "KY" | "CW" | "GL" | "GP" | "MQ" | "MS" | "PR" | "BL"
        | "MF" | "PM" | "SX" | "TC" | "VI" => Some(Region::Na),

        // Europe
        "AD" | "AL" | "AT" | "BA" | "BE" | "BG" | "BY" | "CH" | "CY" | "CZ" | "DE" | "DK"
        | "EE" | "ES" | "FI" | "FO" | "FR" | "GB" | "GG" | "GI" | "GR" | "HR" | "HU" | "IE"
        | "IM" | "IS" | "IT" | "JE" | "LI" | "LT" | "LU" | "LV" | "MC" | "MD" | "ME" | "MK"
        | "MT" | "NL" | "NO" | "PL" | "PT" | "RO" | "RS" | "RU" | "SE" | "SI" | "SJ" | "SK"
        | "SM" | "UA" | "VA" | "AX" | "XK" => Some(Region::Eu),

        // Asia
        "AE" | "AF" | "AM" | "AZ" | "BD" | "BH" | "BN" | "BT" | "CN" | "GE" | "HK" | "ID"
        | "IL" | "IN" | "IQ" | "IR" | "JO" | "JP" | "KG" | "KH" | "KP" | "KR" | "KW" | "KZ"
        | "LA" | "LB" | "LK" | "MM" | "MN" | "MO" | "MV" | "MY" | "NP" | "OM" | "PH" | "PK"
        | "PS" | "QA" | "SA" | "SG" | "SY" | "TH" | "TJ" | "TL" | "TM" | "TR" | "TW" | "UZ"
        | "VN" | "YE" => Some(Region::As),

        // South America
        "AR" | "BO" | "BR" | "CL" | "CO" | "EC" | "FK" | "GF" | "GY" | "PE" | "PY" | "SR"
        | "UY" | "VE" => Some(Region::Sa),

        // Oceania
        "AS" | "AU" | "CC" | "CK" | "CX" | "FJ" | "FM" | "GU" | "KI" | "MH" | "MP" | "NC"
        | "NF" | "NR" | "NU" | "NZ" | "PF" | "PG" | "PN" | "PW" | "SB" | "TK" | "TO" | "TV"
        | "UM" | "VU" | "WF" | "WS" => Some(Region::Oc),

        // Africa
        "AO" | "BF" | "BI" | "BJ" | "BW" | "CD" | "CF" | "CG" | "CI" | "CM" | "CV" | "DJ"
        | "DZ" | "EG" | "EH" | "ER" | "ET" | "GA" | "GH" | "GM" | "GN" | "GQ" | "GW" | "IO"
        | "KE" | "KM" | "LR" | "LS" | "LY" | "MA" | "MG" | "ML" | "MR" | "MU" | "MW" | "MZ"
        | "NA" | "NE" | "NG" | "RE" | "RW" | "SC" | "SD" | "SH" | "SL" | "SN" | "SO" | "SS"
        | "ST" | "SZ" | "TD" | "TG" | "TN" | "TZ" | "UG" | "YT" | "ZA" | "ZM" | "ZW" => {
            Some(Region::Af)
        }

        // Antarctica, included for partition exhaustiveness.
        "AQ" | "BV" | "GS" | "HM" | "TF" => Some(Region::An),

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_north_america_codes() {
        assert_eq!(country_to_region("US"), Some(Region::Na));
        assert_eq!(country_to_region("CA"), Some(Region::Na));
        assert_eq!(country_to_region("MX"), Some(Region::Na));
    }

    #[test]
    fn maps_europe_codes() {
        assert_eq!(country_to_region("FR"), Some(Region::Eu));
        assert_eq!(country_to_region("DE"), Some(Region::Eu));
        assert_eq!(country_to_region("GB"), Some(Region::Eu));
    }

    #[test]
    fn maps_remaining_region_representatives() {
        assert_eq!(country_to_region("JP"), Some(Region::As));
        assert_eq!(country_to_region("BR"), Some(Region::Sa));
        assert_eq!(country_to_region("AU"), Some(Region::Oc));
        assert_eq!(country_to_region("NG"), Some(Region::Af));
        assert_eq!(country_to_region("AQ"), Some(Region::An));
    }

    #[test]
    fn lookup_is_case_insensitive() {
        assert_eq!(country_to_region("us"), Some(Region::Na));
        assert_eq!(country_to_region("us"), country_to_region("US"));
    }

    #[test]
    fn unrecognized_code_returns_none() {
        assert_eq!(country_to_region("XX"), None);
    }

    #[test]
    fn maps_well_known_country_sample() {
        let codes = [
            "US", "CA", "MX", "FR", "DE", "GB", "JP", "CN", "IN", "KR", "BR", "AR", "CL", "AU",
            "NZ", "FJ", "NG", "ZA", "EG", "KE", "MA", "RU", "SE", "NO", "ES", "IT", "NL", "PL",
            "TR", "ID",
        ];

        for code in codes {
            assert!(
                country_to_region(code).is_some(),
                "{code} should map to a region"
            );
        }
    }
}
