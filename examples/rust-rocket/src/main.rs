use rocket::get;
use rocket::post;
use rocket::delete;

#[get("/api/users")]
fn get_users() -> String {
    r#"{"users":[]}"#.to_string()
}

#[post("/api/users")]
fn create_user() -> String {
    r#"{"id":1}"#.to_string()
}

#[get("/api/users/<id>")]
fn get_user(id: u32) -> String {
    format!(r#"{{"id":{}}}"#, id)
}

#[delete("/api/users/<id>")]
fn delete_user(id: u32) -> String {
    format!(r#"{{"deleted":{}}}"#, id)
}

#[rocket::launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", rocket::routes![get_users, create_user, get_user, delete_user])
}