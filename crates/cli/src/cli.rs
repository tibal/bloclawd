//! clap derive Args.

use bloclawd_schema::{CATALOG, LimitType, Tier};
use clap::{ArgGroup, Parser};

/// Anonymous community analytics for AI-subscription rate-limit data.
#[derive(Parser, Debug)]
#[command(
    name = "bloclawd",
    version,
    about,
    long_about = "Anonymous community analytics for AI-subscription rate-limit data.\n\nExit codes:\n  0  success\n  1  user error (bad flag, missing tier, malformed config)\n  2  no events found in window\n  3  PoW solve timeout\n  4  server error (Worker rejected, probe converged, network failure)",
    group(
        ArgGroup::new("window_kind")
            .args(["five_hour", "week"])
            .required(true)
            .multiple(false)
    )
)]
pub struct Args {
    /// Use Claude Code session logs at ~/.claude/projects/.
    #[arg(long, conflicts_with = "codex")]
    pub cc: bool,

    /// Use Codex session logs at $CODEX_HOME/sessions/ (default ~/.codex).
    #[arg(long, conflicts_with = "cc")]
    pub codex: bool,

    /// Subscription tier. Auto-persists to ~/.config/bloclawd/config.toml.
    /// On absence, the CLI loads the value from the config file.
    #[arg(long, value_name = "TIER", value_parser = parse_tier_arg)]
    pub tier: Option<Tier>,

    /// Window-close in local time. Accepted forms:
    ///   HH:MM (today, local TZ)
    ///   YYYY-MM-DD HH:MM (local TZ)
    ///   YYYY-MM-DDTHH:MM:SS (local TZ)
    #[arg(long, value_name = "LOCAL_TIME")]
    pub end: String,

    /// 5-hour window: [end - 5h, end].
    #[arg(long = "5h")]
    pub five_hour: bool,

    /// 7-day window: [end - 7d, end].
    ///
    /// In v1, `--week` is parsed for forward compatibility but is supported
    /// only on the dry-run path; submit mode exits with code 1.
    #[arg(long)]
    pub week: bool,

    /// Print the canonical payload bytes that would be submitted; do not POST.
    #[arg(long)]
    pub dry_run: bool,

    /// Skip the [y/N] confirmation prompt before submission.
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Emit a single machine-readable JSON object on stdout instead of the human view.
    #[arg(long)]
    pub json: bool,

    /// Disable ANSI colors and Unicode box characters; force ASCII-only output.
    #[arg(long)]
    pub no_color: bool,

    /// Increase verbosity (repeatable; debug-only flags out of scope for v1).
    #[arg(long, short = 'v', action = clap::ArgAction::Count)]
    pub verbose: u8,
}

fn parse_tier_arg(value: &str) -> Result<Tier, String> {
    serde_json::from_value(serde_json::Value::String(value.to_string())).map_err(|_| {
        format!(
            "invalid tier `{value}`; expected one of: {}",
            tier_choices()
        )
    })
}

fn tier_choices() -> String {
    CATALOG
        .tiers
        .iter()
        .copied()
        .filter_map(|tier| serde_json::to_value(tier).ok())
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>()
        .join("|")
}

impl Args {
    pub fn limit_type(&self) -> LimitType {
        if self.five_hour {
            LimitType::FiveH
        } else {
            LimitType::Weekly
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn args_help_lists_every_flag_and_exit_codes() {
        let mut cmd = Args::command();
        let help = cmd.render_long_help().to_string();
        for needle in [
            "--cc",
            "--codex",
            "--tier",
            "--end",
            "--5h",
            "--week",
            "--dry-run",
            "--yes",
            "--json",
            "--no-color",
            "--verbose",
            "0  success",
            "4  server error",
        ] {
            assert!(help.contains(needle), "help missing: {needle}");
        }
    }

    #[test]
    fn cli_tiers_are_provider_neutral_price_buckets() {
        let parsed = parse_tier_arg("max20").expect("parses");
        assert_eq!(parsed, Tier::Max20);
    }

    #[test]
    fn cli_tier_rejects_non_individual_business_tier() {
        assert!(parse_tier_arg("business").is_err());
        assert!(parse_tier_arg("pro_codex").is_err());
    }

    #[test]
    fn cc_and_codex_are_mutually_exclusive() {
        let result = Args::try_parse_from([
            "bloclawd", "--cc", "--codex", "--tier", "max20", "--end", "16:00", "--5h",
        ]);
        assert!(result.is_err());
    }

    #[test]
    fn end_is_required() {
        let result = Args::try_parse_from(["bloclawd", "--cc", "--tier", "max20", "--5h"]);
        assert!(result.is_err());
    }

    #[test]
    fn five_h_long_flag_parses() {
        let args = Args::try_parse_from([
            "bloclawd", "--cc", "--tier", "max20", "--end", "16:00", "--5h",
        ])
        .expect("--5h is a valid clap long flag");
        assert!(args.five_hour);
    }

    #[test]
    fn clap_parse_no_window_kind_errors() {
        let result =
            Args::try_parse_from(["bloclawd", "--cc", "--tier", "max20", "--end", "16:00"]);
        assert!(
            result.is_err(),
            "missing both --5h and --week must be a clap parse error"
        );
    }

    #[test]
    fn week_long_flag_parses() {
        let args = Args::try_parse_from([
            "bloclawd", "--cc", "--tier", "max20", "--end", "16:00", "--week",
        ])
        .expect("--week is a valid clap long flag");
        assert!(args.week);
        assert!(!args.five_hour);
    }

    #[test]
    fn cli_window_flag_drives_limit_type() {
        let args_5h = Args::parse_from([
            "bloclawd", "--cc", "--tier", "max20", "--end", "16:00", "--5h",
        ]);
        assert_eq!(args_5h.limit_type(), LimitType::FiveH);

        let args_wk = Args::parse_from([
            "bloclawd", "--cc", "--tier", "max20", "--end", "16:00", "--week",
        ]);
        assert_eq!(args_wk.limit_type(), LimitType::Weekly);
    }
}
