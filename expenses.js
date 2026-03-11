import express from "express";
const router = express.Router();
import db from "./db.js";

// CREATE
router.post("/expenses", async (req, res) => {
  try {
    const { date, category, amount, description } = req.body;

    const sql = `
      INSERT INTO expenses (date, category, amount, description)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [date, category, amount, description]);

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("Insert Error:", err);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// READ
router.get("/expenses", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM expenses ORDER BY date DESC");
    res.json(rows);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// UPDATE
router.put("/expenses/:id", async (req, res) => {
  try {
    const { date, category, amount, description } = req.body;

    const sql = `
      UPDATE expenses 
      SET date=?, category=?, amount=?, description=?
      WHERE id=?
    `;

    await db.query(sql, [date, category, amount, description, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// DELETE
router.delete("/expenses/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM expenses WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// REPORT FILTER
router.get("/expenses/report", async (req, res) => {
  try {
    const { search, fromDate, toDate } = req.query;

    let sql = "SELECT * FROM expenses WHERE 1=1";
    let params = [];

    if (search) {
      sql += " AND (category LIKE ? OR description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (fromDate) {
      sql += " AND date >= ?";
      params.push(fromDate);
    }

    if (toDate) {
      sql += " AND date <= ?";
      params.push(toDate);
    }

    sql += " ORDER BY date DESC";

    const [rows] = await db.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("Report Error:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

export default router;

