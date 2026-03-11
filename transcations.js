import { Router } from "express";
const router = Router();
import db from "./db.js";

// ✅ Get all transactions for a group
router.get("/:groupCode", async (req, res) => {
  try {
    const { groupCode } = req.params;
    const [rows] = await db.query(
      "SELECT * FROM transactions WHERE group_code = ? ORDER BY created_at DESC",
      [groupCode]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ Add a transaction (cash or online)
router.post("/", async (req, res) => {
  try {
    const { group_code, student_id, student_name, amount, payment_mode, status, razorpay_payment_id, notes } = req.body;

    if (!group_code || !student_name || !amount || !payment_mode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [result] = await db.query(
      `INSERT INTO transactions
      (group_code, student_id, student_name, amount, payment_mode, status, razorpay_payment_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [group_code, student_id, student_name, amount, payment_mode, status || 'Paid', razorpay_payment_id || null, notes || null]
    );

    res.status(201).json({ id: result.insertId, message: "Transaction added successfully" });
  } catch (err) {
    console.error("Error adding transaction:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ Update transaction (status, notes, amount)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const [result] = await db.query("UPDATE transactions SET ? WHERE id = ?", [data, id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: "Transaction not found" });

    res.json({ message: "Transaction updated successfully" });
  } catch (err) {
    console.error("Error updating transaction:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ Delete transaction
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM transactions WHERE id = ?", [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: "Transaction not found" });

    res.json({ message: "Transaction deleted successfully" });
  } catch (err) {
    console.error("Error deleting transaction:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
