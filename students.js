


import { Router } from "express";
import db from "./db.js";
import { upload } from "./upload.js";

const router = Router();

/* ================= HELPERS ================= */
function parseDateOrNull(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : dateStr;
}

function generateStudentId(groupCode) {
  return `${groupCode}-S${Date.now()}`;
}

/* ================= GET ================= */

// Get students by group
router.get("/:groupCode", async (req, res) => {
  const { groupCode } = req.params;

  if (!groupCode) {
    return res.status(400).json({ error: "Group code is required" });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM students WHERE group_code = ? ORDER BY created_at DESC",
      [groupCode]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET GROUP STUDENTS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Get all students
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM students ORDER BY group_code, childname"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET ALL STUDENTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});



router.post("/", upload.single("student_image"), async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    let {
      group_code,
      childname,
      parentname,
      primary_no,
      alternate_no,
      address,
      pincode,
      joining_date,
      fees_type,
      total_fees,
      fees_amount,
      cab_facility,
      stop_location,
      cab_monthly_amount,
    } = req.body;

    /* ================= VALIDATION ================= */
    if (
      !group_code ||
      !childname ||
      !parentname ||
      !primary_no ||
      !address ||
      !fees_type
    ) {
      await conn.rollback();
      return res.status(400).json({
        error:
          "Required fields missing (childname, parentname, primary_no, address, fees_type)",
      });
    }

    if (!["term", "monthly"].includes(fees_type)) {
      await conn.rollback();
      return res.status(400).json({ error: "Invalid fees type" });
    }

    /* ================= BASIC DATA ================= */
    const st_id = generateStudentId(group_code);
    const student_image = req.file ? req.file.filename : null;
    joining_date = parseDateOrNull(joining_date);

    if (cab_facility !== "yes") {
      cab_facility = "no";
      stop_location = null;
      cab_monthly_amount = null;
    }

    /* ================= INSERT STUDENT ================= */
    const [studentResult] = await conn.query(
      `
      INSERT INTO students
      (group_code, st_id, childname, parentname, primary_no, alternate_no,
       address, pincode, joining_date,
       fees_type, total_fees, fees_amount,
       cab_facility, stop_location, cab_monthly_amount,
       student_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        group_code,
        st_id,
        childname,
        parentname,
        primary_no,
        alternate_no || null,
        address,
        pincode || null,
        joining_date,
        fees_type,
        total_fees || 0,
        fees_amount || 0,
        cab_facility,
        stop_location,
        cab_monthly_amount,
        student_image,
      ]
    );

    const student_id = studentResult.insertId;

    /* ================= CAB LOGIC ================= */
    if (cab_facility === "yes") {
      // 1️⃣ Insert into cab_students
      const [cabStudentRes] = await conn.query(
        `
        INSERT INTO cab_students
        (student_id, group_code, st_id, stop_location, monthly_amount)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          student_id,
          group_code,
          st_id,
          stop_location,
          cab_monthly_amount,
        ]
      );

      const cab_student_id = cabStudentRes.insertId;

      // 2️⃣ Create current month payment
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;

      await conn.query(
        `
        INSERT INTO cab_payments
        (cab_student_id, student_id, year, month, amount)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          cab_student_id,
          student_id,
          year,
          month,
          cab_monthly_amount,
        ]
      );
    }

    /* ================= COMMIT ================= */
    await conn.commit();

    res.status(201).json({
      id: student_id,
      st_id,
      message: "✅ Student added successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("ADD STUDENT ERROR:", err);
    res.status(500).json({ error: "Failed to add student" });
  } finally {
    conn.release();
  }
});




/* ================= UPDATE ================= */

router.put("/:id", upload.single("student_image"), async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Student ID is required" });
  }

  let {
    childname,
    parentname,
    primary_no,
    alternate_no,
    address,
    pincode,
    joining_date,
    fees_type,
    total_fees,
    fees_amount,
    cab_facility,
    stop_location,
    cab_monthly_amount,
  } = req.body;

  const updateFields = {};

  if (childname) updateFields.childname = childname;
  if (parentname) updateFields.parentname = parentname;
  if (primary_no) updateFields.primary_no = primary_no;
  if (alternate_no !== undefined)
    updateFields.alternate_no = alternate_no || null;
  if (address) updateFields.address = address;
  if (pincode !== undefined) updateFields.pincode = pincode || null;

  const parsedJoiningDate = parseDateOrNull(joining_date);
  if (parsedJoiningDate) updateFields.joining_date = parsedJoiningDate;

  if (fees_type) {
    if (!["term", "monthly"].includes(fees_type)) {
      return res.status(400).json({ error: "Invalid fees type" });
    }
    updateFields.fees_type = fees_type;
  }

  if (total_fees !== undefined) updateFields.total_fees = total_fees || 0;
  if (fees_amount !== undefined) updateFields.fees_amount = fees_amount || 0;

  // Cab logic
  if (cab_facility) {
    updateFields.cab_facility = cab_facility;

    if (cab_facility === "yes") {
      updateFields.stop_location = stop_location || null;
      updateFields.cab_monthly_amount = cab_monthly_amount || 0;
    } else {
      updateFields.stop_location = null;
      updateFields.cab_monthly_amount = null;
    }
  }

  if (req.file) {
    updateFields.student_image = req.file.filename;
  }

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  try {
    const [result] = await db.query(
      "UPDATE students SET ? WHERE id = ?",
      [updateFields, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const [[updatedStudent]] = await db.query(
      "SELECT * FROM students WHERE id = ?",
      [id]
    );

    res.json(updatedStudent);
  } catch (err) {
    console.error("UPDATE STUDENT ERROR:", err);
    res.status(500).json({ error: "Failed to update student" });
  }
});

/* ================= DELETE ================= */

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      "DELETE FROM students WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ message: "✅ Student deleted successfully" });
  } catch (err) {
    console.error("DELETE STUDENT ERROR:", err);
    res.status(500).json({ error: "Failed to delete student" });
  }
});

export default router;
