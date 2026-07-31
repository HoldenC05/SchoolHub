use rusqlite::{params, Connection};

use crate::caldav::{build_event_ics, due_to_ics, ics_range, CalDavClient};
use crate::db;
use crate::settings;

const WINDOW_BACK_DAYS: i64 = 90;
const WINDOW_FWD_DAYS: i64 = 365;

#[derive(Debug)]
pub struct SyncReport {
    pub pushed: usize,
    pub pulled: usize,
    pub events_removed: usize,
    pub error: Option<String>,
}

impl SyncReport {
    fn ok() -> Self {
        SyncReport {
            pushed: 0,
            pulled: 0,
            events_removed: 0,
            error: None,
        }
    }
}

fn event_href(calendar_href: &str, uid: &str) -> String {
    format!("{}/{}.ics", calendar_href.trim_end_matches('/'), uid)
}

fn get_link(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT remote_href FROM calendar_links \
             WHERE entity_type = ?1 AND entity_id = ?2",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![entity_type, entity_id]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => {
            let href: String = row.get(0).map_err(|e| e.to_string())?;
            Ok(Some(href))
        }
        None => Ok(None),
    }
}

fn upsert_link(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
    uid: &str,
    remote_href: &str,
    calendar_href: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO calendar_links (entity_type, entity_id, remote_uid, remote_href, calendar_href) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET \
           remote_uid = excluded.remote_uid, \
           remote_href = excluded.remote_href, \
           calendar_href = excluded.calendar_href, \
           updated_at = datetime('now')",
        params![entity_type, entity_id, uid, remote_href, calendar_href],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_link(conn: &Connection, entity_type: &str, entity_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM calendar_links WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn push_assignments(
    conn: &Connection,
    client: &CalDavClient,
    calendar_href: &str,
    report: &mut SyncReport,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, title, due_at, notes FROM assignments")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, Option<String>, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for (id, title, due, notes) in rows {
        let uid = format!("assignment-{id}");
        if let Some(due) = due {
            if let Some((start, end, all_day)) = due_to_ics(&due) {
                let ics = build_event_ics(&uid, &title, &notes, &start, &end, all_day);
                client.put_event(calendar_href, &uid, &ics)?;
                upsert_link(conn, "assignment", id, &uid, &event_href(calendar_href, &uid), calendar_href)?;
                report.pushed += 1;
                continue;
            }
        }
        if let Some(href) = get_link(conn, "assignment", id)? {
            client.delete_event(&href)?;
            remove_link(conn, "assignment", id)?;
            report.events_removed += 1;
        }
    }
    Ok(())
}

fn remove_orphaned_links(
    conn: &Connection,
    client: &CalDavClient,
    report: &mut SyncReport,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, remote_href FROM calendar_links \
             WHERE entity_type = 'assignment' AND entity_id NOT IN (SELECT id FROM assignments)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    for (id, href) in rows {
        client.delete_event(&href)?;
        conn.execute("DELETE FROM calendar_links WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        report.events_removed += 1;
    }
    Ok(())
}

fn upsert_cal_event(conn: &Connection, ev: &crate::caldav::IcsEvent) -> Result<(), String> {
    conn.execute(
        "INSERT INTO calendar_events (remote_uid, summary, starts_at, ends_at, location, source) \
         VALUES (?1, ?2, ?3, ?4, ?5, 'caldav') \
         ON CONFLICT(remote_uid) DO UPDATE SET \
           summary = excluded.summary, \
           starts_at = excluded.starts_at, \
           ends_at = excluded.ends_at, \
           location = excluded.location, \
           updated_at = datetime('now')",
        params![ev.uid, ev.summary, ev.starts_at, ev.ends_at, ev.location],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn pull_events(
    conn: &Connection,
    client: &CalDavClient,
    calendar_href: &str,
    report: &mut SyncReport,
) -> Result<(), String> {
    let (start, end) = ics_range(WINDOW_BACK_DAYS, WINDOW_FWD_DAYS);
    let events = client.fetch_events(calendar_href, &start, &end)?;
    for ev in events {
        if ev.uid.starts_with("assignment-") {
            continue;
        }
        upsert_cal_event(conn, &ev)?;
        report.pulled += 1;
    }
    Ok(())
}

pub fn run_sync(dir: &std::path::Path, db: &db::Db) -> SyncReport {
    let mut report = SyncReport::ok();
    let config = settings::load(dir);
    if !config.enabled || config.calendar_href.is_empty() {
        report.error = Some("Apple Calendar is not connected".into());
        return report;
    }
    let password = match settings::get_app_password(dir) {
        Some(p) => p,
        None => {
            report.error = Some("App-specific password not found in Keychain".into());
            return report;
        }
    };
    let client = match CalDavClient::new(&config.email, &password) {
        Ok(c) => c,
        Err(e) => {
            report.error = Some(format!("failed to create CalDAV client: {e}"));
            return report;
        }
    };
    let conn = match db.lock() {
        Ok(c) => c,
        Err(e) => {
            report.error = Some(e.to_string());
            return report;
        }
    };
    if let Err(e) = push_assignments(&conn, &client, &config.calendar_href, &mut report) {
        report.error = Some(e);
        return report;
    }
    if let Err(e) = remove_orphaned_links(&conn, &client, &mut report) {
        report.error = Some(e);
        return report;
    }
    if let Err(e) = pull_events(&conn, &client, &config.calendar_href, &mut report) {
        report.error = Some(e);
        return report;
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_href_has_slash_between_calendar_and_uid() {
        assert_eq!(event_href("/cal/ABC/", "assignment-1"), "/cal/ABC/assignment-1.ics");
        assert_eq!(event_href("/cal/ABC", "assignment-1"), "/cal/ABC/assignment-1.ics");
    }
}
