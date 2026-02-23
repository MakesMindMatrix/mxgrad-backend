-- Add company contact fields for GCC and Startup registration
-- Run with: psql $DATABASE_URL -f src/db/migrations/001_add_company_contact_fields.sql

ALTER TABLE gcc_profiles
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS additional_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mobile_primary VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mobile_secondary VARCHAR(50);

ALTER TABLE startup_profiles
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS additional_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mobile_primary VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mobile_secondary VARCHAR(50);
