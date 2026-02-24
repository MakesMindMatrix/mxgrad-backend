-- GCC profile: alternate contact person (Name, Designation, Work Email, Phone)
ALTER TABLE gcc_profiles
  ADD COLUMN IF NOT EXISTS alternate_contact_person VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alternate_contact_designation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alternate_contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alternate_contact_phone VARCHAR(50);
