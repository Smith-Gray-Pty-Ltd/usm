import { Elysia } from "elysia";

const app = new Elysia();

app.get("/api/users", () => ({ users: [] }));
app.post("/api/users", () => ({ id: 1 }));
app.get("/api/users/:id", ({ params }) => ({ id: params.id }));
app.delete("/api/users/:id", ({ params }) => ({ deleted: params.id }));
app.get("/api/products", () => ({ products: [] }));

export default app;