require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const subscriptionRoutes = require('./routes/subs');
const callbackRoutes = require('./routes/callback');


// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/mpesa', callbackRoutes);


// Create MySQL connection pool (Aiven)
const db = mysql.createPool({
  host: process.env.DB_HOST,          // Aiven host
  user: process.env.DB_USER,          // Aiven user
  password: process.env.DB_PASSWORD,  // Aiven password
  database: process.env.DB_NAME,      // Your database name
  port: process.env.DB_PORT || 3306,  // Default MySQL port
});

// Test DB connection on startup
db.getConnection()
  .then(() => console.log('✅ Connected to Aiven MySQL successfully'))
  .catch(err => console.error('❌ Aiven MySQL connection failed:', err));

// Import routes
const authRoutes = require('./routes/auth');
const treeRoutes = require('./routes/trees');
const leaderboardRoutes = require('./routes/leaderboard');

// ✅ Updated route prefixes to include /api/
app.use('/api/auth', authRoutes);
app.use('/api/trees', treeRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Root route (for quick check)
app.get('/', (req, res) => res.send({ ok: true, app: 'GreenTrace API' }));

// Test DB route
app.get('/api/testdb', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.json({ ok: true, db: 'connected', result: rows[0].result });
  } catch (err) {
    console.error('❌ DB test failed:', err);
    res.status(500).json({ ok: false, db: 'error', message: err.message });
  }
});

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

// Export db for other routes
module.exports = db;
