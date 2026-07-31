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

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
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
        &["activity_id", "title", "starts_at", "ends_at", "agenda", "notes"],
    ),
    (
        "projects",
        &["activity_id", "course_id", "title", "status", "deadline", "notes"],
    ),
    (
        "notes",
        &["entity_type", "entity_id", "title", "body_md"],
    ),
    ("ideas", &["title", "body", "done"]),
    ("tags", &["name"]),
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
