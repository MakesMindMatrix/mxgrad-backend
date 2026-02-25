-- GCC can accept or reject a proposal (admin-approved EOI)
ALTER TABLE expressions_of_interest
  ADD COLUMN IF NOT EXISTS gcc_response VARCHAR(20) CHECK (gcc_response IN ('ACCEPTED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS gcc_responded_at TIMESTAMPTZ;
