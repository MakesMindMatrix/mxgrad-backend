import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query } from './pool.js';

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@gccstartup.local';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const name = process.env.ADMIN_NAME || 'Portal Admin';

  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO users (email, password_hash, name, role, approval_status)
     VALUES ($1, $2, $3, 'ADMIN', 'APPROVED')
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, name]
  );
  console.log('Admin user seeded. Login with:', email, '/', password);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
