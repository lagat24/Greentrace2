const express = require("express");
const multer = require("multer");
const { classifyImage } = require("../model");

const router = express.Router();
const upload = multer();

router.post("/check", upload.single("image"), async (req, res) => {
  try {
    const result = await classifyImage(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: "Failed to classify image" });
  }
});

module.exports = router;
