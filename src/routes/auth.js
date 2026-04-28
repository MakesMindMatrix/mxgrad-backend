import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authMiddleware, requireAuth, JWT_SECRET } from '../middleware/auth.js';

const router = Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// PAN format: 5 uppercase letters + 4 digits + 1 uppercase letter (Indian company PAN)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, approval_status: user.approval_status },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function loginResponse(user, token) {
  return {
    token,
    expiresIn: JWT_EXPIRES_IN,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      approvalStatus: user.approval_status,
      managed_by_user_id: user.managed_by_user_id ?? null,
      managed_by_name: user.managed_by_name ?? null,
      managed_by_email: user.managed_by_email ?? null,
      login_enabled: user.login_enabled ?? true,
    },
  };
}

// Look up user by primary login email only (never additional_email from profiles)
async function findUserByEmail(email) {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.approval_status, u.managed_by_user_id, u.login_enabled,
            manager.name AS managed_by_name, manager.email AS managed_by_email
     FROM users u
     LEFT JOIN users manager ON manager.id = u.managed_by_user_id
     WHERE u.email = $1`,
    [email.trim().toLowerCase()]
  );
  return result.rows[0] || null;
}

// Check PAN uniqueness across all profile tables
async function isPanTaken(pan, excludeUserId = null) {
  const panUpper = pan.toUpperCase();
  const [g, s, i] = await Promise.all([
    query(`SELECT 1 FROM gcc_profiles WHERE pan_number = $1${excludeUserId ? ' AND user_id != $2' : ''}`, excludeUserId ? [panUpper, excludeUserId] : [panUpper]),
    query(`SELECT 1 FROM startup_profiles WHERE pan_number = $1${excludeUserId ? ' AND user_id != $2' : ''}`, excludeUserId ? [panUpper, excludeUserId] : [panUpper]),
    query(`SELECT 1 FROM incubation_profiles WHERE pan_number = $1${excludeUserId ? ' AND user_id != $2' : ''}`, excludeUserId ? [panUpper, excludeUserId] : [panUpper]),
  ]);
  return g.rows.length > 0 || s.rows.length > 0 || i.rows.length > 0;
}

// ── REGISTER ─────────────────────────────────────────────────────────────────

async function handleRegister(req, res, expectedRole) {
  try {
    const {
      name, email, password,
      company_website, description, gst_number, additional_email,
      mobile_primary, mobile_secondary, company_name,
      parent_company, year_established, industry,
      pan_number,
    } = req.body;

    const role = expectedRole || req.body.role;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Short description is required' });
    }
    if (!['GCC', 'STARTUP', 'INCUBATION'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // PAN validation — mandatory
    if (!pan_number || !pan_number.trim()) {
      return res.status(400).json({ message: 'Company PAN number is required' });
    }
    const panUpper = pan_number.trim().toUpperCase();
    if (!PAN_REGEX.test(panUpper)) {
      return res.status(400).json({ message: 'Invalid PAN format. Expected: 5 letters + 4 digits + 1 letter (e.g. AABCE1234F)' });
    }
    if (await isPanTaken(panUpper)) {
      return res.status(409).json({ message: 'This PAN number is already registered with another account' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, approval_status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id, email, name, role, approval_status, created_at`,
      [email.trim().toLowerCase(), passwordHash, name.trim(), role]
    );
    const user = result.rows[0];

    const website = company_website?.trim() || null;
    const desc = description.trim();
    const gst = gst_number?.trim() || null;
    const addlEmail = additional_email?.trim() || null;
    const mob1 = mobile_primary?.trim() || null;
    const mob2 = mobile_secondary?.trim() || null;
    const coName = company_name?.trim() || null;
    const parentCo = parent_company?.trim() || null;
    const yearEst = year_established != null && year_established !== '' ? parseInt(year_established, 10) : null;
    const yearEstNum = Number.isInteger(yearEst) ? yearEst : null;
    const industryVal = industry?.trim() || null;

    if (role === 'GCC') {
      await query(
        `INSERT INTO gcc_profiles (user_id, company_name, parent_company, year_established, industry, website, description, gst_number, mobile_primary, pan_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [user.id, coName, parentCo, yearEstNum, industryVal, website, desc, gst, mob1, panUpper]
      );
    } else if (role === 'STARTUP') {
      await query(
        `INSERT INTO startup_profiles (user_id, company_name, website, solution_description, gst_number, additional_email, mobile_primary, mobile_secondary, pan_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.id, coName, website, desc, gst, addlEmail, mob1, mob2, panUpper]
      );
    } else {
      await query(
        `INSERT INTO incubation_profiles (user_id, company_name, website, description, gst_number, additional_email, mobile_primary, mobile_secondary, pan_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.id, coName, website, desc, gst, addlEmail, mob1, mob2, panUpper]
      );
    }

    res.status(201).json({
      message: 'Registration successful. Your account is pending admin approval.',
      user: { id: user.id, email: user.email, name: user.name, role: user.role, approvalStatus: user.approval_status, createdAt: user.created_at },
    });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This PAN number is already registered' });
    }
    res.status(500).json({ message: 'Registration failed' });
  }
}

router.post('/register', (req, res) => handleRegister(req, res, null));
router.post('/register/gcc', (req, res) => handleRegister(req, res, 'GCC'));
router.post('/register/startup', (req, res) => handleRegister(req, res, 'STARTUP'));
router.post('/register/incubation', (req, res) => handleRegister(req, res, 'INCUBATION'));

// ── LOGIN ─────────────────────────────────────────────────────────────────────

async function doLogin(req, res, allowedRole, isAdmin = false) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    // Login only with the primary users.email, not additional emails from profile tables
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: isAdmin ? 'Invalid credentials' : 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: isAdmin ? 'Invalid credentials' : 'Invalid email or password' });

    // Role check
    if (allowedRole && user.role !== allowedRole) {
      const msg = isAdmin ? 'Access denied' : `This portal is for ${allowedRole} users only.`;
      return res.status(403).json({ message: msg });
    }

    // Admin bypasses all approval and login_enabled checks
    if (!isAdmin) {
      if (user.approval_status !== 'APPROVED') {
        return res.status(403).json({
          message: 'Your account is pending admin approval.',
          code: 'PENDING_APPROVAL',
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            approvalStatus: user.approval_status,
            managed_by_user_id: user.managed_by_user_id ?? null,
            managed_by_name: user.managed_by_name ?? null,
            managed_by_email: user.managed_by_email ?? null,
            login_enabled: user.login_enabled ?? true,
          },
        });
      }

      // For managed startups: check if incubation has enabled their login
      if (user.managed_by_user_id && user.login_enabled === false) {
        return res.status(403).json({
          message: 'Your login access has been temporarily disabled by your incubation center.',
          code: 'LOGIN_DISABLED',
        });
      }
    }

    res.json(loginResponse(user, makeToken(user)));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
}

// Generic login (backward compat)
router.post('/login', (req, res) => doLogin(req, res, null, false));

// Role-specific logins
router.post('/login/gcc', (req, res) => doLogin(req, res, 'GCC', false));
router.post('/login/startup', (req, res) => doLogin(req, res, 'STARTUP', false));
router.post('/login/incubation', (req, res) => doLogin(req, res, 'INCUBATION', false));

// Admin hidden login
router.post('/login/admin', (req, res) => doLogin(req, res, 'ADMIN', true));

// ── ME ────────────────────────────────────────────────────────────────────────

router.get('/me', authMiddleware, requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT u.id, u.email, u.name, u.role, u.approval_status, u.created_at, u.managed_by_user_id, u.login_enabled,
              manager.name AS managed_by_name, manager.email AS managed_by_email
       FROM users u
       LEFT JOIN users manager ON manager.id = u.managed_by_user_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const u = r.rows[0];
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      approvalStatus: u.approval_status,
      createdAt: u.created_at,
      managed_by_user_id: u.managed_by_user_id ?? null,
      managed_by_name: u.managed_by_name ?? null,
      managed_by_email: u.managed_by_email ?? null,
      login_enabled: u.login_enabled ?? true,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

export default router;
