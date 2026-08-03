use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};
use serde_json::Value as Json;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub type Db = Arc<Mutex<Connection>>;

const MIGRATIONS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        term TEXT,
        color TEXT,
        teacher TEXT,
        schedule_json TEXT,
        blackboard_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        color TEXT,
        icon TEXT,
        contact TEXT,
        schedule_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'homework',
        due_at TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        grade TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        starts_at TEXT,
        ends_at TEXT,
        agenda TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        deadline TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT,
        entity_id INTEGER,
        title TEXT NOT NULL,
        body_md TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL UNIQUE,
        last_synced_at TEXT,
        state_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE IF NOT EXISTS calendar_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        remote_uid TEXT NOT NULL,
        remote_href TEXT NOT NULL,
        calendar_href TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(entity_type, entity_id)
    );",
    "CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_uid TEXT NOT NULL UNIQUE,
        summary TEXT,
        starts_at TEXT,
        ends_at TEXT,
        location TEXT,
        source TEXT NOT NULL DEFAULT 'caldav',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
    "CREATE TABLE calendar_links_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        remote_uid TEXT NOT NULL,
        remote_href TEXT NOT NULL,
        calendar_href TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(entity_type, entity_id, calendar_href)
    );
    INSERT INTO calendar_links_v2 (entity_type, entity_id, remote_uid, remote_href, calendar_href, created_at, updated_at)
        SELECT entity_type, entity_id, remote_uid, remote_href, calendar_href, created_at, updated_at FROM calendar_links;
    DROP TABLE calendar_links;
    ALTER TABLE calendar_links_v2 RENAME TO calendar_links;",
    "CREATE TABLE calendar_events_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_uid TEXT NOT NULL,
        summary TEXT,
        starts_at TEXT,
        ends_at TEXT,
        location TEXT,
        source TEXT NOT NULL DEFAULT 'caldav',
        calendar_href TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(remote_uid, calendar_href)
    );
    INSERT INTO calendar_events_v2 (id, remote_uid, summary, starts_at, ends_at, location, source, created_at, updated_at)
        SELECT id, remote_uid, summary, starts_at, ends_at, location, source, created_at, updated_at FROM calendar_events;
    DROP TABLE calendar_events;
    ALTER TABLE calendar_events_v2 RENAME TO calendar_events;",
    "CREATE TABLE calendar_events_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_uid TEXT NOT NULL,
        summary TEXT,
        starts_at TEXT,
        ends_at TEXT,
        location TEXT,
        description TEXT,
        source TEXT NOT NULL DEFAULT 'caldav',
        calendar_href TEXT,
        remote_href TEXT,
        rrule TEXT,
        recurrence_id TEXT NOT NULL DEFAULT '',
        exdates TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(remote_uid, calendar_href, recurrence_id)
    );
    INSERT INTO calendar_events_v3 (id, remote_uid, summary, starts_at, ends_at, location, description, source, calendar_href, remote_href, rrule, recurrence_id, exdates, created_at, updated_at)
        SELECT id, remote_uid, summary, starts_at, ends_at, location, NULL, source, calendar_href, NULL, NULL, '', NULL, created_at, updated_at FROM calendar_events;
    DROP TABLE calendar_events;
    ALTER TABLE calendar_events_v3 RENAME TO calendar_events;",
    "ALTER TABLE meetings ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE;",
    "CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        filename TEXT,
        mime TEXT,
        size INTEGER,
        data TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
];

pub fn init(path: &Path) -> rusqlite::Result<Db> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "foreign_keys", "ON");
    migrate(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

pub(crate) fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;
    let applied: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM _migrations",
        [],
        |row| row.get(0),
    )?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > applied {
            conn.execute_batch(sql)?;
            conn.execute("INSERT INTO _migrations (version) VALUES (?1)", [version])?;
        }
    }
    Ok(())
}

pub const TABLES: &[(&str, &[&str])] = &[
    (
        "courses",
        &[
            "name",
            "term",
            "color",
            "teacher",
            "schedule_json",
            "blackboard_url",
        ],
    ),
    (
        "activities",
        &["name", "category", "color", "icon", "contact", "schedule_json"],
    ),
    (
        "assignments",
        &[
            "course_id",
            "activity_id",
            "title",
            "kind",
            "due_at",
            "status",
            "grade",
            "notes",
        ],
    ),
    (
        "meetings",
        &["activity_id", "course_id", "title", "starts_at", "ends_at", "agenda", "notes"],
    ),
    (
        "projects",
        &["activity_id", "course_id", "title", "status", "deadline", "notes"],
    ),
    (
        "notes",
        &["entity_type", "entity_id", "title", "body_md"],
    ),
    (
        "files",
        &["course_id", "title", "filename", "mime", "size", "data", "notes"],
    ),
    ("ideas", &["title", "body", "done"]),
    ("tags", &["name"]),
    ("calendar_events", &[]),
];

pub fn table_columns(table: &str) -> Option<&'static [&'static str]> {
    TABLES.iter().find(|(name, _)| *name == table).map(|(_, cols)| *cols)
}

pub fn valid_table(table: &str) -> bool {
    table_columns(table).is_some()
}

pub fn json_to_sql(value: &Json) -> SqlValue {
    match value {
        Json::Null => SqlValue::Null,
        Json::Bool(b) => SqlValue::Integer(*b as i64),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                SqlValue::Null
            }
        }
        Json::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

pub fn sql_to_json(value: SqlValue) -> Json {
    match value {
        SqlValue::Null => Json::Null,
        SqlValue::Integer(i) => Json::from(i),
        SqlValue::Real(f) => Json::from(f),
        SqlValue::Text(s) => Json::from(s),
        SqlValue::Blob(b) => Json::from(b.len()),
    }
}

pub fn list_all(conn: &Connection, table: &str) -> rusqlite::Result<Vec<Json>> {
    let sql = format!("SELECT * FROM {table} ORDER BY id");
    let mut stmt = conn.prepare(&sql)?;
    let cols: Vec<String> = (0..stmt.column_count())
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = serde_json::Map::new();
        for (i, name) in cols.iter().enumerate() {
            let v = row.get::<usize, SqlValue>(i)?;
            obj.insert(name.clone(), sql_to_json(v));
        }
        out.push(Json::Object(obj));
    }
    Ok(out)
}

pub fn get_one(conn: &Connection, table: &str, id: i64) -> rusqlite::Result<Option<Json>> {
    let sql = format!("SELECT * FROM {table} WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let cols: Vec<String> = (0..stmt.column_count())
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        let mut obj = serde_json::Map::new();
        for (i, name) in cols.iter().enumerate() {
            let v = row.get::<usize, SqlValue>(i)?;
            obj.insert(name.clone(), sql_to_json(v));
        }
        Ok(Some(Json::Object(obj)))
    } else {
        Ok(None)
    }
}

fn extract_fields(payload: &Json, allowed: &[&str]) -> (Vec<String>, Vec<SqlValue>) {
    let mut columns = Vec::new();
    let mut values = Vec::new();
    if let Some(obj) = payload.as_object() {
        for key in allowed {
            if let Some(v) = obj.get(*key) {
                columns.push((*key).to_string());
                values.push(json_to_sql(v));
            }
        }
    }
    (columns, values)
}

pub fn insert(conn: &Connection, table: &str, payload: &Json) -> Result<Json, String> {
    let allowed = table_columns(table).ok_or_else(|| format!("unknown table: {table}"))?;
    let (columns, values) = extract_fields(payload, allowed);
    if columns.is_empty() {
        return Err("no valid fields provided".into());
    }
    let placeholders = vec!["?"; columns.len()].join(",");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({}) RETURNING id",
        columns.join(","),
        placeholders
    );
    let id: i64 = conn
        .query_row(&sql, params_from_iter(values.iter()), |row| row.get(0))
        .map_err(|e| e.to_string())?;
    get_one(conn, table, id).map(|r| r.unwrap_or(Json::Null)).map_err(|e| e.to_string())
}

pub fn update(
    conn: &Connection,
    table: &str,
    id: i64,
    payload: &Json,
) -> Result<Option<Json>, String> {
    let allowed = table_columns(table).ok_or_else(|| format!("unknown table: {table}"))?;
    let (columns, values) = extract_fields(payload, allowed);
    if columns.is_empty() {
        return Ok(get_one(conn, table, id).map_err(|e| e.to_string())?);
    }
    let mut sets: Vec<String> = Vec::new();
    for c in &columns {
        sets.push(format!("{c} = ?"));
    }
    sets.push("updated_at = datetime('now')".into());
    let sql = format!("UPDATE {table} SET {} WHERE id = ?{}", sets.join(","), values.len() + 1);
    let mut params: Vec<SqlValue> = values;
    params.push(SqlValue::Integer(id));
    let changed = conn.execute(&sql, params_from_iter(params.iter())).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Ok(None);
    }
    get_one(conn, table, id).map_err(|e| e.to_string())
}

pub fn delete(conn: &Connection, table: &str, id: i64) -> Result<bool, String> {
    if !valid_table(table) {
        return Err(format!("unknown table: {table}"));
    }
    let sql = format!("DELETE FROM {table} WHERE id = ?1");
    let changed = conn.execute(&sql, [id]).map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrations_create_all_tables() {
        let conn = test_conn();
        let expected = [
            "courses",
            "activities",
            "assignments",
            "meetings",
            "projects",
            "notes",
            "ideas",
            "tags",
            "sync_state",
            "calendar_links",
            "calendar_events",
            "files",
        ];
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        for t in expected {
            assert!(tables.iter().any(|x| x == t), "missing table {t}");
        }
    }

    #[test]
    fn crud_round_trip() {
        let conn = test_conn();
        let created = insert(
            &conn,
            "courses",
            &json!({ "name": "Biology 101", "term": "Fall 2026", "teacher": "Dr. Eames" }),
        )
        .unwrap();
        let id = created["id"].as_i64().unwrap();

        let fetched = get_one(&conn, "courses", id).unwrap().unwrap();
        assert_eq!(fetched["name"], json!("Biology 101"));
        assert_eq!(fetched["teacher"], json!("Dr. Eames"));

        let updated = update(&conn, "courses", id, &json!({ "teacher": "Dr. Renner" }))
            .unwrap()
            .unwrap();
        assert_eq!(updated["teacher"], json!("Dr. Renner"));
        assert_eq!(updated["name"], json!("Biology 101"));

        let rows = list_all(&conn, "courses").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"].as_i64(), Some(id));

        assert!(delete(&conn, "courses", id).unwrap());
        assert!(get_one(&conn, "courses", id).unwrap().is_none());
    }

    #[test]
    fn insert_rejects_unknown_fields() {
        let conn = test_conn();
        let err = insert(&conn, "courses", &json!({ "bogus": 1 })).unwrap_err();
        assert!(err.contains("no valid fields"), "unexpected error: {err}");
    }

    #[test]
    fn update_missing_id_returns_none() {
        let conn = test_conn();
        assert!(update(&conn, "courses", 999, &json!({ "name": "x" })).unwrap().is_none());
    }

    #[test]
    fn delete_missing_returns_false() {
        let conn = test_conn();
        assert!(!delete(&conn, "courses", 999).unwrap());
    }

    #[test]
    fn cascade_deletes_assignments() {
        let conn = test_conn();
        let course = insert(&conn, "courses", &json!({ "name": "Calc" })).unwrap();
        let course_id = course["id"].as_i64().unwrap();
        insert(
            &conn,
            "assignments",
            &json!({ "course_id": course_id, "title": "Problem set 1" }),
        )
        .unwrap();
        assert_eq!(list_all(&conn, "assignments").unwrap().len(), 1);

        delete(&conn, "courses", course_id).unwrap();
        assert_eq!(list_all(&conn, "assignments").unwrap().len(), 0);
    }

    #[test]
    fn json_sql_round_trip() {
        assert_eq!(sql_to_json(json_to_sql(&json!(null))), json!(null));
        assert_eq!(sql_to_json(json_to_sql(&json!(true))), json!(1));
        assert_eq!(sql_to_json(json_to_sql(&json!(42))), json!(42));
        assert_eq!(sql_to_json(json_to_sql(&json!("hi"))), json!("hi"));
    }

    #[test]
    fn calendar_links_upsert_deduplicates() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO calendar_links (entity_type, entity_id, remote_uid, remote_href, calendar_href) \
             VALUES ('assignment', 1, 'assignment-1', '/cal/assignment-1.ics', '/cal/')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO calendar_links (entity_type, entity_id, remote_uid, remote_href, calendar_href) \
             VALUES ('assignment', 1, 'assignment-1', '/cal/assignment-1.ics', '/cal/') \
             ON CONFLICT(entity_type, entity_id, calendar_href) DO UPDATE SET remote_uid = excluded.remote_uid",
            [],
        )
        .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM calendar_links", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
