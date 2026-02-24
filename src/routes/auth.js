import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authMiddleware, requireAuth, JWT_SECRET } from '../middleware/auth.js';

const router = Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register (GCC or STARTUP only; approval_status = PENDING)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, company_website, description, gst_number, additional_email, mobile_primary, mobile_secondary, company_name, parent_company, year_established, industry } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password and role are required' });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ message: 'Short description is required' });
    }
    const gst = gst_number && typeof gst_number === 'string' ? gst_number.trim() : null;
    const addlEmail = additional_email && typeof additional_email === 'string' ? additional_email.trim() || null : null;
    const mob1 = mobile_primary && typeof mobile_primary === 'string' ? mobile_primary.trim() || null : null;
    const mob2 = mobile_secondary && typeof mobile_secondary === 'string' ? mobile_secondary.trim() || null : null;
    const gccName = company_name && typeof company_name === 'string' ? company_name.trim() || null : null;
    const parentCo = parent_company && typeof parent_company === 'string' ? parent_company.trim() || null : null;
    const yearEst = year_established != null && year_established !== '' ? parseInt(year_established, 10) : null;
    const yearEstNum = Number.isInteger(yearEst) ? yearEst : null;
    const industryVal = industry && typeof industry === 'string' ? industry.trim() || null : null;
    if (!['GCC', 'STARTUP'].includes(role)) {
      return res.status(400).json({ message: 'Role must be GCC or STARTUP' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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

    const website = company_website && typeof company_website === 'string' ? company_website.trim() : null;
    const descTrim = description.trim();

    if (role === 'GCC') {
      await query(
        `INSERT INTO gcc_profiles (user_id, company_name, parent_company, year_established, industry, website, description, gst_number, mobile_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.id, gccName, parentCo, yearEstNum, industryVal, website, descTrim, gst, mob1]
      );
    } else {
      const startupCompanyName = company_name && typeof company_name === 'string' ? company_name.trim() || null : null;
      await query(
        `INSERT INTO startup_profiles (user_id, company_name, website, solution_description, gst_number, additional_email, mobile_primary, mobile_secondary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, startupCompanyName, website, descTrim, gst, addlEmail, mob1, mob2]
      );
    }

    res.status(201).json({
      message: 'Registration successful. Your account is pending admin approval. You will be able to login once approved.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        approvalStatus: user.approval_status,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// Login (only APPROVED users get a token)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, email, password_hash, name, role, approval_status FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Only GCC/STARTUP need to be approved; ADMIN can always login
    if (user.role !== 'ADMIN' && user.approval_status !== 'APPROVED') {
      return res.status(403).json({
        message: 'Your account is pending admin approval. You cannot login until an administrator approves your registration.',
        code: 'PENDING_APPROVAL',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          approvalStatus: user.approval_status,
        },
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        approval_status: user.approval_status,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      expiresIn: JWT_EXPIRES_IN,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        approvalStatus: user.approval_status,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Get current user (optional auth; returns user if token valid)
router.get('/me', authMiddleware, requireAuth, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, email, name, role, approval_status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const u = r.rows[0];
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      approvalStatus: u.approval_status,
      createdAt: u.created_at,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

export default router;
