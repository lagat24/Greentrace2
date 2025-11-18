const express = require("express");
const router = express.Router();
const db = require("../db"); // your DB connection file

router.post("/callback", async (req, res) => {
  const callbackData = req.body;

  console.log("MPESA CALLBACK:", JSON.stringify(callbackData, null, 2));

  try {
    const userId = callbackData.AccountReference; 
    const amount = callbackData.TransAmount;
    const plan = callbackData.BillRefNumber;

    // Example: 30-day subscription
    const start = new Date();
    const expiry = new Date();
    expiry.setDate(start.getDate() + 30);

    await db.execute(
      `INSERT INTO subscriptions (user_id, plan, amount, start_date, expiry_date)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, plan, amount, start, expiry]
    );

    res.json({ message: "Subscription saved" });
  } catch (err) {
    console.error("Error saving subscription:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
