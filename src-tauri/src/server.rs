use axum::{
    extract::{Path, Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use axum::extract::DefaultBodyLimit;
use base64::Engine;
use serde_json::{json, Value};
use std::path::PathBuf;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};

use crate::db;

pub const PORT: u16 = 8787;

#[derive(Clone)]
pub struct AppState {
    pub db: db::Db,
    pub token: String,
}

fn api_error(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

async fn auth(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let supplied = header.strip_prefix("Bearer ").unwrap_or("");
    if supplied == state.token {
        next.run(req).await
    } else {
        api_error(
            StatusCode::UNAUTHORIZED,
            "Unauthorized. Pair this device using the token shown in the desktop app.",
        )
    }
}

async fn health() -> impl IntoResponse {
    Json(json!({ "status": "ok", "service": "school-hub", "version": "0.1.0" }))
}

async fn list(State(state): State<AppState>, Path(table): Path<String>) -> Response {
    if !db::valid_table(&table) {
        return api_error(StatusCode::NOT_FOUND, format!("unknown resource: {table}"));
    }
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    match db::list_all(&conn, &table) {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn create(
    State(state): State<AppState>,
    Path(table): Path<String>,
    Json(payload): Json<Value>,
) -> Response {
    if !db::valid_table(&table) {
        return api_error(StatusCode::NOT_FOUND, format!("unknown resource: {table}"));
    }
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    match db::insert(&conn, &table, &payload) {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
        Err(e) => api_error(StatusCode::BAD_REQUEST, e),
    }
}

async fn get_one(State(state): State<AppState>, Path((table, id)): Path<(String, i64)>) -> Response {
    if !db::valid_table(&table) {
        return api_error(StatusCode::NOT_FOUND, format!("unknown resource: {table}"));
    }
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    match db::get_one(&conn, &table, id) {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => api_error(StatusCode::NOT_FOUND, "not found"),
        Err(e) => api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

async fn update(
    State(state): State<AppState>,
    Path((table, id)): Path<(String, i64)>,
    Json(payload): Json<Value>,
) -> Response {
    if !db::valid_table(&table) {
        return api_error(StatusCode::NOT_FOUND, format!("unknown resource: {table}"));
    }
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    match db::update(&conn, &table, id, &payload) {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => api_error(StatusCode::NOT_FOUND, "not found"),
        Err(e) => api_error(StatusCode::BAD_REQUEST, e),
    }
}

async fn remove(State(state): State<AppState>, Path((table, id)): Path<(String, i64)>) -> Response {
    if !db::valid_table(&table) {
        return api_error(StatusCode::NOT_FOUND, format!("unknown resource: {table}"));
    }
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    match db::delete(&conn, &table, id) {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => api_error(StatusCode::NOT_FOUND, "not found"),
        Err(e) => api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

fn file_blob(conn: &rusqlite::Connection, id: i64) -> Result<(String, Vec<u8>), String> {
    let (mime, data): (String, String) = conn
        .query_row(
            "SELECT COALESCE(mime, 'application/octet-stream'), COALESCE(data, '') FROM files WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("failed to decode file data: {e}"))?;
    Ok((mime, bytes))
}

async fn file_raw(State(state): State<AppState>, Path(id): Path<i64>) -> Response {
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let (mime, bytes) = match file_blob(&conn, id) {
        Ok(x) => x,
        Err(e) => return api_error(StatusCode::NOT_FOUND, e),
    };
    drop(conn);
    let body = axum::body::Body::from(bytes);
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime)
        .header("Content-Disposition", "inline")
        .body(body)
        .unwrap()
}

async fn file_text(State(state): State<AppState>, Path(id): Path<i64>) -> Response {
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => return api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let (_, bytes) = match file_blob(&conn, id) {
        Ok(x) => x,
        Err(e) => return api_error(StatusCode::NOT_FOUND, e),
    };
    drop(conn);

    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(extract_readable_html(&bytes));
    });
    match rx.recv() {
        Ok(Ok(html)) => Json(json!({ "html": html })).into_response(),
        Ok(Err(e)) => api_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => api_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

fn extract_readable_html(bytes: &[u8]) -> Result<String, String> {
    let ext = if bytes.starts_with(b"PK") { "docx" } else { "rtf" };
    let dir = std::env::temp_dir().join("schoolhub-preview");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let input = dir.join(format!("input.{ext}"));
    std::fs::write(&input, bytes).map_err(|e| e.to_string())?;
    let out = std::process::Command::new("textutil")
        .arg("-convert")
        .arg("html")
        .arg("-stdout")
        .arg(&input)
        .output()
        .map_err(|e| format!("textutil failed to run: {e}"))?;
    let _ = std::fs::remove_file(&input);
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub fn api_router(state: AppState) -> Router {
    let api = Router::new()
        .route("/api/{table}", get(list).post(create))
        .route("/api/{table}/{id}", get(get_one).patch(update).delete(remove))
        .route("/api/files/{id}/raw", get(file_raw))
        .route("/api/files/{id}/text", get(file_text))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth))
        .with_state(state);

    Router::new()
        .route("/api/health", get(health))
        .merge(api)
}

pub async fn serve(db: db::Db, token: String, dist: PathBuf) {
    let state = AppState { db, token };

    let index = dist.join("index.html");
    let app = Router::new()
        .fallback_service(ServeDir::new(&dist).not_found_service(ServeFile::new(index)))
        .merge(api_router(state))
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    let listener = match tokio::net::TcpListener::bind(format!("0.0.0.0:{PORT}")).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[school-hub] failed to bind server on port {PORT}: {e}");
            return;
        }
    };
    eprintln!("[school-hub] local server listening on http://127.0.0.1:{PORT}");
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[school-hub] server error: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use std::sync::{Arc, Mutex};
    use tower::ServiceExt;

    fn test_app(token: &str) -> Router {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        {
            let _ = conn.pragma_update(None, "foreign_keys", "ON");
        }
        db::migrate(&conn).unwrap();
        let state = AppState {
            db: Arc::new(Mutex::new(conn)),
            token: token.to_string(),
        };
        api_router(state)
    }

    async fn send(
        app: &Router,
        method: &str,
        uri: &str,
        token: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder().method(method).uri(uri);
        builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
        let body = match body {
            Some(v) => {
                builder = builder.header("content-type", "application/json");
                Body::from(serde_json::to_vec(&v).unwrap())
            }
            None => Body::empty(),
        };
        let resp = app
            .clone()
            .oneshot(builder.body(body).unwrap())
            .await
            .unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), 2 * 1024 * 1024)
            .await
            .unwrap();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };
        (status, value)
    }

    #[tokio::test]
    async fn health_needs_no_auth() {
        let app = test_app("secret-token");
        let (status, body) = send(&app, "GET", "/api/health", "", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["service"], json!("school-hub"));
    }

    #[tokio::test]
    async fn api_requires_bearer_token() {
        let app = test_app("secret-token");
        let (status, body) = send(&app, "GET", "/api/courses", "", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(body["error"].as_str().unwrap().contains("Unauthorized"));

        let (status, _) = send(&app, "GET", "/api/courses", "wrong-token", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let (status, body) = send(&app, "GET", "/api/courses", "secret-token", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, json!([]));
    }

    #[tokio::test]
    async fn unknown_table_returns_404() {
        let app = test_app("secret-token");
        let (status, _) = send(&app, "GET", "/api/nope", "secret-token", None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn full_crud_cycle() {
        let app = test_app("secret-token");

        let (status, created) = send(
            &app,
            "POST",
            "/api/courses",
            "secret-token",
            Some(json!({ "name": "History 201", "term": "Fall 2026" })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let id = created["id"].as_i64().expect("created course has an id");

        let (status, rows) = send(&app, "GET", "/api/courses", "secret-token", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(rows.as_array().unwrap().len(), 1);
        assert_eq!(rows[0]["name"], json!("History 201"));

        let (status, updated) = send(
            &app,
            "PATCH",
            &format!("/api/courses/{id}"),
            "secret-token",
            Some(json!({ "teacher": "Prof. Brooks" })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(updated["teacher"], json!("Prof. Brooks"));

        let (status, one) = send(&app, "GET", &format!("/api/courses/{id}"), "secret-token", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(one["name"], json!("History 201"));

        let (status, _) = send(&app, "DELETE", &format!("/api/courses/{id}"), "secret-token", None).await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        let (status, _) = send(&app, "GET", &format!("/api/courses/{id}"), "secret-token", None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn malformed_json_rejected() {
        let app = test_app("secret-token");
        let req = Request::builder()
            .method("POST")
            .uri("/api/courses")
            .header(AUTHORIZATION, "Bearer secret-token")
            .header("content-type", "application/json")
            .body(Body::from("not json"))
            .unwrap();
        let resp = app.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn calendar_events_listable() {
        let app = test_app("secret-token");
        let (status, body) = send(&app, "GET", "/api/calendar_events", "secret-token", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, json!([]));
    }

    #[tokio::test]
    async fn file_raw_returns_decoded_bytes() {
        let app = test_app("secret-token");
        let payload = json!({
            "title": "notes",
            "filename": "notes.txt",
            "mime": "text/plain",
            "data": base64::engine::general_purpose::STANDARD.encode("hello world"),
        });
        let (status, created) = send(&app, "POST", "/api/files", "secret-token", Some(payload)).await;
        assert_eq!(status, StatusCode::CREATED);
        let id = created["id"].as_i64().expect("created file has id");

        let req = Request::builder()
            .method("GET")
            .uri(format!("/api/files/{id}/raw"))
            .header(AUTHORIZATION, "Bearer secret-token")
            .body(Body::empty())
            .unwrap();
        let resp = app.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        assert_eq!(&bytes[..], b"hello world");
    }
}
