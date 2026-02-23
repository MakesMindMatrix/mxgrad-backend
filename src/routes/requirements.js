import { Router } from 'express';
import { authMiddleware, requireAuth, requireApproved, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

// Public: list open requirements (for startups to explore) - similarity/relevance search: title first, then description
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, search } = req.query;
    const searchTrim = search && typeof search === 'string' ? search.trim() : '';
    const hasSearch = searchTrim.length > 0;

    let sql = `
      SELECT r.id, r.title, r.description, r.category, r.priority, r.status,
             r.budget_min, r.budget_max, r.budget_currency, r.timeline_start, r.timeline_end,
             r.tech_stack, r.skills, r.industry_type, r.nda_required, r.anonymous_id,
             r.created_at,
             (SELECT COUNT(*) FROM expressions_of_interest e WHERE e.requirement_id = r.id) AS interest_count
      FROM requirements r
      WHERE r.status = 'OPEN'
    `;
    const params = [];
    let n = 1;
    if (category) {
      params.push(category);
      sql += ` AND r.category = $${n++}`;
    }
    if (hasSearch) {
      params.push(`%${searchTrim}%`);
      sql += ` AND (r.title ILIKE $${n} OR r.description ILIKE $${n})`;
      n++;
    }
    if (hasSearch) {
      params.push(searchTrim);
      sql += ` ORDER BY ts_rank(
        setweight(to_tsvector('english', coalesce(r.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(r.description, '')), 'B'),
        plainto_tsquery('english', $${n})
      ) DESC NULLS LAST, r.created_at DESC`;
    } else {
      sql += ' ORDER BY r.created_at DESC';
    }
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Requirements list:', err);
    res.status(500).json({ message: 'Failed to list requirements' });
  }
});

// Get single requirement (public view for startups)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT r.id, r.title, r.description, r.category, r.priority, r.status,
              r.budget_min, r.budget_max, r.budget_currency, r.timeline_start, r.timeline_end,
              r.tech_stack, r.skills, r.industry_type, r.nda_required, r.anonymous_id,
              r.created_at,
              (SELECT COUNT(*) FROM expressions_of_interest e WHERE e.requirement_id = r.id) AS interest_count
       FROM requirements r
       WHERE r.id = $1 AND r.status = 'OPEN'`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Requirement get:', err);
    res.status(500).json({ message: 'Failed to get requirement' });
  }
});

// Express interest (STARTUP only)
router.post('/:id/express-interest', authMiddleware, requireAuth, requireApproved, requireRole('STARTUP'), async (req, res) => {
  try {
    const { message, proposed_budget, proposed_timeline_start, proposed_timeline_end, portfolio_link } = req.body;
    const requirementId = req.params.id;
    const startupUserId = req.user.id;

    const check = await query('SELECT id FROM requirements WHERE id = $1 AND status = $2', [requirementId, 'OPEN']);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Requirement not found or not open' });
    }

    const ins = await query(
      `INSERT INTO expressions_of_interest (requirement_id, startup_user_id, message, proposed_budget, proposed_timeline_start, proposed_timeline_end, portfolio_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (requirement_id, startup_user_id) DO UPDATE SET
         message = EXCLUDED.message,
         proposed_budget = EXCLUDED.proposed_budget,
         proposed_timeline_start = EXCLUDED.proposed_timeline_start,
         proposed_timeline_end = EXCLUDED.proposed_timeline_end,
         portfolio_link = EXCLUDED.portfolio_link,
         status = 'PENDING',
         updated_at = NOW()
       RETURNING *`,
      [requirementId, startupUserId, message || null, proposed_budget || null, proposed_timeline_start || null, proposed_timeline_end || null, portfolio_link || null]
    );
    res.status(201).json(ins.rows[0]);
  } catch (err) {
    console.error('Express interest:', err);
    res.status(500).json({ message: 'Failed to submit interest' });
  }
});

// My expressions of interest (STARTUP)
router.get('/my/interests', authMiddleware, requireAuth, requireApproved, requireRole('STARTUP'), async (req, res) => {
  try {
    const r = await query(
      `SELECT e.*, r.title as requirement_title, r.category, r.anonymous_id
       FROM expressions_of_interest e
       JOIN requirements r ON r.id = e.requirement_id
       WHERE e.startup_user_id = $1
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('My interests:', err);
    res.status(500).json({ message: 'Failed to list interests' });
  }
});

export default router;
