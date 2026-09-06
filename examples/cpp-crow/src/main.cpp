#include "crow.h"

int main() {
    crow::SimpleApp app;

    CROW_ROUTE(app, "/api/users")([]() {
        return crow::json::wvalue({{"users", {}}});
    });

    CROW_ROUTE(app, "/api/users/<int>")([](int id) {
        crow::json::wvalue x;
        x["id"] = id;
        return x;
    });

    CROW_ROUTE(app, "/api/products")([]() {
        return crow::json::wvalue({{"products", {}}});
    });

    app.port(8080).run();
}