-- Add document attachment to expressions of interest (proposals)
ALTER TABLE expressions_of_interest
  ADD COLUMN IF NOT EXISTS attachment_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS attachment_original_name VARCHAR(255);
