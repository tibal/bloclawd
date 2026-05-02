//! Hand-curated ISO 3166-1 alpha-2 -> Region match (D-65).

use crate::enums::Region;

pub fn country_to_region(_iso2: &str) -> Option<Region> {
    None
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
            "US", "CA", "MX", "FR", "DE", "GB", "JP", "CN", "IN", "KR", "BR", "AR", "CL",
            "AU", "NZ", "FJ", "NG", "ZA", "EG", "KE", "MA", "RU", "SE", "NO", "ES", "IT",
            "NL", "PL", "TR", "ID",
        ];

        for code in codes {
            assert!(country_to_region(code).is_some(), "{code} should map to a region");
        }
    }
}
