import express from "express";
import db from "./db.js";

const router = express.Router();

/* ===============================
   GET STAFF LIST (EXCEPT ADMIN)
================================ */
router.get("/staff", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name
      FROM users
      WHERE role != 'admin' AND status = 'active'
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error("GET STAFF LIST ERROR:", err);
    res.status(500).json({ error: "Failed to fetch staff" });
  }
});

/* ===============================
   GET ATTENDANCE BY DATE
================================ */
router.get("/", async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Date required" });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        sa.id,
        sa.staff_id,
        u.name,
        sa.status,
        sa.extra_hours
      FROM staff_attendance sa
      JOIN users u ON u.id = sa.staff_id
      WHERE sa.attendance_date = ?
      `,
      [date]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET ATTENDANCE ERROR:", err);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

/* ===============================
   SAVE / UPDATE ATTENDANCE
================================ */
router.post("/", async (req, res) => {
  const { date, records } = req.body;

  if (!date || !Array.isArray(records)) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const r of records) {
      await conn.query(
        `
        INSERT INTO staff_attendance
          (staff_id, attendance_date, status, extra_hours)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          extra_hours = VALUES(extra_hours)
        `,
        [
          r.staff_id,
          date,
          r.status,
          r.extra_hours || 0
        ]
      );
    }

    await conn.commit();
    res.json({ message: "Attendance saved successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("SAVE ATTENDANCE ERROR:", err);
    res.status(500).json({ error: "Failed to save attendance" });
  } finally {
    conn.release();
  }
});


/* ===============================
   GET STAFF ATTENDANCE HISTORY
================================ */
router.get("/history/:staffId", async (req, res) => {
  const { staffId } = req.params;

  try {
    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(attendance_date, '%Y-%m-%d') AS date,
        status,
        extra_hours
      FROM staff_attendance
      WHERE staff_id = ?
      ORDER BY attendance_date DESC
      `,
      [staffId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET STAFF HISTORY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});


/* ===============================
   GET SINGLE ATTENDANCE (EDIT)
================================ */
router.get("/single", async (req, res) => {
  const { staff_id, date } = req.query;

  if (!staff_id || !date) {
    return res.status(400).json({ error: "staff_id & date required" });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT status, extra_hours
      FROM staff_attendance
      WHERE staff_id = ? AND attendance_date = ?
      `,
      [staff_id, date]
    );

    res.json(rows[0] || null);
  } catch (err) {
    console.error("GET SINGLE ATT ERROR:", err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

/* ===============================
   UPDATE SINGLE ATTENDANCE
================================ */
router.put("/single", async (req, res) => {
  const { staff_id, date, status, extra_hours } = req.body;

  try {
    await db.query(
      `
      UPDATE staff_attendance
      SET status = ?, extra_hours = ?
      WHERE staff_id = ? AND attendance_date = ?
      `,
      [status, extra_hours || 0, staff_id, date]
    );

    res.json({ message: "Attendance updated" });
  } catch (err) {
    console.error("UPDATE ATT ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
