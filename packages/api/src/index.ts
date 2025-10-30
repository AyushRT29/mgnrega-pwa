import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createClient } from 'redis';
import { Pool } from 'pg';
import pino from 'pino';
import pinoHttp from 'pino-http';

// Routes
import districtRoutes from './routes/districts';
import metricsRoutes from './routes/metrics';
import summaryRoutes from './routes/summary';
import healthRoutes from './routes/health';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { cacheMiddleware } from './middleware/cache';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();

// Database Pool
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis Client
export const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

redis.on('error', (err) => logger.error('Redis error:', err));
redis.connect();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(rateLimiter);

// Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/districts', cacheMiddleware(86400), districtRoutes);
app.use('/api/v1/metrics', metricsRoutes);
app.use('/api/v1/summary', cacheMiddleware(300), summaryRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 API Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await db.end();
  await redis.quit();
  process.exit(0);
});