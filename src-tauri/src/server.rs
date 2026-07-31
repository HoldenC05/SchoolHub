use axum::{
    extract::{Path, Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
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

pub async fn serve(db: db::Db, token: String, dist: PathBuf) {
    let state = AppState { db, token };

    let api = Router::new()
        .route("/api/{table}", get(list).post(create))
        .route("/api/{table}/{id}", get(get_one).patch(update).delete(remove))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth))
        .with_state(state);

    let index = dist.join("index.html");
    let app = Router::new()
        .route("/api/health", get(health))
        .fallback_service(ServeDir::new(&dist).not_found_service(ServeFile::new(index)))
        .merge(api)
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
