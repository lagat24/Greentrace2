// db.js
const mysql = require('mysql2/promise');  // ✅ use the promise version
const fs = require('fs');

const conn = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Optional test log (can remove later)
conn.getConnection()
  .then(() => console.log('✅ Connected to Aiven MySQL successfully (promise pool)'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

module.exports = conn;

