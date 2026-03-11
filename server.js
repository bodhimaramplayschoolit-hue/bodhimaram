
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import db from "./db.js"; 
import authRoutes from "./authroutes.js";
import studentsRoutes from "./students.js";
import cabRoutes from "./cab.js";
import groupRoutes from "./group.js";
import transactionRoute from "./transcations.js";
import payRoute from "./pay.js";
import Razorpay from "razorpay";
import twilio from "twilio";
import staffRoutes from "./staff.js";
import { hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import expensesroute from "./expenses.js"
import staffAttendanceRoutes from "./staffattendance.js";
const app = express();
const PORT = 5000;
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(join(__dirname, "uploads")));







// ----------------------
// External Routes
// ----------------------
app.use("/api/auth", authRoutes);
app.use("/group", groupRoutes);
app.use("/api/students", studentsRoutes);
app.use("/transcations", transactionRoute);
app.use("/api/staff", staffRoutes);
app.use("/pay", payRoute);
app.use("/api",expensesroute)
app.use("/api/cab", cabRoutes);
app.use("/api/staff-attendance", staffAttendanceRoutes);

// ----------------------
// Razorpay & Twilio setup
// ----------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// ----------------------
// Test Route
// ----------------------
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// ----------------------
// Register Route
// ----------------------
app.post("/register", async (req, res) => {
  const { name, email, phone, password, status } = req.body;

  try {
    const hashedPassword = await hash(password, 10);
    const sql =
      "INSERT INTO  users (name, email, phone, password, status) VALUES (?, ?, ?, ?, ?)";

    db.query(sql, [name, email, phone, hashedPassword, status], (err, result) => {
      if (err) {
        console.error("Error    inserting  user:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res
        .status(201)
        .json({ message: "User registered  successfully!", result });
    });
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Use db.query directly
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials ❌" });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials ❌" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET, // make sure JWT_SECRET is in your .env
      { expiresIn: "1h" }
    );
return res.json({
  message: "Login success ✅",
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role   // ⭐ REQUIRED
  },
});

    
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error ❌" });
  }
});



// ----------------------
// Save Payment Link
// ----------------------
app.post("/save-paymentlink", async (req, res) => {
  try {
    const { student, group, amount, upiLink } = req.body;

    if (!student || !group || !amount || !upiLink) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    const sql = `
      INSERT INTO paylink
      (student_name, class_name, amount, phone, upi_link, status, created_at, status_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    await db.query(sql, [
      student.childname,   // student_name
      group,               // class_name
      amount,              // amount
      student.primary_no,  // phone
      upiLink,             // upi_link
      "Pending",           // status
    ]);

    res.status(200).send({ message: "Payment link saved successfully" });
  } catch (error) {
    console.error("Error saving payment link:", error);
    res.status(500).send({ message: "Error saving payment link" });
  }
});

// ----------------------
// Get All Payment Links
// ----------------------
app.get("/paylinks", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM paylink ORDER BY created_at DESC"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error fetching paylinks" });
  }
});


app.put("/paylinks/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Pending", "Paid", "Failed"].includes(status)) {
      return res.status(400).send({ message: "Invalid status value" });
    }

    const sql = `
      UPDATE paylink
      SET status = ?, status_updated_at = NOW()
      WHERE id = ?
    `;
    await db.query(sql, [status, id]);

    res.status(200).send({ message: "Status updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error updating status" });
  }
});







// ================= SUMMARY =================
app.get("/api/attendance/summary/:groupCode", async (req, res) => {
  const { groupCode } = req.params;

  try {
    const [rows] = await db.query(
      `
      SELECT 
        date,
        COUNT(*) AS total,
        SUM(status = 'P') AS present,
        SUM(status = 'A') AS absent
      FROM attendance
      WHERE group_code = ?
      GROUP BY date
      ORDER BY date DESC
      `,
      [groupCode]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ================= STUDENT MONTHLY REPORT (KEEP THIS FIRST) =================
app.get("/api/attendance/report/:studentId", async (req, res) => {
  const { studentId } = req.params;

  try {
    const [rows] = await db.query(
      `
      SELECT
        YEAR(date) AS year,
        MONTH(date) AS month,
        COUNT(*) AS total_days,
        SUM(status = 'P') AS present_days,
        SUM(status = 'A') AS absent_days
      FROM attendance
      WHERE student_id = ?
      GROUP BY YEAR(date), MONTH(date)
      ORDER BY year DESC, month DESC
      `,
      [studentId]
    );

    res.json(rows);
  } catch (err) {
    console.error("STUDENT ATT REPORT ERROR:", err);
    res.status(500).json([]);
  }
});


// // ================= GET ATTENDANCE BY DATE (KEEP AFTER) =================
// app.get("/api/attendance/:groupCode/:date", async (req, res) => {
//   const { groupCode, date } = req.params;

//   try {
//     const [rows] = await db.query(
//       "SELECT student_id, status FROM attendance WHERE group_code = ? AND date = ?",
//       [groupCode, date]
//     );

//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json([]);
//   }
// });



// ================= GET ATTENDANCE BY DATE =================
app.get("/api/attendance/:groupCode/:date", async (req, res) => {
  const { groupCode, date } = req.params;

  try {
    const [rows] = await db.query(
      "SELECT student_id, status FROM attendance WHERE group_code = ? AND date = ?",
      [groupCode, date]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ================= SAVE =================
app.post("/api/attendance", async (req, res) => {
  const { groupCode, date, attendance } = req.body;

  try {
    for (const a of attendance) {
      await db.query(
        `
        INSERT INTO attendance (group_code, student_id, date, status)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
        `,
        [groupCode, a.student_id, date, a.status]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Save  failed" });
  }
});


// app.get("/api/attendance/report/:studentId", async (req, res) => {
//   const { studentId } = req.params;

//   try {
//     const [rows] = await db.query(
//       `
//       SELECT
//         YEAR(date) AS year,
//         MONTH(date) AS month,
//         COUNT(*) AS total_days,
//         SUM(status = 'P') AS present_days,
//         SUM(status = 'A') AS absent_days
//       FROM attendance
//       WHERE student_id = ?
//       GROUP BY YEAR(date), MONTH(date)
//       ORDER BY year DESC, month DESC
//       `,
//       [studentId]
//     );

//     res.json(rows);
//   } catch (err) {
//     console.error("STUDENT ATT REPORT ERROR:", err);
//     res.status(500).json([]);
//   }
// });



// ----------------------
// Start Server
// ----------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on  http://localhost:${PORT}`);
});
