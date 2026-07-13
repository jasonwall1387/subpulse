use keyring::Entry;

const SERVICE: &str = "subpulse";

#[tauri::command]
pub fn secret_set(service_key: String, value: String) -> Result<(), String> {
    Entry::new(SERVICE, &service_key)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(service_key: String) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, &service_key).and_then(|e| e.get_password()) {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(service_key: String) -> Result<(), String> {
    match Entry::new(SERVICE, &service_key).and_then(|e| e.delete_credential()) {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyring_smoke() {
        secret_set("smoke".into(), "ok".into()).expect("secret_set");
        assert_eq!(
            secret_get("smoke".into()).expect("secret_get"),
            Some("ok".into())
        );
        secret_delete("smoke".into()).expect("secret_delete");
        assert_eq!(secret_get("smoke".into()).expect("after delete"), None);
    }
}
