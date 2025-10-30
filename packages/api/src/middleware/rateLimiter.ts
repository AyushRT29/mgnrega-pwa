import { Request, Response, NextFunction } from 'express';
import { redis } from '../index';

const RATE_LIMIT_WINDOW = 3600; // 1 hour
const RATE_LIMIT_MAX = 1000; // requests per window

export async function rateLimiter(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `ratelimit:${ip}`;
  
  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - current));
    
    if (current > RATE_LIMIT_MAX) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retry_after: await redis.ttl(key)
      });
    }
    
    next();
  } catch (error) {
    // Rate limiter failure shouldn't break the app
    console.error('Rate limiter error:', error);
    next();
  }
}
