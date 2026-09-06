use axum::{routing::get, routing::post, routing::put, routing::delete, Router, extract::Path, Json};
use serde_json::json;

async fn get_users() -> Json<serde_json::Value> {
    Json(json!({ "users": [] }))
}

async fn create_user() -> Json<serde_json::Value> {
    Json(json!({ "id": 1 }))
}

async fn get_user(Path(id): Path<u32>) -> Json<serde_json::Value> {
    Json(json!({ "id": id }))
}

async fn delete_user(Path(id): Path<u32>) -> Json<serde_json::Value> {
    Json(json!({ "deleted": id }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/api/users", get(get_users).post(create_user))
        .route("/api/users/:id", get(get_user).delete(delete_user));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}