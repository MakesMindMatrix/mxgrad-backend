import { bootstrapDatabase } from './bootstrap.js';
import { pool } from './pool.js';

async function init() {
  await bootstrapDatabase();
  console.log('Database schema initialized.');
  await pool.end();
  process.exit(0);
}

init().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
