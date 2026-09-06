package com.example

import io.javalin.Javalin

fun main() {
    val app = Javalin.create()

    app.get("/api/users") { ctx -> ctx.json(mapOf("users" to emptyList<String>())) }
    app.post("/api/users") { ctx -> ctx.status(201).json(mapOf("id" to 1)) }
    app.get("/api/users/{id}") { ctx -> ctx.json(mapOf("id" to ctx.pathParam("id"))) }
    app.delete("/api/users/{id}") { ctx -> ctx.json(mapOf("deleted" to ctx.pathParam("id"))) }
    app.get("/api/products") { ctx -> ctx.json(mapOf("products" to emptyList<String>())) }

    app.start(8080)
}