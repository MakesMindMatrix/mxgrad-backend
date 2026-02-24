-- Requirement approval flow: GCC posts -> admin approves / sends back / rejects
-- Run this on existing DBs: node -e "require('fs').readFileSync('src/db/migrate-requirement-approval.sql','utf8').split(';').filter(Boolean).forEach(q=>console.log(q.trim()+';'))"
-- Or run with psql: \i src/db/migrate-requirement-approval.sql

ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT_BACK', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS admin_remarks TEXT,
  ADD COLUMN IF NOT EXISTS admin_remarks_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_requirements_approval_status ON requirements(approval_status);
