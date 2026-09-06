import { Router } from "express";

const router = Router();

router.get("/api/products", (req, res) => {
  res.json({ products: [] });
});

router.post("/api/products", (req, res) => {
  res.status(201).json({ id: 1 });
});

router.get("/api/products/:id", (req, res) => {
  res.json({ id: req.params.id });
});

export default router;