import { Router } from "express";
import db from "./db.js";

const router = Router();

/* ===== CURRENT MONTH (SERVER UTC) ===== */
function getCurrentMonth() {
  const d = new Date();
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.toISOString().slice(0, 10),
  };
}

/* =========================================
   INIT CURRENT MONTH CAB PAYMENTS
========================================= */
router.post("/init-current-month", async (req, res) => {
  try {
    const { year, month } = getCurrentMonth();

    await db.query(
      `
      INSERT INTO cab_payments
      (cab_student_id, student_id, year, month, amount)
      SELECT
        cs.id,
        cs.student_id,
        ?,
        ?,
        cs.monthly_amount
      FROM cab_students cs
      WHERE cs.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM cab_payments cp
        WHERE cp.cab_student_id = cs.id
        AND cp.year = ?
        AND cp.month = ?
      )
      `,
      [year, month, year, month]
    );

    res.json({ message: "Cab payments initialized" });
  } catch (err) {
    console.error("INIT CAB ERROR:", err);
    res.status(500).json({ error: "Init failed" });
  }
});

/* =========================================
   GET PREV + CURRENT MONTH PAYMENTS
========================================= */
router.get("/payments", async (req, res) => {
  try {
    const { year, month } = getCurrentMonth();
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const [rows] = await db.query(
      `
      SELECT
        cp.id,
        s.childname AS student,
        cs.stop_location AS area,
        cp.amount,
        cp.payment_status,
        cp.year,
        cp.month
      FROM cab_payments cp
      JOIN cab_students cs ON cs.id = cp.cab_student_id
      JOIN students s ON s.id = cp.student_id
      WHERE (cp.year = ? AND cp.month = ?)
         OR (cp.year = ? AND cp.month = ?)
      ORDER BY cs.stop_location, s.childname
      `,
      [year, month, prevYear, prevMonth]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET CAB PAYMENTS ERROR:", err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

/* =========================================
   UPDATE PAYMENT STATUS
========================================= */
router.put("/payments/:id", async (req, res) => {
  const { status, mode, note } = req.body;
  const { date } = getCurrentMonth();

  try {
    await db.query(
      `
      UPDATE cab_payments
      SET payment_status = ?,
          payment_mode = ?,
          reference_note = ?,
          paid_date = IF(? = 'paid', ?, NULL)
      WHERE id = ?
      `,
      [status, mode, note, status, date, req.params.id]
    );

    res.json({ message: "Payment updated" });
  } catch (err) {
    console.error("UPDATE CAB ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* =========================================
   GET CAB STUDENTS (FOR AUTOCOMPLETE)
========================================= */
router.get("/students", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        cs.id AS cab_student_id,
        s.id AS student_id,
        s.childname,
        s.group_code,
        cs.stop_location
      FROM cab_students cs
      JOIN students s ON s.id = cs.student_id
      WHERE cs.status = 'active'
      ORDER BY s.childname
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET CAB STUDENTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch cab students" });
  }
});

/* =========================================
   GET CAB REPORT BY STUDENT
========================================= */
router.get("/report/:cabStudentId", async (req, res) => {
  const { cabStudentId } = req.params;

  try {
    const [rows] = await db.query(
      `
      SELECT
        cp.year,
        cp.month,
        cp.amount,
        cp.payment_status,
        cp.payment_mode,
        cp.paid_date
      FROM cab_payments cp
      WHERE cp.cab_student_id = ?
      ORDER BY cp.year DESC, cp.month DESC
      `,
      [cabStudentId]
    );

    res.json(rows);
  } catch (err) {
    console.error("CAB REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to fetch cab report" });
  }
});


export default router;
