-- Allow admin to send startups back for reverification
ALTER TABLE startup_profiles
  ADD COLUMN IF NOT EXISTS reverification_required BOOLEAN DEFAULT FALSE;
