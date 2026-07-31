mod db;
mod server;
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
            tailscale_info
        ])
        .setup(|app| {
            let dir = app_data_dir(&app.handle())?;
            std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create data dir: {e}"))?;

            let db_path = dir.join("school-hub.db");
            let db = db::init(&db_path).map_err(|e| format!("database init failed: {e}"))?;

            let token = token::get_or_create_token(&dir);
            let dist = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../dist"));

            std::thread::spawn(move || {
                let runtime = match tokio::runtime::Runtime::new() {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("[school-hub] failed to start runtime: {e}");
                        return;
                    }
                };
                runtime.block_on(server::serve(db, token, dist));
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
