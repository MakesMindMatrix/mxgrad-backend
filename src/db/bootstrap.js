import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');
const migrationsDir = path.join(__dirname, 'migrations');

function readSql(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applySchema(client) {
  const schemaSql = readSql(schemaPath);
  await client.query(schemaSql);
}

async function hasCoreSchema(client) {
  const result = await client.query(`
    SELECT to_regclass('public.users') AS users_table,
           to_regclass('public.requirements') AS requirements_table
  `);

  const row = result.rows[0] || {};
  return Boolean(row.users_table && row.requirements_table);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyPendingMigrations(client) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations(client);
  const newlyApplied = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const migrationSql = readSql(path.join(migrationsDir, file));
    await client.query(migrationSql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    newlyApplied.push(file);
  }

  return newlyApplied;
}

export async function bootstrapDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gcc_startup_portal_schema_bootstrap'))");
    await ensureMigrationsTable(client);
    const schemaExists = await hasCoreSchema(client);
    if (!schemaExists) {
      await applySchema(client);
    }
    const appliedMigrations = await applyPendingMigrations(client);
    await client.query('COMMIT');

    console.log('Database bootstrap complete.', {
      mode: schemaExists ? 'upgrade' : 'fresh-install',
      schema: path.basename(schemaPath),
      appliedMigrations,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
