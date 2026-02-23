-- GCC profile: parent company, locations, year, contact details
ALTER TABLE gcc_profiles
  ADD COLUMN IF NOT EXISTS parent_company VARCHAR(255),
  ADD COLUMN IF NOT EXISTS headquarters_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gcc_locations TEXT,
  ADD COLUMN IF NOT EXISTS year_established INT,
  ADD COLUMN IF NOT EXISTS contact_designation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
