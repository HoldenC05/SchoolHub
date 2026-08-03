use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarSel {
    pub href: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CalConfig {
    pub email: String,
    #[serde(default)]
    pub calendar_href: String,
    #[serde(default)]
    pub calendar_name: String,
    #[serde(default)]
    pub calendars: Vec<CalendarSel>,
    #[serde(default)]
    pub push_calendar: Option<CalendarSel>,
    pub enabled: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
}

impl CalConfig {
    pub fn is_connected(&self) -> bool {
        !self.calendars.is_empty()
    }
}

fn config_path(dir: &Path) -> PathBuf {
    dir.join("caldav-config.json")
}

fn password_file_path(dir: &Path) -> PathBuf {
    dir.join("caldav-app-password")
}

fn is_special_collection_href(href: &str) -> bool {
    let h = href.trim_end_matches('/');
    h.ends_with("/calendars")
        || h.ends_with("/inbox")
        || h.ends_with("/outbox")
        || h.ends_with("/notification")
        || h.ends_with("/dropbox")
}

pub fn load(dir: &Path) -> CalConfig {
    let mut cfg: CalConfig = std::fs::read_to_string(config_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if cfg.calendars.is_empty() && !cfg.calendar_href.is_empty() {
        let sel = CalendarSel {
            href: cfg.calendar_href.clone(),
            name: cfg.calendar_name.clone(),
            color: None,
        };
        cfg.calendars.push(sel.clone());
        if cfg.push_calendar.is_none() {
            cfg.push_calendar = Some(sel);
        }
        let _ = save(dir, &cfg);
    }
    let before = cfg.calendars.len();
    cfg.calendars.retain(|c| !is_special_collection_href(&c.href));
    if let Some(push) = cfg.push_calendar.as_ref() {
        if is_special_collection_href(&push.href) {
            cfg.push_calendar = None;
        }
    }
    if cfg.calendars.len() != before {
        let _ = save(dir, &cfg);
    }
    cfg
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
    read_password_file(dir)
}

pub fn set_app_password(dir: &Path, password: &str) -> Result<(), String> {
    write_password_file(dir, password);
    Ok(())
}

pub fn clear_app_password(dir: &Path) {
    let _ = std::fs::remove_file(password_file_path(dir));
}
