import { Router } from 'express';
import { authMiddleware, requireAuth, requireApproved, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAuth);
router.use(requireApproved);
router.use(requireRole('STARTUP'));

// Get startup profile (full, for tabbed edit)
router.get('/profile', async (req, res) => {
  try {
    const r = await query('SELECT * FROM startup_profiles WHERE user_id = $1', [req.user.id]);
    const profile = r.rows[0];
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    console.error('Startup profile get:', err);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

// Update startup profile (accepts full tabbed payload)
router.put('/profile', async (req, res) => {
  try {
    const body = req.body;
    const r = await query(
      `UPDATE startup_profiles SET
        company_name = COALESCE($2, company_name),
        legal_entity_name = COALESCE($3, legal_entity_name),
        founding_year = COALESCE($4, founding_year),
        location = COALESCE($5, location),
        website = COALESCE($6, website),
        linkedin_page = COALESCE($7, linkedin_page),
        contact_phone = COALESCE($8, contact_phone),
        founder_names = COALESCE($9, founder_names),
        team_size = COALESCE($10, team_size),
        key_team_members = COALESCE($11, key_team_members),
        industry = COALESCE($12, industry),
        target_market = COALESCE($13, target_market),
        revenue_stage = COALESCE($14, revenue_stage),
        customer_type = COALESCE($15, customer_type),
        solution_description = COALESCE($16, solution_description),
        primary_offering_type = COALESCE($17, primary_offering_type),
        deployment_stage = COALESCE($18, deployment_stage),
        tech_stack = COALESCE($19, tech_stack),
        key_features = COALESCE($20, key_features),
        has_patents = COALESCE($21, has_patents),
        patents_description = COALESCE($22, patents_description),
        co_creation_interests = COALESCE($23, co_creation_interests),
        gcc_seeking = COALESCE($24, gcc_seeking),
        gcc_co_creation_interest = COALESCE($25, gcc_co_creation_interest),
        past_collaborations = COALESCE($26, past_collaborations),
        funding = COALESCE($27, funding),
        total_funds_raised = COALESCE($28, total_funds_raised),
        investors = COALESCE($29, investors),
        accelerator_programs = COALESCE($30, accelerator_programs),
        pitch_deck_url = COALESCE($31, pitch_deck_url),
        executive_summary_url = COALESCE($32, executive_summary_url),
        data_sharing_consent = COALESCE($33, data_sharing_consent),
        profile_completion_percentage = COALESCE($34, profile_completion_percentage),
        reverification_required = FALSE,
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        req.user.id,
        body.company_name,
        body.legal_entity_name,
        body.founding_year,
        body.location,
        body.website,
        body.linkedin_page,
        body.contact_phone,
        body.founder_names,
        body.team_size,
        body.key_team_members != null ? body.key_team_members : null,
        body.industry,
        body.target_market,
        body.revenue_stage,
        body.customer_type,
        body.solution_description,
        body.primary_offering_type,
        body.deployment_stage,
        body.tech_stack,
        body.key_features,
        body.has_patents,
        body.patents_description,
        body.co_creation_interests,
        body.gcc_seeking,
        body.gcc_co_creation_interest,
        body.past_collaborations,
        body.funding,
        body.total_funds_raised,
        body.investors,
        body.accelerator_programs,
        body.pitch_deck_url,
        body.executive_summary_url,
        body.data_sharing_consent,
        body.profile_completion_percentage,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Profile not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Startup profile update:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

export default router;
