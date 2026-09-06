#include <drogon/drogon.h>

int main() {
    drogon::app().registerHandler(
        "/api/users",
        [](const drogon::HttpRequestPtr &req, std::function<void(const drogon::HttpResponsePtr &)> &&callback) {
            auto resp = drogon::HttpResponse::newHttpResponse();
            resp->setBody(R"({"users":[]})");
            resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
            callback(resp);
        },
        {drogon::Get}
    );

    drogon::app().registerHandler(
        "/api/users/{id}",
        [](const drogon::HttpRequestPtr &req, std::function<void(const drogon::HttpResponsePtr &)> &&callback) {
            auto resp = drogon::HttpResponse::newHttpResponse();
            resp->setBody(R"({"id":1})");
            resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
            callback(resp);
        },
        {drogon::Get}
    );

    drogon::app().registerHandler(
        "/api/products",
        [](const drogon::HttpRequestPtr &req, std::function<void(const drogon::HttpResponsePtr &)> &&callback) {
            auto resp = drogon::HttpResponse::newHttpResponse();
            resp->setBody(R"({"products":[]})");
            resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
            callback(resp);
        },
        {drogon::Get}
    );

    drogon::app().addListener("0.0.0.0", 8080);
    drogon::app().run();
}