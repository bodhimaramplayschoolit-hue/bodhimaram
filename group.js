import { Router } from "express";
import db from "./db.js"; 
const router = Router();
import multer, { diskStorage } from "multer";
import { extname } from "path";

// Setup storage for group icons
const storage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/groups"); // save inside /uploads/groups
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + extname(file.originalname)); // unique filename
  },
});

const upload = multer({ storage });

async function getGroupByCode(group_code) {
  const [rows] = await db.query(
    "SELECT * FROM class_groups WHERE group_code = ? LIMIT 1",
    [group_code]
  );
  return rows[0] || null;
}

async function sendUpdatedGroup(res, group_code) {
  const row = await getGroupByCode(group_code);
  if (!row) return res.status(404).json({ error: "Group not found" });
  return res.json(row);
}

// POST /groups → create new group with optional image
router.post("/groups", upload.single("icon"), async (req, res) => {
  const { name, assigned_fees, status, time_option } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  const icon = req.file ? `/uploads/groups/${req.file.filename}` : null;

  try {
    const sql = `
      INSERT INTO class_groups (name, assigned_fees, status, time_option, icon)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(sql, [
      name,
      assigned_fees || 0,
      status || "active",
      time_option || null,
      icon,
    ]);

    const groupCode = `group${result.insertId}`;

    await db.query("UPDATE class_groups SET group_code = ? WHERE id = ?", [
      groupCode,
      result.insertId,
    ]);

    res.status(201).json({
      message: "Group created successfully",
      group: {
        id: result.insertId,
        group_code: groupCode,
        name,
        assigned_fees: assigned_fees || 0,
        status: status || "active",
        time_option: time_option || null,
        icon,
      },
    });
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json({ error: "Database error" });
  }
});


router.get("/groups", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM class_groups ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET single group by group_code
router.get("/groups/:groupid", async (req, res) => {
  const { groupid } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT * FROM class_groups WHERE group_code = ?",
      [groupid]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Group not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching group:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Toggle group status
router.put("/groups/:groupid/status", async (req, res) => {
  const { groupid } = req.params;
  const { status } = req.body;

  try {
    const [result] = await db.query("UPDATE class_groups SET status = ? WHERE id = ?", [
      status,
      groupid,
    ]);

    if (result.affectedRows === 0) return res.status(404).json({ error: "Group not found" });

    const [rows] = await db.query("SELECT * FROM class_groups WHERE id = ?", [groupid]);
    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Update group
router.put("/groups/:groupid", upload.single("icon"), async (req, res) => {
  const { groupid } = req.params;
  const { name, assigned_fees, time_option, status } = req.body;

  try {
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (assigned_fees !== undefined) {
      updates.push("assigned_fees = ?");
      values.push(assigned_fees);
    }
    if (time_option !== undefined) {
      updates.push("time_option = ?");
      values.push(time_option);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      values.push(status);
    }
    if (req.file) {
      updates.push("icon = ?");
      values.push(`/uploads/groups/${req.file.filename}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(groupid);

    const sql = `UPDATE class_groups SET ${updates.join(", ")} WHERE id = ?`;
    const [result] = await db.query(sql, values);

    if (result.affectedRows === 0) return res.status(404).json({ error: "Group not found" });

    return sendUpdatedGroup(res, `group${groupid}`);
  } catch (err) {
    console.error("Error updating group:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Delete group
router.delete("/groups/:groupid", async (req, res) => {
  const { groupid } = req.params;
  try {
    const [result] = await db.query("DELETE FROM class_groups WHERE group_code = ?", [groupid]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Group not found" });
    res.json({ message: "Group deleted successfully" });
  } catch (err) {
    console.error("Error deleting group:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
