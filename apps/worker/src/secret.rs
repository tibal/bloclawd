use crate::errors::IngestError;

pub(crate) fn worker_secret(env: &worker::Env) -> std::result::Result<String, IngestError> {
    let secret = env
        .secret("WORKER_SECRET")
        .map_err(|_| IngestError::Internal)?
        .to_string();
    validate_secret(secret)
}

fn validate_secret(secret: String) -> std::result::Result<String, IngestError> {
    if secret.len() < 32 {
        return Err(IngestError::Internal);
    }
    Ok(secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_secret_rejects_short_values() {
        assert!(matches!(
            validate_secret("x".repeat(31)),
            Err(IngestError::Internal)
        ));
    }

    #[test]
    fn validate_secret_accepts_32_byte_values() {
        assert_eq!(validate_secret("x".repeat(32)).unwrap().len(), 32);
    }
}
