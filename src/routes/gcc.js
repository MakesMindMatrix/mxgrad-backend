import { Router } from 'express';
import { authMiddleware, requireAuth, requireApproved, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAuth);
router.use(requireApproved);
router.use(requireRole('GCC'));

// Get GCC profile
router.get('/profile', async (req, res) => {
  try {
    const r = await query('SELECT * FROM gcc_profiles WHERE user_id = $1', [req.user.id]);
    const profile = r.rows[0];
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    console.error('GCC profile get:', err);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

// Normalize optional string: empty or whitespace -> null (allows partial updates; no not-null required for Operational fields)
function optStr(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? null : t;
}
// Mobile/phone: only digits, optional + and spaces; reject if contains letters
function validMobile(v) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const digitsOnly = s.replace(/\s/g, '').replace(/^\+/, '').replace(/-/g, '');
  if (!/^\d+$/.test(digitsOnly)) return undefined;
  return s;
}

// Update GCC profile (partial update; only Standard information fields are encouraged to be filled; Operational optional)
router.put('/profile', async (req, res) => {
  try {
    const {
      company_name,
      industry,
      location,
      size,
      description,
      website,
      contact_person,
      phone,
      linkedin,
      parent_company,
      headquarters_location,
      gcc_locations,
      year_established,
      contact_designation,
      contact_email,
      additional_email,
      mobile_secondary,
      alternate_contact_person,
      alternate_contact_designation,
      alternate_contact_email,
      alternate_contact_phone,
    } = req.body;

    const yearEst = year_established != null && year_established !== '' ? parseInt(year_established, 10) : null;
    const yearEstNum = Number.isInteger(yearEst) ? yearEst : null;

    const phoneVal = optStr(phone);
    const mobileSecVal = validMobile(mobile_secondary);
    const altPhoneVal = validMobile(alternate_contact_phone);
    if (mobile_secondary != null && String(mobile_secondary).trim() !== '' && mobileSecVal === undefined) {
      return res.status(400).json({ message: 'Mobile should contain only digits (and optional + or spaces).' });
    }
    if (alternate_contact_phone != null && String(alternate_contact_phone).trim() !== '' && altPhoneVal === undefined) {
      return res.status(400).json({ message: 'Alternate contact phone should contain only digits (and optional + or spaces).' });
    }

    const r = await query(
      `UPDATE gcc_profiles SET
        company_name = COALESCE($2, company_name),
        industry = COALESCE($3, industry),
        location = COALESCE($4, location),
        size = COALESCE($5, size),
        description = COALESCE($6, description),
        website = COALESCE($7, website),
        contact_person = COALESCE($8, contact_person),
        phone = COALESCE($9, phone),
        linkedin = COALESCE($10, linkedin),
        parent_company = COALESCE($11, parent_company),
        headquarters_location = COALESCE($12, headquarters_location),
        gcc_locations = COALESCE($13, gcc_locations),
        year_established = COALESCE($14, year_established),
        contact_designation = COALESCE($15, contact_designation),
        contact_email = COALESCE($16, contact_email),
        additional_email = COALESCE($17, additional_email),
        mobile_secondary = COALESCE($18, mobile_secondary),
        alternate_contact_person = COALESCE($19, alternate_contact_person),
        alternate_contact_designation = COALESCE($20, alternate_contact_designation),
        alternate_contact_email = COALESCE($21, alternate_contact_email),
        alternate_contact_phone = COALESCE($22, alternate_contact_phone),
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        req.user.id,
        optStr(company_name),
        optStr(industry),
        optStr(location),
        optStr(size),
        optStr(description),
        optStr(website),
        optStr(contact_person),
        phoneVal,
        optStr(linkedin),
        optStr(parent_company),
        optStr(headquarters_location),
        optStr(gcc_locations),
        yearEstNum,
        optStr(contact_designation),
        optStr(contact_email),
        optStr(additional_email),
        mobileSecVal !== undefined ? mobileSecVal : optStr(mobile_secondary),
        optStr(alternate_contact_person),
        optStr(alternate_contact_designation),
        optStr(alternate_contact_email),
        altPhoneVal !== undefined ? altPhoneVal : optStr(alternate_contact_phone),
      ]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('GCC profile update:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// List approved startups (for GCC explore) - similarity/relevance: company name first, then description, then other fields
router.get('/startups', async (req, res) => {
  try {
    const { search, industry } = req.query;
    const searchTrim = search && typeof search === 'string' ? search.trim() : '';
    const hasSearch = searchTrim.length > 0;

    let sql = `
      SELECT u.id, u.name, u.email, p.company_name, p.industry, p.solution_description, p.website, p.location, p.team_size, p.primary_offering_type
      FROM users u
      JOIN startup_profiles p ON p.user_id = u.id
      WHERE u.role = 'STARTUP' AND u.approval_status = 'APPROVED'
    `;
    const params = [];
    let n = 1;
    if (industry && typeof industry === 'string' && industry.trim()) {
      params.push(`%${industry.trim()}%`);
      sql += ` AND (p.industry ILIKE $${n} OR p.primary_offering_type ILIKE $${n})`;
      n += 1;
    }
    if (hasSearch) {
      params.push(`%${searchTrim}%`);
      sql += ` AND (u.name ILIKE $${n} OR p.company_name ILIKE $${n} OR p.solution_description ILIKE $${n} OR p.industry ILIKE $${n})`;
      n += 1;
    }
    if (hasSearch) {
      params.push(searchTrim);
      sql += ` ORDER BY ts_rank(
        setweight(to_tsvector('english', coalesce(p.company_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.solution_description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(u.name, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(p.industry, '')), 'D'),
        plainto_tsquery('english', $${n})
      ) DESC NULLS LAST, u.name ASC`;
    } else {
      sql += ' ORDER BY u.name ASC';
    }
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('GCC startups list:', err);
    res.status(500).json({ message: 'Failed to list startups' });
  }
});

// Received interests: EOI on my requirements (company name + requirement title)
router.get('/interests', async (req, res) => {
  try {
    const r = await query(
      `SELECT e.id, e.requirement_id, e.status AS interest_status, e.created_at,
              r.title AS requirement_title, r.category, r.status AS requirement_status,
              u.name AS startup_name, u.email AS startup_email,
              p.company_name AS startup_company
       FROM expressions_of_interest e
       JOIN requirements r ON r.id = e.requirement_id AND r.gcc_user_id = $1
       JOIN users u ON u.id = e.startup_user_id
       LEFT JOIN startup_profiles p ON p.user_id = u.id
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GCC interests:', err);
    res.status(500).json({ message: 'Failed to list interests' });
  }
});

// Active deals: requirements with status IN_PROGRESS or with at least one ACCEPTED EOI
router.get('/active-deals', async (req, res) => {
  try {
    const r = await query(
      `SELECT r.id, r.title, r.category, r.status, r.updated_at,
              (SELECT COUNT(*) FROM expressions_of_interest e WHERE e.requirement_id = r.id AND e.status = 'ACCEPTED') AS accepted_count
       FROM requirements r
       WHERE r.gcc_user_id = $1 AND (r.status = 'IN_PROGRESS' OR EXISTS (
         SELECT 1 FROM expressions_of_interest e WHERE e.requirement_id = r.id AND e.status = 'ACCEPTED'
       ))
       ORDER BY r.updated_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GCC active deals:', err);
    res.status(500).json({ message: 'Failed to list active deals' });
  }
});

// List my requirements
router.get('/requirements', async (req, res) => {
  try {
    const r = await query(
      `SELECT r.*, (SELECT COUNT(*) FROM expressions_of_interest e WHERE e.requirement_id = r.id) AS interest_count
       FROM requirements r
       WHERE r.gcc_user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GCC requirements list:', err);
    res.status(500).json({ message: 'Failed to list requirements' });
  }
});

// Create requirement
router.post('/requirements', async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      priority,
      budget_min,
      budget_max,
      budget_currency,
      timeline_start,
      timeline_end,
      tech_stack,
      skills,
      industry_type,
      nda_required,
    } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ message: 'Title, description and category are required' });
    }

    const anonId = 'GCC-' + Date.now().toString(36).toUpperCase();
    const r = await query(
      `INSERT INTO requirements (
        gcc_user_id, title, description, category, priority,
        budget_min, budget_max, budget_currency, timeline_start, timeline_end,
        tech_stack, skills, industry_type, nda_required, anonymous_id
      ) VALUES ($1, $2, $3, $4, COALESCE($5, 'MEDIUM'), $6, $7, COALESCE($8, 'USD'),
        $9, $10, $11, $12, $13, COALESCE($14, false), $15)
      RETURNING *`,
      [
        req.user.id,
        title,
        description,
        category,
        priority,
        budget_min || null,
        budget_max || null,
        budget_currency,
        timeline_start || null,
        timeline_end || null,
        tech_stack || [],
        skills || [],
        industry_type || null,
        nda_required,
        anonId,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('GCC requirement create:', err);
    res.status(500).json({ message: 'Failed to create requirement' });
  }
});

// Get single requirement (own)
router.get('/requirements/:id', async (req, res) => {
  try {
    const r = await query(
      'SELECT * FROM requirements WHERE id = $1 AND gcc_user_id = $2',
      [req.params.id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found' });
    const reqRow = r.rows[0];
    const eoi = await query(
      'SELECT e.*, u.name as startup_name, u.email as startup_email FROM expressions_of_interest e JOIN users u ON u.id = e.startup_user_id WHERE e.requirement_id = $1',
      [req.params.id]
    );
    res.json({ ...reqRow, applications: eoi.rows });
  } catch (err) {
    console.error('GCC requirement get:', err);
    res.status(500).json({ message: 'Failed to get requirement' });
  }
});

// Update requirement (when SENT_BACK, resubmitting sets approval_status back to PENDING_APPROVAL)
router.put('/requirements/:id', async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      priority,
      status,
      budget_min,
      budget_max,
      timeline_start,
      timeline_end,
      tech_stack,
      skills,
      industry_type,
      nda_required,
      resubmit,
    } = req.body;

    const existing = await query('SELECT id, approval_status FROM requirements WHERE id = $1 AND gcc_user_id = $2', [req.params.id, req.user.id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Requirement not found' });
    const isResubmit = resubmit === true && existing.rows[0].approval_status === 'SENT_BACK';

    const budgetMinNum = budget_min != null && budget_min !== '' ? Number(budget_min) : null;
    const budgetMaxNum = budget_max != null && budget_max !== '' ? Number(budget_max) : null;
    const budget_min_safe = budgetMinNum != null && !Number.isNaN(budgetMinNum) ? budgetMinNum : null;
    const budget_max_safe = budgetMaxNum != null && !Number.isNaN(budgetMaxNum) ? budgetMaxNum : null;

    const r = await query(
      `UPDATE requirements SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        category = COALESCE($4, category),
        priority = COALESCE($5, priority),
        status = COALESCE($6, status),
        budget_min = COALESCE($7, budget_min),
        budget_max = COALESCE($8, budget_max),
        timeline_start = COALESCE($9, timeline_start),
        timeline_end = COALESCE($10, timeline_end),
        tech_stack = COALESCE($11, tech_stack),
        skills = COALESCE($12, skills),
        industry_type = COALESCE($13, industry_type),
        nda_required = COALESCE($14, nda_required),
        approval_status = CASE WHEN $15::boolean THEN 'PENDING_APPROVAL' ELSE approval_status END,
        admin_remarks = CASE WHEN $15::boolean THEN NULL ELSE admin_remarks END,
        admin_remarks_at = CASE WHEN $15::boolean THEN NULL ELSE admin_remarks_at END,
        updated_at = NOW()
       WHERE id = $1 AND gcc_user_id = $16
       RETURNING *`,
      [
        req.params.id,
        title,
        description,
        category,
        priority,
        status,
        budget_min_safe,
        budget_max_safe,
        timeline_start,
        timeline_end,
        tech_stack,
        skills,
        industry_type,
        nda_required,
        isResubmit,
        req.user.id,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('GCC requirement update:', err);
    res.status(500).json({ message: 'Failed to update requirement' });
  }
});

// Delete requirement
router.delete('/requirements/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM requirements WHERE id = $1 AND gcc_user_id = $2 RETURNING id', [
      req.params.id,
      req.user.id,
    ]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found' });
    res.status(204).send();
  } catch (err) {
    console.error('GCC requirement delete:', err);
    res.status(500).json({ message: 'Failed to delete requirement' });
  }
});

export default router;
