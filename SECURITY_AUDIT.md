# GreenTrace Security Audit Report

## Critical Vulnerabilities Found

### 🔴 CRITICAL

#### 1. **Missing Authentication on M-Pesa Callback** (Backend)
**File:** `backend/routes/callback.js`
**Issue:** The `/api/mpesa/callback` endpoint has NO authentication middleware, allowing anyone to submit fake payment callbacks.
```javascript
// VULNERABLE:
router.post("/callback", async (req, res) => {
  // No auth check - anyone can call this!
```
**Fix:** Add authentication and webhook signature verification
```javascript
const auth = require('../middleware/authMiddleware');
router.post("/callback", auth, async (req, res) => {
```

#### 2. **SQL Injection Risk in Callback Handler** (Backend)
**File:** `backend/routes/callback.js`
**Issue:** User input (`userId`, `plan`, `amount`) from untrusted M-Pesa callback is used directly without validation.
**Fix:** Validate and sanitize all inputs:
```javascript
if (!Number.isInteger(userId) || userId < 1) {
  return res.status(400).json({ error: 'Invalid user ID' });
}
if (!Number.isFinite(amount) || amount <= 0) {
  return res.status(400).json({ error: 'Invalid amount' });
}
```

#### 3. **Sensitive Data in localStorage** (Frontend)
**File:** `frontend/scripts/app.js`
**Issue:** JWT tokens stored in localStorage are vulnerable to XSS attacks
```javascript
localStorage.setItem('token', token); // ⚠️ Vulnerable
localStorage.setItem('greentrace_user', JSON.stringify(user)); // ⚠️ Exposes user data
```
**Risk:** Any XSS vulnerability allows attackers to steal the token
**Fix:** Use HttpOnly cookies instead (requires backend change):
```javascript
// Backend should set HttpOnly cookie, not return token
// Frontend uses credentials: 'include' in fetch
```

#### 4. **Password Sent Over HTTP on Login** (Frontend/Security Policy)
**Issue:** Passwords are sent in plain JSON bodies to the server. While over HTTPS in production, ensure:
- API always uses HTTPS
- Never log passwords
- Set secure headers

#### 5. **Missing Rate Limiting** (Backend)
**Issue:** No rate limiting on login, signup, or payment endpoints - allows brute force attacks
**Fix:** Add rate limiting middleware:
```bash
npm install express-rate-limit
```

---

### 🟠 HIGH

#### 6. **Missing CORS Validation** (Backend)
**File:** `backend/server.js`
**Issue:** CORS is open to all origins
```javascript
app.use(cors()); // ⚠️ Allows ANY origin
```
**Fix:** Restrict to your frontend domain:
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'],
  credentials: true
}));
```

#### 7. **No Input Validation on Auth Routes** (Backend)
**File:** `backend/routes/auth.js`
**Issue:** Email and username fields aren't validated for format/length
```javascript
const { username, email, password } = req.body;
if (!username || !email || !password) // Only checks if exists, not format
```
**Fix:** Add input validation:
```javascript
const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = /^[a-zA-Z0-9_-]{3,20}$/.test(username);
if (!isValidEmail || !isValidUsername || password.length < 8) {
  return res.status(400).json({ error: 'Invalid input' });
}
```

#### 8. **No HTTPS Enforcement** (Backend)
**Issue:** No redirect from HTTP to HTTPS
**Fix:** Add middleware:
```javascript
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(`https://${req.get('host')}${req.url}`);
    }
    next();
  });
}
```

#### 9. **Missing Security Headers** (Backend)
**File:** `backend/server.js`
**Issue:** No security headers set
**Fix:** Add helmet middleware:
```bash
npm install helmet
```
```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

### 🟡 MEDIUM

#### 10. **No Token Expiration Check on Frontend** (Frontend)
**Issue:** Frontend doesn't check if token is expired before using
**Fix:** Add token validation:
```javascript
function isTokenExpired(token) {
  try {
    const decoded = JSON.parse(atob(token.split('.')[1]));
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
```

#### 11. **No User ID Verification in Delete Tree** (Frontend)
**Issue:** While you added ownership check for delete, it's client-side only. Backend should verify too.
**Fix:** Add backend tree deletion endpoint with auth:
```javascript
router.delete('/:treeId', auth, async (req, res) => {
  const tree = await conn.execute('SELECT * FROM trees WHERE id = ? AND user_id = ?', [req.params.treeId, req.user.id]);
  if (!tree[0].length) return res.status(403).json({ error: 'Unauthorized' });
  // Delete tree
});
```

#### 12. **No Validation on Tree Image Upload** (Frontend)
**Issue:** Base64 image data can be huge, causing DoS
**Fix:** Validate file size:
```javascript
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
if (imageFile.size > MAX_IMAGE_SIZE) {
  showToast('Image too large (max 5MB)', 'error');
  return;
}
```

#### 13. **M-Pesa Phone Number Not Validated** (Backend)
**File:** `backend/routes/subs.js`
**Issue:** Phone number format not validated
**Fix:** Add validation:
```javascript
const phoneRegex = /^254[0-9]{9}$/;
if (!phoneRegex.test(phone)) {
  return res.status(400).json({ error: 'Invalid Kenyan phone number' });
}
```

#### 14. **No SQLi Protection on Leaderboard** (Backend)
**File:** `backend/routes/leaderboard.js`
**Issue:** Uses parameterized queries (good), but verify all routes use this pattern

#### 15. **Hardcoded API Base URL** (Frontend)
**File:** `frontend/scripts/app.js`
**Issue:** API URL is hardcoded
```javascript
const API_BASE = 'https://greentrace-t95w.onrender.com';
```
**Fix:** Load from environment:
```javascript
const API_BASE = window.API_BASE_URL || 'https://greentrace-t95w.onrender.com';
```

---

### 🔵 LOW

#### 16. **No Logging/Monitoring** (Backend)
**Issue:** No error logging for security events
**Fix:** Add logging for failed logins, payment failures, etc.

#### 17. **JWT Secret Might Be Weak** (Backend)
**Issue:** Depends on `process.env.JWT_SECRET` - ensure it's 32+ characters
**Fix:** Validate on startup:
```javascript
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```

#### 18. **No CSRF Protection** (Frontend/Backend)
**Issue:** No CSRF tokens on state-changing operations
**Fix:** Add CSRF token validation for POST requests

---

## Recommendations (Priority Order)

1. **IMMEDIATE (Do First)**
   - [ ] Add authentication to `/api/mpesa/callback`
   - [ ] Validate all M-Pesa callback inputs
   - [ ] Restrict CORS to your frontend domain
   - [ ] Add rate limiting on auth & payment endpoints
   - [ ] Move JWT to HttpOnly cookies (requires backend change)

2. **HIGH (This Week)**
   - [ ] Add input validation on all auth routes
   - [ ] Add Helmet security headers
   - [ ] Implement HTTPS enforcement
   - [ ] Add backend verification for tree deletion
   - [ ] Validate phone numbers for M-Pesa

3. **MEDIUM (Soon)**
   - [ ] Add file size validation on image uploads
   - [ ] Check token expiration on frontend
   - [ ] Add error logging/monitoring
   - [ ] Remove hardcoded API URLs
   - [ ] Add CSRF protection

4. **LOW (Nice to Have)**
   - [ ] Implement audit logging
   - [ ] Add rate limiting per user
   - [ ] Implement API key rotation for M-Pesa

---

## Testing Checklist

- [ ] Test token expiration handling
- [ ] Test XSS payloads in tree name/description
- [ ] Test SQL injection in login
- [ ] Test brute force on login endpoint
- [ ] Test CORS from different origins
- [ ] Test fake M-Pesa callbacks
- [ ] Test file upload size limits

---

## Environment Variables to Verify

Ensure these are set securely:
```
JWT_SECRET=<32+ character random string>
DB_PASSWORD=<strong password>
MPESA_CONSUMER_KEY=<keep secret>
MPESA_CONSUMER_SECRET=<keep secret>
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

Never commit `.env` files or secrets to git.
