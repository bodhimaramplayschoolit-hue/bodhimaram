import express from "express";
import Razorpay from "razorpay";
import cron from "node-cron";
import db from "./db.js";  
import twilio from "twilio";
const router = express.Router();


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

// === Twilio Setup ===
const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);


// -------------------- Send SMS API --------------------
router.post("/send-sms", async (req, res) => {
  try {
    const { phone, childname, amount, link } = req.body;

    if (!phone || !link) {
      return res.status(400).json({ message: "Phone or link missing" });
    }

    const msg = `Dear Parent, the fee for ${childname} (₹${amount}) is due. Please pay using this link: ${link}`;

    await twilioClient.messages.create({
      body: msg,
      from: process.env.TWILIO_PHONE, // Your Twilio number
      to: `+91${phone}`, // assuming India
    });

    res.json({ success: true, message: "SMS sent successfully" });
  } catch (err) {
    console.error("❌ Error sending SMS:", err);
    res.status(500).json({ message: "Failed to send SMS" });
  }
});

// -------------------- Create Razorpay payment --------------------
router.post("/create-payment", async (req, res) => {
  try {
    const { student, amount } = req.body;

    if (!student || !student.id || !amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid student or amount" });
    }

    // 1️⃣ Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `receipt_${student.id}_${Date.now()}`,
      notes: {
        student_id: student.id,
        student_name: student.childname,
        group_code: student.group_code,
      },
    });

    // 2️⃣ Store in transactions table (Unpaid by default)
    await db.query(
      `INSERT INTO transactions 
        (group_code, student_id, student_name, amount, payment_mode, status, razorpay_payment_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        student.group_code,     // group_code → varchar(50)
        student.id,             // student_id → int
        student.childname,      // student_name → varchar(100)
        amount,                 // amount → decimal(10,2)
        "Online",               // payment_mode → 'Online'
        "Unpaid",               // status → default 'Unpaid'
        order.id                // store Razorpay order_id here
      ]
    );

    // 3️⃣ Return order details to frontend
    res.json({
        key: process.env.RAZORPAY_KEY,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });




  } catch (err) {
    console.error("❌ Error creating payment:", err);
    res.status(500).json({ message: "Server error creating payment" });
  }
});
import crypto from "crypto";

// -------------------- Razorpay Webhook --------------------
router.post("/webhook/payment-success", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 1️⃣ Verify signature
    const shasum = crypto.createHmac("sha256", secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest("hex");

    if (digest !== req.headers["x-razorpay-signature"]) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    const event = req.body.event;
    const payload = req.body.payload.payment?.entity;

    // 2️⃣ Handle payment captured
    if (event === "payment.captured" && payload) {
      const {
        order_id,
        id: payment_id,
        status,
        method,
        amount,
      } = payload;

      // 3️⃣ Update transaction table
      await db.query(
        `UPDATE transactions 
         SET status = ?, razorpay_payment_id = ?, updated_at = NOW(), notes = ? 
         WHERE razorpay_payment_id = ?`,
        [
          "Paid",              // status
          payment_id,          // actual Razorpay payment_id
          `Method: ${method}, Amount: ${amount / 100}`, // extra notes
          order_id             // match with stored order_id
        ]
      );

      console.log(`✅ Transaction updated for Order ${order_id}`);
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ message: "Server error in webhook" });
  }
});

// -------------------- Verify Razorpay payment --------------------
router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, studentId } = req.body;

    // 1️⃣ Verify signature
    const generated_signature = crypto
      .createHmac("sha256", "YOUR_RAZORPAY_KEY_SECRET")
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // 2️⃣ Update transaction as Paid and save razorpay_payment_id
    await db.query(
      `UPDATE transactions 
       SET status = 'Paid', razorpay_payment_id = ?, updated_at = NOW() 
       WHERE student_id = ? AND status = 'Unpaid' 
       ORDER BY id DESC LIMIT 1`,
      [razorpay_payment_id, studentId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error verifying payment" });
  }
});

// In transactions table, add created_at column (you already have)
// Use a cron job or a scheduled task
// Example: Node cron using node-cron

// cron.schedule("*/5 * * * *", async () => { // every 5 minutes
//   try {
//     const [rows] = await db.query(
//       "UPDATE transactions SET status='Unpaid' WHERE status='Unpaid' AND created_at < (NOW() - INTERVAL 3 DAY)"
//     );
//     console.log("Expired old unpaid transactions:", rows.affectedRows);
//   } catch (err) {
//     console.error(err);
//   }
// });



export default router;
