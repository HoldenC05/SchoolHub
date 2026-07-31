use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const SERVICE: &str = "com.holden.schoolhub";
const USER: &str = "caldav-app-password";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CalConfig {
    pub email: String,
    pub calendar_href: String,
    pub calendar_name: String,
    pub enabled: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
}

fn config_path(dir: &Path) -> PathBuf {
    dir.join("caldav-config.json")
}

fn password_file_path(dir: &Path) -> PathBuf {
    dir.join("caldav-app-password")
}

pub fn load(dir: &Path) -> CalConfig {
    std::fs::read_to_string(config_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, cfg: &CalConfig) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(dir), json).map_err(|e| e.to_string())
}

fn read_password_file(dir: &Path) -> Option<String> {
    std::fs::read_to_string(password_file_path(dir))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_password_file(dir: &Path, password: &str) {
    let path = password_file_path(dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, password);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
}

pub fn get_app_password(dir: &Path) -> Option<String> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
        if let Ok(existing) = entry.get_password() {
            if !existing.is_empty() {
                return Some(existing);
            }
        }
    }
    read_password_file(dir)
}

pub fn set_app_password(dir: &Path, password: &str) -> Result<(), String> {
    match keyring::Entry::new(SERVICE, USER) {
        Ok(entry) => {
            if entry.set_password(password).is_err() {
                write_password_file(dir, password);
            }
        }
        Err(_) => write_password_file(dir, password),
    }
    Ok(())
}

pub fn clear_app_password(dir: &Path) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
        let _ = entry.delete_credential();
    }
    let _ = std::fs::remove_file(password_file_path(dir));
}
