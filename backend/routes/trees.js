const express = require('express');
const conn = require('../db');
const auth = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/', auth, async (req, res) => {
  const { species, photo_url, latitude, longitude } = req.body;
  const userId = req.user.id;
  if (!species || !latitude || !longitude) return res.status(400).json({ error: 'Missing fields' });
  try {
    await conn.execute('INSERT INTO trees (user_id, species, photo_url, latitude, longitude, planted_at) VALUES (?, ?, ?, ?, ?, NOW())', [userId, species, photo_url || null, latitude, longitude]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;