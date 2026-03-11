import app from './app';
import { pool } from './db/connection';
import { startJobs } from './jobs';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  // Verify DB connection
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err);
    process.exit(1);
  }

  // Start cron jobs
  startJobs();

  app.listen(PORT, () => {
    console.log(`🚀 IPL Predictor API running on http://localhost:${PORT}`);
  });
}

main();
