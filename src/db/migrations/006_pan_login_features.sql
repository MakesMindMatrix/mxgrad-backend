-- Migration 006: Fix missing requirements columns, add PAN number, login_enabled

-- ── Fix requirements table: add columns that may be missing on older DBs ────────
ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT_BACK', 'REJECTED'));

ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS admin_remarks TEXT;

ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS admin_remarks_at TIMESTAMPTZ;

ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS anonymous_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_requirements_approval_status ON requirements(approval_status);

-- ── Add login_enabled to users (incubation centers can disable startup logins) ─
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Add PAN number to all profile tables ─────────────────────────────────────
ALTER TABLE gcc_profiles
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10) UNIQUE;

ALTER TABLE startup_profiles
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10) UNIQUE;

ALTER TABLE incubation_profiles
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10) UNIQUE;

-- Partial indexes to enforce uniqueness only on non-null values
-- (UNIQUE constraint already covers this, but be explicit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gcc_pan ON gcc_profiles(pan_number) WHERE pan_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_startup_pan ON startup_profiles(pan_number) WHERE pan_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_incubation_pan ON incubation_profiles(pan_number) WHERE pan_number IS NOT NULL;
