import Vapor

func routes(_ app: Application) throws {
    app.get("api", "users") { req in
        return ["users": []]
    }

    app.post("api", "users") { req in
        return ["id": 1]
    }

    app.get("api", "users", ":id") { req in
        guard let id = req.parameters.get(":id") else { throw Abort(.badRequest) }
        return ["id": id]
    }

    app.delete("api", "users", ":id") { req in
        guard let id = req.parameters.get(":id") else { throw Abort(.badRequest) }
        return ["deleted": id]
    }
}