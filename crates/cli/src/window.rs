//! `--end` parser. Accepts three local-TZ formats and converts to UTC.

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};

const FMT_HH_MM: &str = "%H:%M";
const FMT_DATE_HM: &str = "%Y-%m-%d %H:%M";
const FMT_RFC3339_NO_TZ: &str = "%Y-%m-%dT%H:%M:%S";

pub fn parse_end(s: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(t) = NaiveTime::parse_from_str(s, FMT_HH_MM) {
        let today: NaiveDate = Local::now().date_naive();
        let naive = NaiveDateTime::new(today, t);
        return local_to_utc(naive);
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, FMT_DATE_HM) {
        return local_to_utc(naive);
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, FMT_RFC3339_NO_TZ) {
        return local_to_utc(naive);
    }
    Err(format!(
        "error: --end must be HH:MM (today, local TZ), YYYY-MM-DD HH:MM (local TZ), \
         or YYYY-MM-DDTHH:MM:SS (local TZ); got {:?}",
        s
    ))
}

fn local_to_utc(naive: NaiveDateTime) -> Result<DateTime<Utc>, String> {
    match Local.from_local_datetime(&naive) {
        chrono::offset::LocalResult::Single(dt) => Ok(dt.with_timezone(&Utc)),
        chrono::offset::LocalResult::Ambiguous(early, _late) => Ok(early.with_timezone(&Utc)),
        chrono::offset::LocalResult::None => Err(format!(
            "error: --end {:?} is in a DST gap (no such local time)",
            naive
        )),
    }
}

pub fn window(
    end_utc: DateTime<Utc>,
    five_hour: bool,
    week: bool,
) -> (DateTime<Utc>, DateTime<Utc>) {
    let duration = if week {
        chrono::Duration::days(7)
    } else if five_hour {
        chrono::Duration::hours(5)
    } else {
        chrono::Duration::hours(5)
    };
    (end_utc - duration, end_utc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Local, Timelike};

    #[test]
    fn hh_mm_parses_to_today_local_time() {
        let parsed = parse_end("16:00").expect("parse HH:MM");
        let local = parsed.with_timezone(&Local);
        let today = Local::now().date_naive();
        assert_eq!(local.date_naive(), today);
        assert_eq!(local.hour(), 16);
        assert_eq!(local.minute(), 0);
    }

    #[test]
    fn date_space_hh_mm_parses() {
        let parsed = parse_end("2026-01-15 09:30").expect("parse date time");
        let local = parsed.with_timezone(&Local);
        assert_eq!((local.year(), local.month(), local.day()), (2026, 1, 15));
        assert_eq!((local.hour(), local.minute(), local.second()), (9, 30, 0));
    }

    #[test]
    fn date_t_hh_mm_ss_parses() {
        let parsed = parse_end("2026-01-15T09:30:45").expect("parse date T time");
        let local = parsed.with_timezone(&Local);
        assert_eq!((local.year(), local.month(), local.day()), (2026, 1, 15));
        assert_eq!((local.hour(), local.minute(), local.second()), (9, 30, 45));
    }

    #[test]
    fn invalid_input_errors_with_all_supported_forms() {
        let err = parse_end("not-a-time").expect_err("invalid input");
        assert!(err.contains("HH:MM"));
        assert!(err.contains("YYYY-MM-DD HH:MM"));
        assert!(err.contains("YYYY-MM-DDTHH:MM:SS"));
    }

    #[test]
    #[ignore = "DST gaps depend on the host local timezone"]
    fn dst_gap_returns_helpful_error() {
        let err = parse_end("2026-03-29 02:30").expect_err("DST gap in Europe/Paris");
        assert!(err.contains("DST gap"));
    }

    #[test]
    fn five_hour_window_subtracts_five_hours() {
        let end = parse_end("2026-01-15T09:30:45").expect("parse");
        let (start, actual_end) = window(end, true, false);
        assert_eq!(actual_end, end);
        assert_eq!(end - start, chrono::Duration::hours(5));
    }

    #[test]
    fn week_window_subtracts_seven_days() {
        let end = parse_end("2026-01-15T09:30:45").expect("parse");
        let (start, actual_end) = window(end, false, true);
        assert_eq!(actual_end, end);
        assert_eq!(end - start, chrono::Duration::days(7));
    }
}
