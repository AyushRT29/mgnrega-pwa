import { Router } from 'express';
import { z } from 'zod';
import { db } from '../index';
import { AppError } from '../utils/errors';

const router = Router();

const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
});

// GET /api/v1/districts?state=Uttar%20Pradesh
router.get('/', async (req, res, next) => {
  try {
    const state = req.query.state as string || 'Uttar Pradesh';
    
    const result = await db.query(
      `SELECT 
        district_id,
        district_name,
        district_name_hi,
        lat,
        lon,
        population_2011
      FROM districts 
      WHERE state = $1 
      ORDER BY district_name`,
      [state]
    );

    res.json({
      success: true,
      count: result.rows.length,
      districts: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/districts/reverse-geocode
router.post('/reverse-geocode', async (req, res, next) => {
  try {
    const { lat, lon } = coordsSchema.parse(req.body);

    const result = await db.query(
      `SELECT * FROM find_district_by_coords($1, $2)`,
      [lat, lon]
    );

    if (result.rows.length === 0) {
      throw new AppError('No district found for coordinates', 404);
    }

    res.json({
      success: true,
      district: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/districts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT * FROM districts WHERE district_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('District not found', 404);
    }

    res.json({
      success: true,
      district: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router;