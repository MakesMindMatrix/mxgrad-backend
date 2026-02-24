import { Router } from 'express';
import { authMiddleware, requireAuth, requireApproved, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAuth);
router.use(requireApproved);
router.use(requireRole('ADMIN'));

// List pending approvals (GCC and STARTUP with approval_status = PENDING)
router.get('/approvals', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, email, name, role, approval_status, created_at
       FROM users
       WHERE role IN ('GCC', 'STARTUP') AND approval_status = 'PENDING'
       ORDER BY created_at ASC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Admin approvals list:', err);
    res.status(500).json({ message: 'Failed to list pending approvals' });
  }
});

// Approve user
router.post('/approvals/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;
    const r = await query(
      `UPDATE users SET approval_status = 'APPROVED', updated_at = NOW()
       WHERE id = $1 AND role IN ('GCC', 'STARTUP') AND approval_status = 'PENDING'
       RETURNING id, email, name, role, approval_status`,
      [userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ message: 'User not found or already processed' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin approve:', err);
    res.status(500).json({ message: 'Failed to approve' });
  }
});

// Reject user
router.post('/approvals/:userId/reject', async (req, res) => {
  try {
    const { userId } = req.params;
    const r = await query(
      `UPDATE users SET approval_status = 'REJECTED', updated_at = NOW()
       WHERE id = $1 AND role IN ('GCC', 'STARTUP') AND approval_status = 'PENDING'
       RETURNING id, email, name, role, approval_status`,
      [userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ message: 'User not found or already processed' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin reject:', err);
    res.status(500).json({ message: 'Failed to reject' });
  }
});

// List all users; optional ?role=GCC|STARTUP filter
router.get('/users', async (req, res) => {
  try {
    const { role } = req.query;
    let sql = `SELECT id, email, name, role, approval_status, created_at, updated_at
       FROM users WHERE role != 'ADMIN'`;
    const params = [];
    if (role === 'GCC' || role === 'STARTUP') {
      params.push(role);
      sql += ` AND role = $1`;
    }
    sql += ` ORDER BY created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Admin users list:', err);
    res.status(500).json({ message: 'Failed to list users' });
  }
});

// Get one user with full profile (for admin view)
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const u = await query(
      'SELECT id, email, name, role, approval_status, created_at, updated_at FROM users WHERE id = $1 AND role != \'ADMIN\'',
      [userId]
    );
    if (u.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = u.rows[0];
    let profile = null;
    if (user.role === 'GCC') {
      const p = await query('SELECT * FROM gcc_profiles WHERE user_id = $1', [userId]);
      profile = p.rows[0] || null;
    } else if (user.role === 'STARTUP') {
      const p = await query('SELECT * FROM startup_profiles WHERE user_id = $1', [userId]);
      profile = p.rows[0] || null;
    }
    res.json({ user, profile });
  } catch (err) {
    console.error('Admin user get:', err);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

// Update user and profile (admin edit company details)
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, profile: profileData } = req.body;
    const u = await query('SELECT id, role FROM users WHERE id = $1 AND role != \'ADMIN\'', [userId]);
    if (u.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = u.rows[0];

    if (name != null && typeof name === 'string' && name.trim()) {
      await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name.trim(), userId]);
    }
    if (email != null && typeof email === 'string' && email.trim()) {
      const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), userId]);
      if (existing.rows.length > 0) return res.status(409).json({ message: 'Email already in use' });
      await query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email.trim().toLowerCase(), userId]);
    }

    if (profileData && typeof profileData === 'object' && (user.role === 'GCC' || user.role === 'STARTUP')) {
      if (user.role === 'GCC') {
        const gcc = profileData;
        await query(
          `UPDATE gcc_profiles SET
            company_name = COALESCE($2, company_name), industry = COALESCE($3, industry), location = COALESCE($4, location),
            size = COALESCE($5, size), description = COALESCE($6, description), website = COALESCE($7, website),
            contact_person = COALESCE($8, contact_person), phone = COALESCE($9, phone), linkedin = COALESCE($10, linkedin),
            updated_at = NOW()
           WHERE user_id = $1`,
          [userId, gcc.company_name, gcc.industry, gcc.location, gcc.size, gcc.description, gcc.website, gcc.contact_person, gcc.phone, gcc.linkedin]
        );
      } else {
        const sp = profileData;
        await query(
          `UPDATE startup_profiles SET
            company_name = COALESCE($2, company_name), legal_entity_name = COALESCE($3, legal_entity_name),
            founding_year = COALESCE($4, founding_year), location = COALESCE($5, location),
            website = COALESCE($6, website), contact_phone = COALESCE($7, contact_phone),
            industry = COALESCE($8, industry), solution_description = COALESCE($9, solution_description),
            primary_offering_type = COALESCE($10, primary_offering_type), deployment_stage = COALESCE($11, deployment_stage),
            team_size = COALESCE($12, team_size), funding = COALESCE($13, funding), total_funds_raised = COALESCE($14, total_funds_raised),
            updated_at = NOW()
           WHERE user_id = $1`,
          [
            userId, sp.company_name, sp.legal_entity_name, sp.founding_year, sp.location, sp.website, sp.contact_phone,
            sp.industry, sp.solution_description, sp.primary_offering_type, sp.deployment_stage, sp.team_size,
            sp.funding, sp.total_funds_raised,
          ]
        );
      }
    }

    const r = await query('SELECT id, email, name, role, approval_status, updated_at FROM users WHERE id = $1', [userId]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin user update:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// Delete user – erases user and all related data (profiles, requirements, expressions of interest via FK CASCADE)
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const r = await query('DELETE FROM users WHERE id = $1 AND role != \'ADMIN\' RETURNING id', [userId]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'User not found or cannot delete admin' });
    res.status(204).send();
  } catch (err) {
    console.error('Admin user delete:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Request reverification for startup (sends them back to update profile)
router.post('/users/:userId/request-reverification', async (req, res) => {
  try {
    const { userId } = req.params;
    const u = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (u.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    if (u.rows[0].role !== 'STARTUP') return res.status(400).json({ message: 'Only startups can be sent for reverification' });
    await query('UPDATE startup_profiles SET reverification_required = true, updated_at = NOW() WHERE user_id = $1', [userId]);
    res.json({ message: 'Reverification requested. Startup will be prompted to update their profile.' });
  } catch (err) {
    console.error('Admin request reverification:', err);
    res.status(500).json({ message: 'Failed to request reverification' });
  }
});

// User counts and summary for admin dashboard
router.get('/stats', async (req, res) => {
  try {
    const [users, pending, pendingReqs, requirements, eoi] = await Promise.all([
      query('SELECT COUNT(*) AS total FROM users WHERE role IN (\'GCC\', \'STARTUP\')'),
      query('SELECT COUNT(*) AS total FROM users WHERE role IN (\'GCC\', \'STARTUP\') AND approval_status = \'PENDING\''),
      query("SELECT COUNT(*) AS total FROM requirements WHERE approval_status = 'PENDING_APPROVAL'"),
      query("SELECT COUNT(*) AS total FROM requirements WHERE status = 'OPEN' AND approval_status = 'APPROVED'"),
      query('SELECT COUNT(*) AS total FROM expressions_of_interest WHERE status = \'PENDING\''),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0]?.total ?? 0, 10),
      pendingApprovals: parseInt(pending.rows[0]?.total ?? 0, 10),
      pendingRequirementApprovals: parseInt(pendingReqs.rows[0]?.total ?? 0, 10),
      openRequirements: parseInt(requirements.rows[0]?.total ?? 0, 10),
      pendingInterests: parseInt(eoi.rows[0]?.total ?? 0, 10),
    });
  } catch (err) {
    console.error('Admin stats:', err);
    res.status(500).json({ message: 'Failed to get stats' });
  }
});

// Recent activity: recent requirements posted, recent expressions of interest
router.get('/activities', async (req, res) => {
  try {
    const limitNum = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitNum) && limitNum > 0 ? Math.min(limitNum, 100) : 50;
    const [reqs, interests] = await Promise.all([
      query(
        `SELECT r.id, r.title, r.category, r.status, r.created_at, u.name AS gcc_name, u.email AS gcc_email
         FROM requirements r
         JOIN users u ON u.id = r.gcc_user_id
         ORDER BY r.created_at DESC LIMIT $1`,
        [limit]
      ),
      query(
        `SELECT e.id, e.message, e.status, e.created_at, r.title AS requirement_title, u.name AS startup_name, u.email AS startup_email
         FROM expressions_of_interest e
         JOIN requirements r ON r.id = e.requirement_id
         JOIN users u ON u.id = e.startup_user_id
         ORDER BY e.created_at DESC LIMIT $1`,
        [limit]
      ),
    ]);
    res.json({
      requirements: reqs.rows,
      expressionsOfInterest: interests.rows,
    });
  } catch (err) {
    console.error('Admin activities:', err);
    res.status(500).json({ message: 'Failed to get activities' });
  }
});

// Requirement approvals: list pending, approve, send back with remarks, reject with remarks
router.get('/requirement-approvals', async (req, res) => {
  try {
    const r = await query(
      `SELECT r.id, r.gcc_user_id, r.title, r.description, r.category, r.priority, r.status,
              r.approval_status, r.admin_remarks, r.admin_remarks_at, r.created_at,
              u.name AS gcc_name, u.email AS gcc_email
       FROM requirements r
       JOIN users u ON u.id = r.gcc_user_id
       WHERE r.approval_status = 'PENDING_APPROVAL'
       ORDER BY r.created_at ASC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Admin requirement approvals list:', err);
    res.status(500).json({ message: 'Failed to list requirement approvals' });
  }
});

router.post('/requirement-approvals/:requirementId/approve', async (req, res) => {
  try {
    const { requirementId } = req.params;
    const r = await query(
      `UPDATE requirements
       SET approval_status = 'APPROVED', admin_remarks = NULL, admin_remarks_at = NULL, updated_at = NOW()
       WHERE id = $1 AND approval_status = 'PENDING_APPROVAL'
       RETURNING id, title, approval_status`,
      [requirementId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found or already processed' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin requirement approve:', err);
    res.status(500).json({ message: 'Failed to approve requirement' });
  }
});

router.post('/requirement-approvals/:requirementId/send-back', async (req, res) => {
  try {
    const { requirementId } = req.params;
    const remarks = req.body?.remarks != null ? String(req.body.remarks).trim() : '';
    const r = await query(
      `UPDATE requirements
       SET approval_status = 'SENT_BACK', admin_remarks = $2, admin_remarks_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND approval_status = 'PENDING_APPROVAL'
       RETURNING id, title, approval_status, admin_remarks, admin_remarks_at`,
      [requirementId, remarks || null]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found or already processed' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin requirement send-back:', err);
    res.status(500).json({ message: 'Failed to send back requirement' });
  }
});

router.post('/requirement-approvals/:requirementId/reject', async (req, res) => {
  try {
    const { requirementId } = req.params;
    const remarks = req.body?.remarks != null ? String(req.body.remarks).trim() : '';
    const r = await query(
      `UPDATE requirements
       SET approval_status = 'REJECTED', admin_remarks = $2, admin_remarks_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND approval_status = 'PENDING_APPROVAL'
       RETURNING id, title, approval_status, admin_remarks, admin_remarks_at`,
      [requirementId, remarks || null]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Requirement not found or already processed' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Admin requirement reject:', err);
    res.status(500).json({ message: 'Failed to reject requirement' });
  }
});

// Active projects: requirements with status IN_PROGRESS (or OPEN with interests)
router.get('/active-projects', async (req, res) => {
  try {
    const r = await query(
      `SELECT r.id, r.title, r.category, r.status, r.created_at, r.updated_at,
              u.name AS gcc_name, u.email AS gcc_email,
              (SELECT COUNT(*) FROM expressions_of_interest e WHERE e.requirement_id = r.id) AS interest_count
       FROM requirements r
       JOIN users u ON u.id = r.gcc_user_id
       WHERE r.status IN ('OPEN', 'IN_PROGRESS')
       ORDER BY r.updated_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Admin active projects:', err);
    res.status(500).json({ message: 'Failed to get active projects' });
  }
});

export default router;
