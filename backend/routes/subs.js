const express = require("express");
const { initiateStkPush } = require("../subs.js");

const router = express.Router();

router.post("/pay", async (req, res) => {
  try {
    const { phone, amount, plan, userId } = req.body;

    if (!phone || !amount || !plan || !userId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const response = await initiateStkPush(
      phone,
      amount,
      `Plan-${plan}-User-${userId}`
    );

    res.status(200).json(response);

  } catch (err) {
    console.error("STK PUSH ERROR:", err?.response?.data || err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

module.exports = router;
