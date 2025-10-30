import { Request, Response, NextFunction } from 'express';
import { redis } from '../index';

export function cacheMiddleware(ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `cache:${req.originalUrl}`;
    
    try {
      const cached = await redis.get(key);
      
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
      
      // Monkey-patch res.json to cache response
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        redis.setEx(key, ttlSeconds, JSON.stringify(body))
          .catch(err => console.error('Cache set error:', err));
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };
      
      next();
    } catch (error) {
      // Cache failure shouldn't break the app
      console.error('Cache middleware error:', error);
      next();
    }
  };
}