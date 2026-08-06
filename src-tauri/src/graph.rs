use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::caldav::due_to_ics;
use crate::db;

const AUTH_HOST: &str = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_BASE: &str = "https://graph.microsoft.com/v1.0";
const SCOPES: &str = "offline_access User.Read Calendars.ReadWrite";
const PUSH_CAL_HREF: &str = "graph://primary";
const PUSH_CATEGORY: &str = "School Hub";
const WINDOW_BACK_DAYS: i64 = 7500;
const WINDOW_FWD_DAYS: i64 = 7500;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct OutlookConfig {
    pub client_id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub tz: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub last_sync_at: Option<String>,
    #[serde(default)]
    pub last_sync_error: Option<String>,
}

impl OutlookConfig {
    pub fn is_connected(&self) -> bool {
        !self.email.is_empty()
    }
}

fn config_path(dir: &Path) -> PathBuf {
    dir.join("outlook-config.json")
}

fn token_path(dir: &Path) -> PathBuf {
    dir.join("outlook-refresh-token")
}

pub fn load_config(dir: &Path) -> OutlookConfig {
    std::fs::read_to_string(config_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(dir: &Path, cfg: &OutlookConfig) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(dir), json).map_err(|e| e.to_string())
}

fn write_token(dir: &Path, token: &str) {
    let path = token_path(dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, token);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
}

fn read_token(dir: &Path) -> Option<String> {
    std::fs::read_to_string(token_path(dir))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn clear_token(dir: &Path) {
    let _ = std::fs::remove_file(token_path(dir));
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceCodeInfo {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "state", content = "payload", rename_all = "camelCase")]
pub enum PollStatus {
    Pending,
    Success { email: String, name: String },
    Error(String),
}

pub fn device_code(client_id: &str) -> Result<DeviceCodeInfo, String> {
    let client = Client::new();
    let resp = client
        .post(format!("{AUTH_HOST}/devicecode"))
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .map_err(|e| format!("device code request failed: {e}"))?;
    let status = resp.status();
    let json: Value = resp.json().map_err(|e| format!("bad device code response: {e}"))?;
    if !status.is_success() {
        return Err(json
            .get("error_description")
            .and_then(Value::as_str)
            .unwrap_or("device code request failed")
            .to_string());
    }
    Ok(DeviceCodeInfo {
        device_code: json["device_code"].as_str().unwrap_or("").to_string(),
        user_code: json["user_code"].as_str().unwrap_or("").to_string(),
        verification_uri: json["verification_uri"]
            .as_str()
            .unwrap_or("https://microsoft.com/devicelogin")
            .to_string(),
        message: json["message"].as_str().unwrap_or("").to_string(),
    })
}

pub fn poll_token(client_id: &str, device_code: &str, dir: &Path) -> Result<PollStatus, String> {
    let client = Client::new();
    let resp = client
        .post(format!("{AUTH_HOST}/token"))
        .form(&[
            ("client_id", client_id),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ])
        .send()
        .map_err(|e| format!("token request failed: {e}"))?;
    let status = resp.status();
    let json: Value = resp.json().map_err(|e| format!("bad token response: {e}"))?;
    if !status.is_success() {
        let err = json["error"].as_str().unwrap_or("").to_string();
        let desc = json["error_description"].as_str().unwrap_or("").to_string();
        return match err.as_str() {
            "authorization_pending" => Ok(PollStatus::Pending),
            "authorization_declined" => Ok(PollStatus::Error("Sign-in declined.".to_string())),
            "expired_token" | "bad_verification_code" => {
                Ok(PollStatus::Error("Code expired — start over.".to_string()))
            }
            _ => Err(if desc.is_empty() { err } else { desc }),
        };
    }
    let refresh = json["refresh_token"].as_str().unwrap_or("").to_string();
    if refresh.is_empty() {
        return Err("No refresh token returned by Microsoft.".to_string());
    }
    let access = json["access_token"].as_str().unwrap_or("").to_string();
    write_token(dir, &refresh);

    let mut email = String::new();
    let mut name = String::new();
    if !access.is_empty() {
        if let Ok(me) = get_me_with_access(&access) {
            email = me["userPrincipalName"].as_str().unwrap_or("").to_string();
            name = me["displayName"].as_str().unwrap_or("").to_string();
        }
    }
    Ok(PollStatus::Success { email, name })
}

fn get_me_with_access(access: &str) -> Result<Value, String> {
    let client = Client::new();
    let resp = client
        .get(format!("{GRAPH_BASE}/me?$select=userPrincipalName,displayName"))
        .header("Authorization", format!("Bearer {access}"))
        .header("Accept", "application/json")
        .send()
        .map_err(|e| format!("me request failed: {e}"))?;
    let status = resp.status();
    let json: Value = resp.json().map_err(|e| format!("bad me response: {e}"))?;
    if !status.is_success() {
        return Err(json["error"]["message"].as_str().unwrap_or("me failed").to_string());
    }
    Ok(json)
}

fn refresh_access_token(client_id: &str, refresh_token: &str) -> Result<String, String> {
    let client = Client::new();
    let resp = client
        .post(format!("{AUTH_HOST}/token"))
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", SCOPES),
        ])
        .send()
        .map_err(|e| format!("refresh request failed: {e}"))?;
    let status = resp.status();
    let json: Value = resp.json().map_err(|e| format!("bad refresh response: {e}"))?;
    if !status.is_success() {
        let desc = json["error_description"].as_str().unwrap_or("refresh failed").to_string();
        return Err(desc);
    }
    let access = json["access_token"].as_str().unwrap_or("").to_string();
    if access.is_empty() {
        return Err("No access token returned.".to_string());
    }
    Ok(access)
}

fn graph_json(dir: &Path, method: &str, path: &str, body: Option<Value>) -> Result<Value, String> {
    let cfg = load_config(dir);
    if cfg.client_id.is_empty() {
        return Err("Microsoft Client ID not set.".to_string());
    }
    let refresh = read_token(dir).ok_or_else(|| "Not connected to Microsoft yet.".to_string())?;
    let tz = if cfg.tz.is_empty() { "UTC".to_string() } else { cfg.tz };
    let full = format!("{GRAPH_BASE}/{}", path.trim_start_matches('/'));
    graph_json_url(&cfg.client_id, &refresh, &tz, method, &full, body)
}

fn graph_json_url(
    client_id: &str,
    refresh: &str,
    tz: &str,
    method: &str,
    url: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    for attempt in 0..2 {
        let access = refresh_access_token(client_id, refresh)?;
        let client = Client::builder().timeout(Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
        let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("bad method: {e}"))?;
        let mut req = client
            .request(method, url)
            .header("Authorization", format!("Bearer {access}"))
            .header("Prefer", format!("outlook.timezone=\"{tz}\""))
            .header("Accept", "application/json");
        if let Some(b) = body.as_ref() {
            req = req
                .header("Content-Type", "application/json")
                .body(b.to_string());
        }
        let resp = req.send().map_err(|e| format!("Graph request failed: {e}"))?;
        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
            continue;
        }
        let text = resp.text().map_err(|e| format!("failed to read response: {e}"))?;
        let json: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if !status.is_success() {
            let msg = json["error"]["message"].as_str().unwrap_or(&text).to_string();
            return Err(format!("Graph {status}: {msg}"));
        }
        return Ok(json);
    }
    Err("Microsoft re-authentication failed — reconnect in Integrations.".to_string())
}

fn ics_to_graph_dt(ics: &str) -> String {
    let digits: String = ics.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() >= 14 {
        format!(
            "{}-{}-{}T{}:{}:{}",
            &digits[0..4],
            &digits[4..6],
            &digits[6..8],
            &digits[8..10],
            &digits[10..12],
            &digits[12..14]
        )
    } else if digits.len() >= 8 {
        format!("{}-{}-{}T00:00:00", &digits[0..4], &digits[4..6], &digits[6..8])
    } else {
        ics.to_string()
    }
}

fn ics_range_graph() -> (String, String) {
    let (start, end) = crate::caldav::ics_range(WINDOW_BACK_DAYS, WINDOW_FWD_DAYS);
    let fmt = |s: String| -> String {
        let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
        format!(
            "{}-{}-{}T{}:{}:{}Z",
            &digits[0..4],
            &digits[4..6],
            &digits[6..8],
            &digits[8..10],
            &digits[10..12],
            &digits[12..14]
        )
    };
    (fmt(start), fmt(end))
}

fn graph_local_time(value: &Value, key: &str) -> String {
    let date_time = value
        .get(key)
        .and_then(|v| v.get("dateTime"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if date_time.len() >= 16 {
        date_time[..16].to_string()
    } else {
        date_time.to_string()
    }
}

fn is_our_event(ev: &Value) -> bool {
    ev.get("categories")
        .and_then(Value::as_array)
        .map(|cats| cats.iter().any(|c| c.as_str() == Some(PUSH_CATEGORY)))
        .unwrap_or(false)
}

fn get_link(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: i64,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT remote_href FROM calendar_links \
             WHERE entity_type = ?1 AND entity_id = ?2 AND calendar_href = ?3",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![entity_type, entity_id, PUSH_CAL_HREF])
        .map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row.get(0).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

fn upsert_link(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_id: i64,
    uid: &str,
    remote_href: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO calendar_links (entity_type, entity_id, remote_uid, remote_href, calendar_href) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(entity_type, entity_id, calendar_href) DO UPDATE SET \
           remote_uid = excluded.remote_uid, remote_href = excluded.remote_href, updated_at = datetime('now')",
        rusqlite::params![entity_type, entity_id, uid, remote_href, PUSH_CAL_HREF],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_link(conn: &rusqlite::Connection, entity_type: &str, entity_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM calendar_links WHERE entity_type = ?1 AND entity_id = ?2 AND calendar_href = ?3",
        rusqlite::params![entity_type, entity_id, PUSH_CAL_HREF],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn link_has_remote_href(conn: &rusqlite::Connection, remote_href: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM calendar_links WHERE remote_href = ?1",
            [remote_href],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncReport {
    pub pushed: usize,
    pub pulled: usize,
    pub events_removed: usize,
    pub error: Option<String>,
}

fn push_assignments(
    conn: &rusqlite::Connection,
    dir: &Path,
    report: &mut SyncReport,
) -> Result<(), String> {
    let cfg = load_config(dir);
    let tz = if cfg.tz.is_empty() { "UTC".to_string() } else { cfg.tz.clone() };
    let mut stmt = conn
        .prepare("SELECT id, title, due_at, notes FROM assignments")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for (id, title, due, notes) in rows {
        if let Some(due) = due {
            if let Some((start, end, all_day)) = due_to_ics(&due) {
                let payload = json!({
                    "subject": title,
                    "start": { "dateTime": ics_to_graph_dt(&start), "timeZone": tz },
                    "end": { "dateTime": ics_to_graph_dt(&end), "timeZone": tz },
                    "isAllDay": all_day,
                    "categories": [PUSH_CATEGORY],
                    "body": { "contentType": "text", "content": notes.unwrap_or_default() }
                });
                match get_link(conn, "assignment", id)? {
                    Some(graph_id) => {
                        graph_json(dir, "PATCH", &format!("me/events/{graph_id}"), Some(payload))?;
                    }
                    None => {
                        let created = graph_json(dir, "POST", "me/events", Some(payload))?;
                        let graph_id = created["id"]
                            .as_str()
                            .ok_or_else(|| "Graph did not return an event id.".to_string())?
                            .to_string();
                        upsert_link(conn, "assignment", id, &format!("assignment-{id}"), &graph_id)?;
                    }
                }
                report.pushed += 1;
                continue;
            }
        }
        if let Some(graph_id) = get_link(conn, "assignment", id)? {
            graph_json(dir, "DELETE", &format!("me/events/{graph_id}"), None)?;
            remove_link(conn, "assignment", id)?;
            report.events_removed += 1;
        }
    }
    Ok(())
}

fn remove_orphaned_links(
    conn: &rusqlite::Connection,
    dir: &Path,
    report: &mut SyncReport,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, remote_href FROM calendar_links \
             WHERE entity_type = 'assignment' AND calendar_href = ?1 \
               AND entity_id NOT IN (SELECT id FROM assignments)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(rusqlite::params![PUSH_CAL_HREF], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    for (id, graph_id) in rows {
        if graph_id.starts_with("graph://") {
            continue;
        }
        graph_json(dir, "DELETE", &format!("me/events/{graph_id}"), None)?;
        conn.execute("DELETE FROM calendar_links WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        report.events_removed += 1;
    }
    Ok(())
}

fn upsert_cal_event(conn: &rusqlite::Connection, ev: &Value) -> Result<(), String> {
    let id = ev["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Ok(());
    }
    let summary = ev["subject"].as_str().unwrap_or("").to_string();
    let starts_at = graph_local_time(&ev["start"], "dateTime");
    let ends_at = graph_local_time(&ev["end"], "dateTime");
    let location = ev["location"]["displayName"].as_str().unwrap_or("").to_string();
    let description = ev["body"]["content"].as_str().unwrap_or("").to_string();
    let changed = conn
        .execute(
            "UPDATE calendar_events SET summary = ?1, starts_at = ?2, ends_at = ?3, location = ?4, \
             description = ?5, source = 'graph', calendar_href = ?6, remote_href = ?7, updated_at = datetime('now') \
             WHERE remote_uid = ?8 AND calendar_href = ?6 AND recurrence_id = ''",
            rusqlite::params![summary, starts_at, ends_at, location, description, PUSH_CAL_HREF, id, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        conn.execute(
            "INSERT INTO calendar_events (remote_uid, summary, starts_at, ends_at, location, description, source, calendar_href, remote_href, recurrence_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'graph', ?7, ?8, '')",
            rusqlite::params![id, summary, starts_at, ends_at, location, description, PUSH_CAL_HREF, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn pull_events(conn: &rusqlite::Connection, dir: &Path, report: &mut SyncReport) -> Result<(), String> {
    let (start, end) = ics_range_graph();
    let mut path = format!(
        "me/events?$select=id,subject,start,end,location,body,categories&$top=200&startdatetime={start}&enddatetime={end}"
    );
    loop {
        let json = graph_json(dir, "GET", &path, None)?;
        let results = json["value"].as_array().cloned().unwrap_or_default();
        for ev in &results {
            if is_our_event(ev) {
                continue;
            }
            let id = ev["id"].as_str().unwrap_or("").to_string();
            if id.is_empty() || link_has_remote_href(conn, &id)? {
                continue;
            }
            upsert_cal_event(conn, ev)?;
            report.pulled += 1;
        }
        match json["@odata.nextLink"].as_str() {
            Some(next) if !next.is_empty() => {
                path = next
                    .split_once("/v1.0/")
                    .map(|(_, rest)| rest.to_string())
                    .unwrap_or_else(|| next.to_string());
            }
            _ => break,
        }
    }
    Ok(())
}

pub fn run_outlook_sync(dir: &std::path::Path, db: &db::Db) -> SyncReport {
    let mut report = SyncReport {
        pushed: 0,
        pulled: 0,
        events_removed: 0,
        error: None,
    };
    let cfg = load_config(dir);
    if !cfg.is_connected() {
        report.error = Some("Not connected to Microsoft. Connect in Integrations first.".to_string());
        return report;
    }
    let conn = match db.lock() {
        Ok(c) => c,
        Err(e) => {
            report.error = Some(e.to_string());
            return report;
        }
    };
    if let Err(e) = push_assignments(&conn, dir, &mut report) {
        report.error = Some(e);
        return report;
    }
    if let Err(e) = remove_orphaned_links(&conn, dir, &mut report) {
        report.error = Some(e);
        return report;
    }
    if let Err(e) = pull_events(&conn, dir, &mut report) {
        report.error = Some(e);
        return report;
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ics_to_graph_dt_converts() {
        assert_eq!(ics_to_graph_dt("20260806T140000"), "2026-08-06T14:00:00");
        assert_eq!(ics_to_graph_dt("20260806"), "2026-08-06T00:00:00");
    }

    #[test]
    fn graph_local_time_truncates_fractional() {
        let v = json!({ "start": { "dateTime": "2026-08-06T14:30:45.1234567", "timeZone": "America/Chicago" } });
        assert_eq!(graph_local_time(&v, "start"), "2026-08-06T14:30");
    }

    #[test]
    fn is_our_event_detects_category() {
        let ours = json!({ "categories": ["Other", "School Hub"] });
        let theirs = json!({ "categories": ["Other"] });
        let none = json!({});
        assert!(is_our_event(&ours));
        assert!(!is_our_event(&theirs));
        assert!(!is_our_event(&none));
    }
}
