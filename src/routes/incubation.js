import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, requireAuth, requireApproved, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

async function isPanTaken(pan) {
  const panUpper = pan.toUpperCase();
  const [g, s, i] = await Promise.all([
    query('SELECT 1 FROM gcc_profiles WHERE pan_number = $1', [panUpper]),
    query('SELECT 1 FROM startup_profiles WHERE pan_number = $1', [panUpper]),
    query('SELECT 1 FROM incubation_profiles WHERE pan_number = $1', [panUpper]),
  ]);
  return g.rows.length > 0 || s.rows.length > 0 || i.rows.length > 0;
}

router.use(authMiddleware);
router.use(requireAuth);
router.use(requireApproved);
router.use(requireRole('INCUBATION'));

function optStr(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? null : t;
}

router.get('/profile', async (req, res) => {
  try {
    const r = await query('SELECT * FROM incubation_profiles WHERE user_id = $1', [req.user.id]);
    const profile = r.rows[0];
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    console.error('Incubation profile get:', err);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const {
      company_name,
      website,
      description,
      location,
      contact_person,
      phone,
      gst_number,
      additional_email,
      mobile_primary,
      mobile_secondary,
    } = req.body;

    const r = await query(
      `UPDATE incubation_profiles SET
        company_name = COALESCE($2, company_name),
        website = COALESCE($3, website),
        description = COALESCE($4, description),
        location = COALESCE($5, location),
        contact_person = COALESCE($6, contact_person),
        phone = COALESCE($7, phone),
        gst_number = COALESCE($8, gst_number),
        additional_email = COALESCE($9, additional_email),
        mobile_primary = COALESCE($10, mobile_primary),
        mobile_secondary = COALESCE($11, mobile_secondary),
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        req.user.id,
        optStr(company_name),
        optStr(website),
        optStr(description),
        optStr(location),
        optStr(contact_person),
        optStr(phone),
        optStr(gst_number),
        optStr(additional_email),
        optStr(mobile_primary),
        optStr(mobile_secondary),
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Profile not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Incubation profile update:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.get('/startups', async (req, res) => {
  try {
    const approvalStatus = req.query.approval_status && typeof req.query.approval_status === 'string'
      ? req.query.approval_status.trim()
      : '';
    const params = [req.user.id];
    let sql = `
      SELECT u.id, u.name, u.email, u.approval_status, u.login_enabled, u.created_at,
             p.company_name, p.website, p.industry, p.solution_description, p.location, p.pan_number
      FROM users u
      JOIN startup_profiles p ON p.user_id = u.id
      WHERE u.role = 'STARTUP' AND u.managed_by_user_id = $1
    `;
    if (approvalStatus) {
      params.push(approvalStatus);
      sql += ` AND u.approval_status = $2`;
    }
    sql += ' ORDER BY u.created_at DESC';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Incubation startups list:', err);
    res.status(500).json({ message: 'Failed to list managed startups' });
  }
});

router.post('/startups', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      company_name,
      company_website,
      description,
      gst_number,
      additional_email,
      mobile_primary,
      mobile_secondary,
      pan_number,
    } = req.body || {};

    if (!name || !email || !password || !description) {
      return res.status(400).json({ message: 'Name, email, password and short description are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (!pan_number || !String(pan_number).trim()) {
      return res.status(400).json({ message: 'Company PAN number is required' });
    }
    const panUpper = String(pan_number).trim().toUpperCase();
    if (!PAN_REGEX.test(panUpper)) {
      return res.status(400).json({ message: 'Invalid PAN format. Expected: 5 letters + 4 digits + 1 letter (e.g. AABCE1234F)' });
    }
    if (await isPanTaken(panUpper)) {
      return res.status(409).json({ message: 'This PAN number is already registered with another account' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const userResult = await query(
      `INSERT INTO users (email, password_hash, name, role, approval_status, managed_by_user_id)
       VALUES ($1, $2, $3, 'STARTUP', 'PENDING', $4)
       RETURNING id, email, name, role, approval_status, created_at`,
      [String(email).trim().toLowerCase(), passwordHash, String(name).trim(), req.user.id]
    );
    const user = userResult.rows[0];

    await query(
      `INSERT INTO startup_profiles (user_id, company_name, website, solution_description, gst_number, additional_email, mobile_primary, mobile_secondary, pan_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        user.id,
        optStr(company_name) ?? String(name).trim(),
        optStr(company_website),
        String(description).trim(),
        optStr(gst_number),
        optStr(additional_email),
        optStr(mobile_primary),
        optStr(mobile_secondary),
        panUpper,
      ]
    );

    res.status(201).json({
      message: 'Startup created successfully and sent for admin approval.',
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
    console.error('Incubation startup create:', err);
    res.status(500).json({ message: 'Failed to create startup' });
  }
});

router.patch('/startups/:startupId/login-access', async (req, res) => {
  try {
    const { startupId } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: '"enabled" must be a boolean' });
    }

    // Verify this startup is actually managed by the requesting incubation
    const check = await query(
      `SELECT id FROM users WHERE id = $1 AND role = 'STARTUP' AND managed_by_user_id = $2`,
      [startupId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found or not managed by you' });
    }

    await query('UPDATE users SET login_enabled = $1 WHERE id = $2', [enabled, startupId]);
    res.json({ id: startupId, login_enabled: enabled });
  } catch (err) {
    console.error('Incubation toggle login:', err);
    res.status(500).json({ message: 'Failed to update login access' });
  }
});

router.get('/interests', async (req, res) => {
  try {
    const r = await query(
      `SELECT e.*, r.title AS requirement_title, r.category, r.anonymous_id,
              u.name AS startup_name, p.company_name AS startup_company
       FROM expressions_of_interest e
       JOIN requirements r ON r.id = e.requirement_id
       JOIN users u ON u.id = e.startup_user_id
       LEFT JOIN startup_profiles p ON p.user_id = u.id
       WHERE u.managed_by_user_id = $1
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Incubation interests list:', err);
    res.status(500).json({ message: 'Failed to list proposals' });
  }
});

export default router;
