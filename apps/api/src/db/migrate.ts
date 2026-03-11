/**
 * migrate.ts — Run schema migration against Neon PostgreSQL
 * Usage: npx ts-node src/db/migrate.ts
 */
import dotenv from 'dotenv';
import path from 'path';
// Try multiple possible .env locations
dotenv.config({ path: path.join(process.cwd(), '../../.env') });
dotenv.config({ path: path.join(process.cwd(), '../../../.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { Pool } from 'pg';
import fs from 'fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🗄️  Connected to Neon PostgreSQL');
    const sqlFile = path.join(__dirname, 'migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    await client.query(sql);
    console.log('✅ Schema migration complete!');

    // Verify tables created
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('📋 Tables created:');
    res.rows.forEach(r => console.log('  •', r.table_name));
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
