import cron from 'node-cron';
import { Pool } from 'pg';
import pino from 'pino';
import { nightlySync } from './jobs/nightlySync';
import { generateTTS } from './jobs/generateTTS';
import { computeAggregates } from './jobs/computeAggregates';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

// Schedule jobs
logger.info('🔧 ETL Worker starting...');

// Nightly sync at 00:30 IST
cron.schedule('30 0 * * *', async () => {
  logger.info('Starting nightly sync job');
  try {
    await nightlySync(db, logger);
    await computeAggregates(db, logger);
    await generateTTS(db, logger);
    logger.info('✅ Nightly sync completed');
  } catch (error) {
    logger.error('❌ Nightly sync failed:', error);
  }
}, {
  timezone: 'Asia/Kolkata'
});

// Aggregate computation every 6 hours
cron.schedule('0 */6 * * *', async () => {
  logger.info('Starting aggregate computation');
  try {
    await computeAggregates(db, logger);
    logger.info('✅ Aggregates updated');
  } catch (error) {
    logger.error('❌ Aggregate computation failed:', error);
  }
});

logger.info('✅ ETL Worker scheduled and running');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker');
  await db.end();
  process.exit(0);
});
