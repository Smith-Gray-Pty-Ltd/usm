import { Router } from "express";

const router = Router();

router.get("/api/users", (req, res) => {
  res.json({ users: [] });
});

router.post("/api/users", (req, res) => {
  res.status(201).json({ id: 1 });
});

router.get("/api/users/:id", (req, res) => {
  res.json({ id: req.params.id });
});

router.put("/api/users/:id", (req, res) => {
  res.json({ id: req.params.id, updated: true });
});

router.delete("/api/users/:id", (req, res) => {
  res.json({ deleted: req.params.id });
});

export default router;