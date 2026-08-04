mod caldav;
mod db;
mod server;
mod settings;
mod sync;
mod token;

use serde_json::json;
use std::path::PathBuf;
use tauri::Manager;

use base64::Engine;

#[tauri::command]
fn get_pairing_token(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app_data_dir(&app)?;
    Ok(token::get_or_create_token(&dir))
}

#[tauri::command]
fn api_base() -> String {
    format!("http://127.0.0.1:{}", server::PORT)
}

#[tauri::command]
fn materialize_file(state: tauri::State<'_, db::Db>, id: i64) -> Result<String, String> {
    let conn = state.inner();
    let conn = conn.lock().map_err(|e| e.to_string())?;
    let (filename, data): (String, String) = conn
        .query_row(
            "SELECT COALESCE(filename, title), COALESCE(data, '') FROM files WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    drop(conn);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("failed to decode file data: {e}"))?;
    let dir = std::env::temp_dir().join("schoolhub-files");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe_name = filename
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let path = dir.join(format!("{id}-{safe_name}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
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
        .map(|c| {
            json!({
                "href": c.href,
                "name": c.display_name.as_ref().map(String::as_str).unwrap_or(""),
                "color": c.color,
            })
        })
        .collect();
    Ok(json!({ "calendars": list }))
}

#[derive(serde::Deserialize)]
struct CalendarArg {
    href: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    push: bool,
}

#[tauri::command]
fn cal_select(app: tauri::AppHandle, calendars: Vec<CalendarArg>) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let mut cfg = settings::load(&dir);
    if cfg.email.is_empty() {
        return Err("Connect your Apple ID first".into());
    }
    cfg.calendars = calendars
        .iter()
        .filter(|c| !c.href.is_empty())
        .map(|c| settings::CalendarSel {
            href: c.href.clone(),
            name: c.name.clone().unwrap_or_default(),
            color: c.color.clone(),
        })
        .collect();
    cfg.push_calendar = calendars
        .iter()
        .find(|c| c.push && !c.href.is_empty())
        .map(|c| settings::CalendarSel {
            href: c.href.clone(),
            name: c.name.clone().unwrap_or_default(),
            color: c.color.clone(),
        });
    cfg.enabled = !cfg.calendars.is_empty();
    settings::save(&dir, &cfg)?;
    Ok(json!({
        "connected": cfg.enabled,
        "calendars": cfg.calendars,
        "push_calendar": cfg.push_calendar,
    }))
}

#[tauri::command]
fn cal_list(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let cfg = settings::load(&dir);
    if cfg.email.is_empty() {
        return Err("Connect your Apple ID first".into());
    }
    let password = settings::get_app_password(&dir)
        .ok_or_else(|| String::from("App-specific password not found — reconnect in Integrations"))?;
    let email = cfg.email.clone();
    let calendars = run_on_thread(move || {
        let client = caldav::CalDavClient::new(&email, &password).map_err(|e| e.to_string())?;
        client.list_calendars()
    })?;
    let list: Vec<serde_json::Value> = calendars
        .iter()
        .map(|c| {
            json!({
                "href": c.href,
                "name": c.display_name.as_ref().map(String::as_str).unwrap_or(""),
                "color": c.color,
            })
        })
        .collect();
    Ok(json!({ "calendars": list }))
}

#[tauri::command]
async fn cal_sync_now(app: tauri::AppHandle, state: tauri::State<'_, db::Db>) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let db = state.inner().clone();
    let dir2 = dir.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let report = sync::run_sync(&dir2, &db);
        let _ = refresh_calendar_metadata(&dir2);
        let mut cfg = settings::load(&dir2);
        if report.error.is_none() {
            cfg.last_sync_at = Some(caldav::now_iso_utc());
        }
        cfg.last_sync_error = report.error.clone();
        let _ = settings::save(&dir2, &cfg);
        (report.pushed, report.pulled, report.events_removed, report.error, cfg.last_sync_at)
    })
    .await
    .map_err(|e| e.to_string())?;
    let (pushed, pulled, events_removed, error, last_sync_at) = res;
    Ok(json!({
        "pushed": pushed,
        "pulled": pulled,
        "events_removed": events_removed,
        "error": error,
        "last_sync_at": last_sync_at,
    }))
}

#[tauri::command]
fn cal_sync_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let cfg = settings::load(&dir);
    Ok(json!({
        "email": cfg.email,
        "connected": cfg.is_connected(),
        "calendars": cfg.calendars,
        "push_calendar": cfg.push_calendar,
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

fn caldav_client_for(dir: &std::path::Path) -> Result<caldav::CalDavClient, String> {
    let cfg = settings::load(dir);
    if cfg.email.is_empty() {
        return Err("Connect your Apple ID first".into());
    }
    let password = settings::get_app_password(dir)
        .ok_or_else(|| String::from("App-specific password not found — reconnect in Integrations"))?;
    caldav::CalDavClient::new(&cfg.email, &password).map_err(|e| e.to_string())
}

pub fn refresh_calendar_metadata(dir: &std::path::Path) -> Result<(), String> {
    let cfg = settings::load(dir);
    if !cfg.is_connected() {
        return Ok(());
    }
    let password = match settings::get_app_password(dir) {
        Some(p) => p,
        None => return Ok(()),
    };
    let email = cfg.email.clone();
    let calendars = run_on_thread(move || {
        let client = caldav::CalDavClient::new(&email, &password).map_err(|e| e.to_string())?;
        client.list_calendars()
    })?;
    let by_href: std::collections::HashMap<&str, &caldav::CalInfo> =
        calendars.iter().map(|c| (c.href.as_str(), c)).collect();
    let mut cfg = settings::load(dir);
    for cal in cfg.calendars.iter_mut() {
        if let Some(info) = by_href.get(cal.href.as_str()) {
            cal.name = info.display_name.clone().unwrap_or_default();
            cal.color = info.color.clone();
        }
    }
    if let Some(push) = cfg.push_calendar.as_mut() {
        if let Some(info) = by_href.get(push.href.as_str()) {
            push.name = info.display_name.clone().unwrap_or_default();
            push.color = info.color.clone();
        }
    }
    settings::save(dir, &cfg)
}

#[tauri::command]
fn cal_event_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::Db>,
    calendar_href: String,
    title: String,
    starts_at: String,
    ends_at: String,
    all_day: bool,
    location: Option<String>,
    notes: Option<String>,
    rrule: Option<String>,
    exdates: Option<String>,
) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let client = caldav_client_for(&dir)?;
    let uid = uuid::Uuid::new_v4().simple().to_string();
    let (dstart, a1) = caldav::iso_to_ics_dt(&starts_at).ok_or("invalid start date/time")?;
    let (dend, a2) = caldav::iso_to_ics_dt(&ends_at).ok_or("invalid end date/time")?;
    let all_day = all_day && a1 && a2;
    let exdates_vec: Vec<String> = exdates
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let rrule = rrule.filter(|r| !r.trim().is_empty());
    let ics = caldav::build_event_ics(
        &uid,
        &title,
        notes.as_deref().unwrap_or(""),
        &dstart,
        &dend,
        all_day,
        rrule.as_deref(),
        &exdates_vec,
    );
    let cal_href = calendar_href.clone();
    let uid_for_put = uid.clone();
    let remote_href = run_on_thread(move || client.put_event(&cal_href, &uid_for_put, &ics))?;

    let remote_uid = format!("{uid}@schoolhub");
    let conn = state.inner();
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO calendar_events (remote_uid, summary, starts_at, ends_at, location, description, source, calendar_href, remote_href, rrule, recurrence_id, exdates) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'caldav', ?7, ?8, ?9, '', ?10)",
        rusqlite::params![
            remote_uid,
            title,
            starts_at,
            ends_at,
            location,
            notes,
            calendar_href,
            remote_href,
            rrule,
            exdates_vec.join(",")
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    db::get_one(&conn, "calendar_events", id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| String::from("event not found after create"))
}

#[tauri::command]
fn cal_event_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::Db>,
    id: i64,
    title: String,
    starts_at: String,
    ends_at: String,
    all_day: bool,
    location: Option<String>,
    notes: Option<String>,
    rrule: Option<String>,
    exdates: Option<String>,
) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let client = caldav_client_for(&dir)?;
    let conn = state.inner();
    let conn = conn.lock().map_err(|e| e.to_string())?;
    let (remote_uid, calendar_href, remote_href): (String, String, Option<String>) = conn
        .query_row(
            "SELECT remote_uid, calendar_href, remote_href FROM calendar_events WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let (dstart, a1) = caldav::iso_to_ics_dt(&starts_at).ok_or("invalid start date/time")?;
    let (dend, a2) = caldav::iso_to_ics_dt(&ends_at).ok_or("invalid end date/time")?;
    let all_day = all_day && a1 && a2;
    let exdates_vec: Vec<String> = exdates
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let rrule = rrule.filter(|r| !r.trim().is_empty());
    let ics = caldav::build_event_ics(
        &remote_uid,
        &title,
        notes.as_deref().unwrap_or(""),
        &dstart,
        &dend,
        all_day,
        rrule.as_deref(),
        &exdates_vec,
    );
    let existing_href = remote_href.clone();
    let new_href = run_on_thread(move || match existing_href {
        Some(href) => client.put_event_at(&href, &ics),
        None => client.put_event(&calendar_href, &remote_uid, &ics),
    })?;
    conn.execute(
        "UPDATE calendar_events SET summary = ?1, starts_at = ?2, ends_at = ?3, location = ?4, \
         description = ?5, rrule = ?6, exdates = ?7, remote_href = ?8, updated_at = datetime('now') \
         WHERE id = ?9",
        rusqlite::params![
            title,
            starts_at,
            ends_at,
            location,
            notes,
            rrule,
            exdates_vec.join(","),
            new_href,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    db::get_one(&conn, "calendar_events", id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| String::from("event not found after update"))
}

#[tauri::command]
fn cal_event_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::Db>,
    id: i64,
) -> Result<serde_json::Value, String> {
    let dir = app_data_dir(&app)?;
    let client = caldav_client_for(&dir)?;
    let conn = state.inner();
    let conn = conn.lock().map_err(|e| e.to_string())?;
    let remote_href: Option<String> = conn
        .query_row(
            "SELECT remote_href FROM calendar_events WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if let Some(href) = remote_href {
        run_on_thread(move || client.delete_event(&href))?;
    }
    let removed = conn
        .execute("DELETE FROM calendar_events WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "removed": removed }))
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
            materialize_file,
            tailscale_info,
            cal_connect,
            cal_list,
            cal_select,
            cal_sync_now,
            cal_sync_status,
            cal_disconnect,
            cal_event_create,
            cal_event_update,
            cal_event_delete
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
