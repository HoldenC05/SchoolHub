mod caldav;
mod db;
mod server;
mod settings;
mod sync;
mod token;

use serde_json::json;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn get_pairing_token(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app_data_dir(&app)?;
    Ok(token::get_or_create_token(&dir))
}

#[tauri::command]
fn api_base() -> String {
    format!("http://127.0.0.1:{}", server::PORT)
}

fn find_tailscale() -> Option<&'static str> {
    const CANDIDATES: &[&str] = &[
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        "/usr/local/bin/tailscale",
        "/opt/homebrew/bin/tailscale",
    ];
    CANDIDATES.iter().copied().find(|p| PathBuf::from(p).exists())
}

#[tauri::command]
fn tailscale_info() -> Result<serde_json::Value, String> {
    let cli = find_tailscale().ok_or_else(|| {
        "Tailscale not found. Install it from https://tailscale.com/download".to_string()
    })?;

    let ip_out = std::process::Command::new(cli)
        .arg("ip")
        .arg("-4")
        .output()
        .map_err(|e| format!("failed to run tailscale: {e}"))?;
    let ip = String::from_utf8_lossy(&ip_out.stdout).trim().to_string();

    let status_out = std::process::Command::new(cli)
        .arg("status")
        .output()
        .map_err(|e| format!("failed to run tailscale: {e}"))?;
    let status = String::from_utf8_lossy(&status_out.stdout);
    let hostname = status
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .unwrap_or("")
        .to_string();

    Ok(json!({ "ip": ip, "hostname": hostname }))
}

fn run_on_thread<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel::<Result<T, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
fn cal_connect(app: tauri::AppHandle, email: String, password: String) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let email2 = email.clone();
    let password2 = password.clone();
    let calendars = run_on_thread(move || {
        let client = caldav::CalDavClient::new(&email2, &password2).map_err(|e| e.to_string())?;
        client.list_calendars()
    })?;
    settings::set_app_password(&dir, &password)?;
    let mut cfg = settings::load(&dir);
    cfg.email = email;
    settings::save(&dir, &cfg)?;
    let list: Vec<serde_json::Value> = calendars
        .iter()
        .map(|c| json!({ "href": c.href, "name": c.display_name }))
        .collect();
    Ok(json!({ "calendars": list }))
}

#[tauri::command]
fn cal_select(app: tauri::AppHandle, href: String, name: Option<String>) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let mut cfg = settings::load(&dir);
    if cfg.email.is_empty() {
        return Err("Connect your Apple ID first".into());
    }
    cfg.calendar_href = href.clone();
    if let Some(n) = name {
        cfg.calendar_name = n;
    }
    cfg.enabled = true;
    settings::save(&dir, &cfg)?;
    Ok(json!({
        "connected": true,
        "calendar_href": cfg.calendar_href,
        "calendar_name": cfg.calendar_name,
    }))
}

#[tauri::command]
fn cal_sync_now(app: tauri::AppHandle, state: tauri::State<'_, db::Db>) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let db = state.inner().clone();
    let dir2 = dir.clone();
    let report = run_on_thread(move || Ok(sync::run_sync(&dir2, &db)))?;
    let mut cfg = settings::load(&dir);
    if report.error.is_none() {
        cfg.last_sync_at = Some(caldav::now_iso_utc());
    }
    cfg.last_sync_error = report.error.clone();
    let _ = settings::save(&dir, &cfg);
    Ok(json!({
        "pushed": report.pushed,
        "pulled": report.pulled,
        "events_removed": report.events_removed,
        "error": report.error,
        "last_sync_at": cfg.last_sync_at,
    }))
}

#[tauri::command]
fn cal_sync_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let cfg = settings::load(&dir);
    Ok(json!({
        "email": cfg.email,
        "connected": cfg.enabled,
        "calendar_name": cfg.calendar_name,
        "calendar_href": cfg.calendar_href,
        "last_sync_at": cfg.last_sync_at,
        "last_sync_error": cfg.last_sync_error,
    }))
}

#[tauri::command]
fn cal_disconnect(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    settings::clear_app_password(&dir);
    let cfg = settings::CalConfig::default();
    settings::save(&dir, &cfg)?;
    Ok(json!({ "connected": false }))
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_pairing_token,
            api_base,
            tailscale_info,
            cal_connect,
            cal_select,
            cal_sync_now,
            cal_sync_status,
            cal_disconnect
        ])
        .setup(|app| {
            let dir = app_data_dir(&app.handle())?;
            std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create data dir: {e}"))?;

            let db_path = dir.join("school-hub.db");
            let db = db::init(&db_path).map_err(|e| format!("database init failed: {e}"))?;

            let token = token::get_or_create_token(&dir);
            let dist = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../dist"));
            let db_for_server = db.clone();
            app.manage(db);

            std::thread::spawn(move || {
                let runtime = match tokio::runtime::Runtime::new() {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("[school-hub] failed to start runtime: {e}");
                        return;
                    }
                };
                runtime.block_on(server::serve(db_for_server, token, dist));
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
