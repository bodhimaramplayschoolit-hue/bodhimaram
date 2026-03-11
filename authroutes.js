import { Router } from "express";
import db from "./db.js";
import { createTransport } from "nodemailer";
import twilio from "twilio";
import dotenv from "dotenv";
import { hash } from "bcryptjs";
const router = Router();
dotenv.config();
// === Email Transporter Setup ===

const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});


// === Twilio Setup ===
const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);



// ================= FORGOT PASSWORD =================
router.post("/forgot-password", async (req, res) => {
  const { option, value } = req.body;

  try {
    if (option === "email") {
      const [results] = await db
        
        .query("SELECT * FROM users WHERE email = ?", [value]);
      if (results.length === 0)
        return res.status(404).json({ error: "Email not found" });

      const resetToken = Math.random().toString(36).substring(2, 12);

      // Set expiry 10 minutes from now
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      const resetLink = `http://localhost:3000/reset-password/${resetToken}`;

      // Update token and expiry in DB
      await db
        .query(
          "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?",
          [resetToken, expiryTime, value]
        );

      // Send email with expiry info
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: value,
        subject: "Password Reset Request",
        html: `
          <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #ddd; border-radius:10px;">
            <h2>Password Reset Request</h2>
            <p>You requested a password reset. Click the button below:</p>
            <p style="text-align:center; margin:30px 0;">
              <a href="${resetLink}" style="background:#007bff; color:white; padding:10px 20px; border-radius:5px; text-decoration:none;">
                Reset Password
              </a>
            </p>
            <p>If the button doesn’t work, copy this link:</p>
            <p style="word-break: break-all;">${resetLink}</p>
            <p style="color:#888; font-size:12px;">This link is valid for 10 minutes only.</p>
          </div>
        `,
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error("Email error:", error);
          return res.status(500).json({ error: "Email not sent" });
        }
        res.json({ message: "Reset link sent to email" });
      });
    }

    // Phone OTP
    // Phone OTP
else if (option === "phone") {
  const [results] = await db
    
    .query("SELECT * FROM users WHERE phone = ?", [value]);
  
  if (results.length === 0)
    return res.status(404).json({ error: "Phone not found" });

  // Format number to E.164 if not already
  let phoneNumber = value.startsWith("+") ? value : `+91${value}`; // assuming India, change country code if needed

  const otp = Math.floor(1000 + Math.random() * 9000);
  const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  await db
    
    .query("UPDATE users SET otp = ?, otp_expiry = ? WHERE phone = ?", [
      otp,
      expiryTime,
      value,
    ]);

  try {
    await twilioClient.messages.create({
      body: `Your OTP is ${otp}`,
      from: process.env.TWILIO_PHONE,
      to: phoneNumber,
    });

    res.json({ message: "OTP sent to your phone" });
  } catch (err) {
    console.error("Twilio OTP error:", err);
    if (err.code === 21408) {
      return res.status(400).json({ 
        error: "Cannot send SMS to this number. Check Twilio region permissions or verify the number." 
      });
    } else {
      return res.status(500).json({ error: "Failed to send OTP. Try again later." });
    }
  }
}
else {
      res.status(400).json({ error: "Invalid option" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= RESET PASSWORD =================
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ error: "Token and password are required" });
  }

  try {
    const [results] = await db
      
      .query("SELECT * FROM users WHERE reset_token = ?", [token]);

    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const user = results[0];
    if (Date.now() > user.reset_token_expiry) {
      return res.status(400).json({
        error: "Reset link expired. Please request a new one.",
        redirect: "/forget-password",
      });
    }

    const hashedPassword = await hash(password, 10);

    await db
      .query(
        "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?",
        [hashedPassword, token]
      );

    res.json({ message: "Password reset successful! You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  try {
    const [results] = await db.query(
      "SELECT * FROM users WHERE phone = ? AND otp = ?",
      [phone, otp]
    );

    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const user = results[0];
    const now = new Date();

    if (now > user.otp_expiry) {
      return res.status(400).json({ error: "OTP expired" });
    }

    // OTP valid
    res.json({ success: true, message: "OTP verified! You can reset your password now." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// Reset password via phone OTP
router.post("/reset-password-otp", async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password are required" });
  }

  try {
    // Find user by phone
    const [results] = await db
      
      .query("SELECT * FROM users WHERE phone = ?", [phone]);

    if (results.length === 0) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    const user = results[0];

    // Check OTP expiry
    if (!user.otp || !user.otp_expiry || new Date() > user.otp_expiry) {
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }

    // OTP verified previously, allow password reset
    const hashedPassword = await hash(password, 10);

    await db
      
      .query(
        "UPDATE users SET password = ?, otp = NULL, otp_expiry = NULL WHERE phone = ?",
        [hashedPassword, phone]
      );

    res.json({ success: true, message: "Password reset successful! You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


export default router; // ✅ CommonJS export
