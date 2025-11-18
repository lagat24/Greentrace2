const express = require('express');
const conn = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await conn.execute(`
      SELECT u.id, u.name, COALESCE(COUNT(t.id), 0) AS trees_planted
      FROM users u
      LEFT JOIN trees t ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY trees_planted DESC
      LIMIT 100
    `);
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;