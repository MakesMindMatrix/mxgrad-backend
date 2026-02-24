-- Users: all registered users (admin, gcc, startup)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'GCC', 'STARTUP')),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);

-- GCC profiles (after approval, GCC can edit)
CREATE TABLE IF NOT EXISTS gcc_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  industry VARCHAR(255),
  location VARCHAR(255),
  size VARCHAR(100),
  description TEXT,
  website VARCHAR(500),
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  linkedin VARCHAR(500),
  parent_company VARCHAR(255),
  headquarters_location VARCHAR(255),
  gcc_locations TEXT,
  year_established INT,
  contact_designation VARCHAR(255),
  contact_email VARCHAR(255),
  gst_number VARCHAR(100),
  additional_email VARCHAR(255),
  mobile_primary VARCHAR(50),
  mobile_secondary VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcc_profiles_user_id ON gcc_profiles(user_id);

-- Startup profiles (tabbed: basic, team, product, engagement, funding)
CREATE TABLE IF NOT EXISTS startup_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  legal_entity_name VARCHAR(255),
  founding_year INT,
  location VARCHAR(255),
  website VARCHAR(500),
  linkedin_page VARCHAR(500),
  contact_phone VARCHAR(50),
  gst_number VARCHAR(100),
  additional_email VARCHAR(255),
  mobile_primary VARCHAR(50),
  mobile_secondary VARCHAR(50),
  founder_names TEXT[],
  team_size INT,
  key_team_members JSONB DEFAULT '[]',
  industry VARCHAR(255),
  target_market VARCHAR(500),
  revenue_stage VARCHAR(100),
  customer_type VARCHAR(50),
  solution_description TEXT,
  primary_offering_type VARCHAR(100),
  deployment_stage VARCHAR(100),
  tech_stack TEXT[] DEFAULT '{}',
  key_features TEXT[] DEFAULT '{}',
  has_patents BOOLEAN DEFAULT FALSE,
  patents_description TEXT,
  co_creation_interests TEXT[] DEFAULT '{}',
  gcc_seeking TEXT[] DEFAULT '{}',
  gcc_co_creation_interest TEXT,
  past_collaborations TEXT,
  funding VARCHAR(100),
  total_funds_raised VARCHAR(100),
  investors TEXT[] DEFAULT '{}',
  accelerator_programs TEXT[] DEFAULT '{}',
  pitch_deck_url VARCHAR(500),
  executive_summary_url VARCHAR(500),
  data_sharing_consent BOOLEAN DEFAULT FALSE,
  profile_completion_percentage INT DEFAULT 0,
  reverification_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_startup_profiles_user_id ON startup_profiles(user_id);

-- Requirements (tech needs posted by GCCs)
CREATE TABLE IF NOT EXISTS requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gcc_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT_BACK', 'REJECTED')),
  admin_remarks TEXT,
  admin_remarks_at TIMESTAMPTZ,
  budget_min DECIMAL(15,2),
  budget_max DECIMAL(15,2),
  budget_currency VARCHAR(10) DEFAULT 'USD',
  timeline_start DATE,
  timeline_end DATE,
  tech_stack TEXT[] DEFAULT '{}',
  skills TEXT[] DEFAULT '{}',
  industry_type VARCHAR(255),
  nda_required BOOLEAN DEFAULT FALSE,
  anonymous_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_gcc_user_id ON requirements(gcc_user_id);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status);
CREATE INDEX IF NOT EXISTS idx_requirements_approval_status ON requirements(approval_status);
CREATE INDEX IF NOT EXISTS idx_requirements_category ON requirements(category);

-- Expressions of interest (startups applying to requirements)
CREATE TABLE IF NOT EXISTS expressions_of_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  startup_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  proposed_budget DECIMAL(15,2),
  proposed_timeline_start DATE,
  proposed_timeline_end DATE,
  portfolio_link VARCHAR(500),
  attachment_path VARCHAR(500),
  attachment_original_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requirement_id, startup_user_id)
);

CREATE INDEX IF NOT EXISTS idx_eoi_requirement_id ON expressions_of_interest(requirement_id);
CREATE INDEX IF NOT EXISTS idx_eoi_startup_user_id ON expressions_of_interest(startup_user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS gcc_profiles_updated_at ON gcc_profiles;
CREATE TRIGGER gcc_profiles_updated_at BEFORE UPDATE ON gcc_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS startup_profiles_updated_at ON startup_profiles;
CREATE TRIGGER startup_profiles_updated_at BEFORE UPDATE ON startup_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS requirements_updated_at ON requirements;
CREATE TRIGGER requirements_updated_at BEFORE UPDATE ON requirements FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS expressions_of_interest_updated_at ON expressions_of_interest;
CREATE TRIGGER expressions_of_interest_updated_at BEFORE UPDATE ON expressions_of_interest FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
