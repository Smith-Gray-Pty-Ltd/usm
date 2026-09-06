import { Hono } from "hono";

const app = new Hono();

app.get("/api/users", (c) => c.json({ users: [] }));
app.post("/api/users", (c) => c.json({ id: 1 }, 201));
app.get("/api/users/:id", (c) => c.json({ id: c.req.param("id") }));
app.delete("/api/users/:id", (c) => c.json({ deleted: c.req.param("id") }));
app.get("/api/products", (c) => c.json({ products: [] }));
app.post("/api/products", (c) => c.json({ id: 1 }, 201));

export default app;