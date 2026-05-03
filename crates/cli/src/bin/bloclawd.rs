use clap::Parser;

fn main() {
    let args = bloclawd::Args::parse();
    let exit_code = match bloclawd::run(args) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("error: {e}");
            1
        }
    };
    std::process::exit(exit_code);
}
