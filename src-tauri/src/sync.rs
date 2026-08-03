use rusqlite::{params, params_from_iter, Connection};

use crate::caldav::{build_event_ics, due_to_ics, ics_range, CalDavClient};
use crate::db;
use crate::settings;

const WINDOW_BACK_DAYS: i64 = 7500;
const WINDOW_FWD_DAYS: i64 = 7500;

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
    calendar_href: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT remote_href FROM calendar_links \
             WHERE entity_type = ?1 AND entity_id = ?2 AND calendar_href = ?3",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![entity_type, entity_id, calendar_href])
        .map_err(|e| e.to_string())?;
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
         ON CONFLICT(entity_type, entity_id, calendar_href) DO UPDATE SET \
           remote_uid = excluded.remote_uid, \
           remote_href = excluded.remote_href, \
           updated_at = datetime('now')",
        params![entity_type, entity_id, uid, remote_href, calendar_href],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_link(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
    calendar_href: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM calendar_links WHERE entity_type = ?1 AND entity_id = ?2 AND calendar_href = ?3",
        params![entity_type, entity_id, calendar_href],
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
                let ics = build_event_ics(&uid, &title, &notes, &start, &end, all_day, None, &[]);
                client.put_event(calendar_href, &uid, &ics)?;
                upsert_link(
                    conn,
                    "assignment",
                    id,
                    &uid,
                    &event_href(calendar_href, &uid),
                    calendar_href,
                )?;
                report.pushed += 1;
                continue;
            }
        }
        if let Some(href) = get_link(conn, "assignment", id, calendar_href)? {
            client.delete_event(&href)?;
            remove_link(conn, "assignment", id, calendar_href)?;
            report.events_removed += 1;
        }
    }
    Ok(())
}

fn remove_orphaned_links(
    conn: &Connection,
    client: &CalDavClient,
    calendar_href: &str,
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
        .query_map(params![calendar_href], |row| Ok((row.get(0)?, row.get(1)?)))
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

fn upsert_cal_event(
    conn: &Connection,
    ev: &crate::caldav::IcsEvent,
    calendar_href: &str,
) -> Result<(), String> {
    let rid = ev.recurrence_id.clone().unwrap_or_default();
    let exdates = ev.exdates.join(",");
    let changed = conn
        .execute(
            "UPDATE calendar_events SET \
               summary = ?1, starts_at = ?2, ends_at = ?3, location = ?4, \
               description = ?5, rrule = ?6, exdates = ?7, remote_href = ?11, \
               calendar_href = ?8, source = 'caldav', updated_at = datetime('now') \
             WHERE remote_uid = ?9 AND calendar_href = ?8 AND recurrence_id = ?10",
            params![
                ev.summary,
                ev.starts_at,
                ev.ends_at,
                ev.location,
                ev.description,
                ev.rrule,
                exdates,
                calendar_href,
                ev.uid,
                rid,
                ev.href
            ],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        conn.execute(
            "INSERT INTO calendar_events (remote_uid, summary, starts_at, ends_at, location, description, source, calendar_href, remote_href, rrule, recurrence_id, exdates) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'caldav', ?7, ?11, ?8, ?9, ?10)",
            params![
                ev.uid,
                ev.summary,
                ev.starts_at,
                ev.ends_at,
                ev.location,
                ev.description,
                calendar_href,
                ev.rrule,
                rid,
                exdates,
                ev.href
            ],
        )
        .map_err(|e| e.to_string())?;
    }
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
        upsert_cal_event(conn, &ev, calendar_href)?;
        report.pulled += 1;
    }
    Ok(())
}

fn clean_deselected(
    conn: &Connection,
    calendars: &[settings::CalendarSel],
) -> Result<(), String> {
    let hrefs: Vec<&str> = calendars.iter().map(|c| c.href.as_str()).collect();
    if hrefs.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; hrefs.len()].join(",");
    conn.execute(
        &format!(
            "DELETE FROM calendar_events WHERE calendar_href IS NOT NULL AND calendar_href NOT IN ({placeholders})"
        ),
        params_from_iter(hrefs.iter().copied()),
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        &format!("DELETE FROM calendar_links WHERE calendar_href NOT IN ({placeholders})"),
        params_from_iter(hrefs.iter().copied()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_sync(dir: &std::path::Path, db: &db::Db) -> SyncReport {
    let mut report = SyncReport::ok();
    let config = settings::load(dir);
    if !config.is_connected() {
        report.error = Some("No calendars selected. Connect Apple Calendar first.".into());
        return report;
    }
    let password = match settings::get_app_password(dir) {
        Some(p) => p,
        None => {
            report.error = Some("App-specific password not found — reconnect in Integrations".into());
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

    if let Some(push) = &config.push_calendar {
        let label = if push.name.is_empty() { push.href.clone() } else { push.name.clone() };
        if let Err(e) = push_assignments(&conn, &client, &push.href, &mut report) {
            report.error = Some(format!("[{label}] {e}"));
            return report;
        }
        if let Err(e) = remove_orphaned_links(&conn, &client, &push.href, &mut report) {
            report.error = Some(format!("[{label}] {e}"));
            return report;
        }
    }

    let mut pull_errors: Vec<String> = Vec::new();
    for cal in &config.calendars {
        let label = if cal.name.is_empty() { cal.href.clone() } else { cal.name.clone() };
        if let Err(e) = pull_events(&conn, &client, &cal.href, &mut report) {
            pull_errors.push(format!("[{label}] {e}"));
        }
    }

    if let Err(e) = clean_deselected(&conn, &config.calendars) {
        report.error = Some(e);
        return report;
    }
    if !pull_errors.is_empty() {
        report.error = Some(pull_errors.join("; "));
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

    #[test]
    fn links_are_unique_per_calendar() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        upsert_link(&conn, "assignment", 1, "assignment-1", "/cal/a/assignment-1.ics", "/cal/a/").unwrap();
        upsert_link(&conn, "assignment", 1, "assignment-1", "/cal/b/assignment-1.ics", "/cal/b/").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM calendar_links", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
        assert_eq!(
            get_link(&conn, "assignment", 1, "/cal/a/").unwrap().as_deref(),
            Some("/cal/a/assignment-1.ics")
        );
        remove_link(&conn, "assignment", 1, "/cal/a/").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM calendar_links", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn cal_event_upsert_updates_same_calendar() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        let ev = crate::caldav::IcsEvent {
            uid: "uid-1".into(),
            summary: Some("Old".into()),
            starts_at: None,
            ends_at: None,
            location: None,
            description: None,
            status: None,
            rrule: None,
            recurrence_id: None,
            exdates: Vec::new(),
            href: None,
        };
        upsert_cal_event(&conn, &ev, "/cal/a/").unwrap();
        let ev2 = crate::caldav::IcsEvent {
            summary: Some("New".into()),
            ..ev
        };
        upsert_cal_event(&conn, &ev2, "/cal/a/").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM calendar_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let summary: String = conn
            .query_row("SELECT summary FROM calendar_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(summary, "New");
    }
}
