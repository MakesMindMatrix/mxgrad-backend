import { Router } from 'express';
import { authMiddleware, requireAuth, requireApproved } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAuth);
router.use(requireApproved);

// Get my profile (GCC or Startup profile data based on role)
router.get('/profile', async (req, res) => {
  try {
    const { id, role } = req.user;
    if (role === 'GCC') {
      const r = await query(
        'SELECT * FROM gcc_profiles WHERE user_id = $1',
        [id]
      );
      const profile = r.rows[0] || null;
      return res.json(profile);
    }
    if (role === 'STARTUP') {
      const r = await query(
        'SELECT * FROM startup_profiles WHERE user_id = $1',
        [id]
      );
      const profile = r.rows[0] || null;
      return res.json(profile);
    }
    res.json(null);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

export default router;
