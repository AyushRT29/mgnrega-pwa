import cron from 'node-cron';

console.log('🔧 MGNREGA Worker starting...');

// Placeholder ETL job - runs every hour
cron.schedule('0 * * * *', () => {
  console.log('⏰ Running hourly ETL job...');
  // TODO: Implement data sync from data.gov.in API
});

console.log('✅ Worker ready. Waiting for scheduled jobs...');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('👋 Worker shutting down gracefully...');
  process.exit(0);
});