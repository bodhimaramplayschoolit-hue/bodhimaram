import express from "express";
const router = express.Router();
import db from './db.js'
import bcrypt from "bcryptjs";

// GET all staff (exclude admin)
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users
       WHERE role != 'admin'
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching staff:", err);
    res.status(500).json({ error: "Failed to fetch staff" });
  }
});

// POST add new staff
router.post("/", async (req, res) => {
  let { name, email, phone, password, role, status } = req.body;

  if (!name || !email || !phone || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Disallow creating admin from this route
  if (role === "admin") {
    return res.status(403).json({ error: "Cannot create admin via this page" });
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert staff into users table
    const [result] = await db.query(
      `INSERT INTO users (name, email, phone, password, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [name, email, phone, hashedPassword, role, status || "active"]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      email,
      phone,
      role,
      status: status || "active",
      created_at: new Date(),
    });
  } catch (err) {
    console.error("Error adding staff:", err);
    if (err.code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "Email or phone already exists" });
    } else {
      res.status(500).json({ error: "Failed to add staff" });
    }
  }
});

// ✅ PUT update staff details
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, password, role, status } = req.body;

  try {
    if (role === "admin") {
      return res.status(403).json({ error: "Cannot assign admin role via this route" });
    }

    const fields = [];
    const values = [];

    if (name) { fields.push("name = ?"); values.push(name); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (phone) { fields.push("phone = ?"); values.push(phone); }
    if (role) { fields.push("role = ?"); values.push(role); }
    if (status) { fields.push("status = ?"); values.push(status); }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push("password = ?");
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);

    const [result] = await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ message: "Staff updated successfully" });
  } catch (err) {
    console.error("Error updating staff:", err);
    res.status(500).json({ error: "Failed to update staff" });
  }
});

// ✅ DELETE staff
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      `DELETE FROM users WHERE id = ? AND role != 'admin'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Staff not found or cannot delete admin" });
    }

    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    console.error("Error deleting staff:", err);
    res.status(500).json({ error: "Failed to delete staff" });
  }
});
export default router;
