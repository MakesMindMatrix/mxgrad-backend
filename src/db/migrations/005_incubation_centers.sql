-- Add incubation center role and startup ownership linkage

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS managed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'GCC', 'STARTUP', 'INCUBATION'));

CREATE INDEX IF NOT EXISTS idx_users_managed_by_user_id ON users(managed_by_user_id);

CREATE TABLE IF NOT EXISTS incubation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  website VARCHAR(500),
  description TEXT,
  location VARCHAR(255),
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  gst_number VARCHAR(100),
  additional_email VARCHAR(255),
  mobile_primary VARCHAR(50),
  mobile_secondary VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incubation_profiles_user_id ON incubation_profiles(user_id);

DROP TRIGGER IF EXISTS incubation_profiles_updated_at ON incubation_profiles;
CREATE TRIGGER incubation_profiles_updated_at
BEFORE UPDATE ON incubation_profiles
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
