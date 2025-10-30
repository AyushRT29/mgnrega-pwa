import { Router } from 'express';
import { z } from 'zod';
import { db } from '../index';
import { cacheMiddleware } from '../middleware/cache';

const router = Router();

const metricsQuerySchema = z.object({
  district_id: z.string(),
  from: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  to: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

// GET /api/v1/metrics?district_id=UP_AGR&from=2025-08&to=2025-10
router.get('/', cacheMiddleware(3600), async (req, res, next) => {
  try {
    const { district_id, from, to } = metricsQuerySchema.parse(req.query);
    
    const [fromYear, fromMonth] = from.split('-').map(Number);
    const [toYear, toMonth] = to ? to.split('-').map(Number) : [fromYear, fromMonth];

    const result = await db.query(
      `SELECT 
        year,
        month,
        households_work,
        person_days,
        avg_days_per_household,
        total_payments_due,
        payments_completed,
        payments_on_time,
        payments_on_time_pct,
        women_person_days,
        total_expenditure_lakhs,
        wage_expenditure_lakhs,
        source,
        last_updated
      FROM monthly_metrics
      WHERE district_id = $1
        AND (year > $2 OR (year = $2 AND month >= $3))
        AND (year < $4 OR (year = $4 AND month <= $5))
      ORDER BY year DESC, month DESC`,
      [district_id, fromYear, fromMonth, toYear, toMonth]
    );

    // Calculate trends
    const data = result.rows;
    const trends = data.length >= 2 ? {
      person_days_change_pct: calculatePercentChange(
        data[1]?.person_days,
        data[0]?.person_days
      ),
      households_change_pct: calculatePercentChange(
        data[1]?.households_work,
        data[0]?.households_work
      ),
      payment_performance_change: (
        (data[0]?.payments_on_time_pct || 0) - 
        (data[1]?.payments_on_time_pct || 0)
      ).toFixed(2)
    } : null;

    res.json({
      success: true,
      district_id,
      period: { from, to: to || from },
      count: data.length,
      trends,
      data
    });
  } catch (error) {
    next(error);
  }
});

function calculatePercentChange(old: number, current: number): string {
  if (!old || !current) return '0.00';
  return (((current - old) / old) * 100).toFixed(2);
}

export default router;
