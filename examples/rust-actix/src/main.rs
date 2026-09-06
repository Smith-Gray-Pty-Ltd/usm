use actix_web::{web, App, HttpServer, HttpResponse, Responder};

async fn get_users() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"users": []}))
}

async fn create_user() -> impl Responder {
    HttpResponse::Created().json(serde_json::json!({"id": 1}))
}

async fn get_user(path: web::Path<u32>) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"id": path.into_inner()}))
}

async fn delete_user(path: web::Path<u32>) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"deleted": path.into_inner()}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/api/users", web::get().to(get_users))
            .route("/api/users", web::post().to(create_user))
            .route("/api/users/{id}", web::get().to(get_user))
            .route("/api/users/{id}", web::delete().to(delete_user))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}