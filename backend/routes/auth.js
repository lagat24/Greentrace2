const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const conn = require('../db');  // You imported 'conn' here
const router = express.Router();

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10');
const JWT_SECRET = process.env.JWT_SECRET;

// Signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    // INSERT uses 'conn' (correct)
    await conn.execute(
      'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, NOW())',
      [username, email, hashed]
    );

    // FIX: Use 'conn' instead of 'db'
    const [rows] = await conn.execute('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user });
} catch (err) {
  // Handle duplicate entry errors
  if (err.code === 'ER_DUP_ENTRY') {
    const field = determineDuplicateField(err);
    const message = getDuplicateFieldMessage(field);
    return res.status(409).json({ 
      error: message,
      field: field // Help frontend know which field had issue
    });
  }
  
  // Handle other common MySQL errors
  if (err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ error: 'Referenced record not found' });
  }
  
  if (err.code === 'ER_DATA_TOO_LONG') {
    return res.status(400).json({ error: 'Data too long for one or more fields' });
  }
  
  // Handle validation errors (if using a validation library)
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: err.errors 
    });
  }
  
  // Log unexpected errors
  console.error('Database error:', err);
  
  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  return res.status(500).json({ 
    error: 'Internal server error',
    ...(isDevelopment && { detail: err.message })
  });
}

// Helper functions
function determineDuplicateField(err) {
  if (!err.sqlMessage) return null;
  
  // More robust field detection
  if (err.sqlMessage.includes('email') || err.sqlMessage.includes('user_email')) {
    return 'email';
  }
  if (err.sqlMessage.includes('username') || err.sqlMessage.includes('user_name')) {
    return 'username';
  }
  // Check for unique constraint names
  if (err.sqlMessage.includes('unique_email')) return 'email';
  if (err.sqlMessage.includes('unique_username')) return 'username';
  
  return null;
}

function getDuplicateFieldMessage(field) {
  const messages = {
    email: 'Email already registered',
    username: 'Username already taken',
  };
  return messages[field] || 'Duplicate entry found';
}

  }
);

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
