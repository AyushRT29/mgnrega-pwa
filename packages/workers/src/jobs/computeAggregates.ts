export async function computeAggregates(db: Pool, logger: Logger) {
  logger.info('Computing pre-aggregates...');

  // Get all districts
  const districts = await db.query(
    `SELECT district_id FROM districts WHERE state = 'Uttar Pradesh'`
  );

  for (const { district_id } of districts.rows) {
    // 3-month averages
    await db.query(
      `INSERT INTO preaggregates (district_id, metric, window, value, calculation_date)
       SELECT 
         $1,
         'households_work_avg',
         '3m',
         AVG(households_work),
         CURRENT_TIMESTAMP
       FROM (
         SELECT households_work FROM monthly_metrics
         WHERE district_id = $1
         ORDER BY year DESC, month DESC
         LIMIT 3
       ) recent
       ON CONFLICT (district_id, metric, window)
       DO UPDATE SET value = EXCLUDED.value, calculation_date = EXCLUDED.calculation_date`,
      [district_id]
    );

    // More aggregates...
    await db.query(
      `INSERT INTO preaggregates (district_id, metric, window, value)
       SELECT 
         $1,
         'person_days_total',
         '3m',
         SUM(person_days)
       FROM (
         SELECT person_days FROM monthly_metrics
         WHERE district_id = $1
         ORDER BY year DESC, month DESC
         LIMIT 3
       ) recent
       ON CONFLICT (district_id, metric, window)
       DO UPDATE SET value = EXCLUDED.value, calculation_date = CURRENT_TIMESTAMP`,
      [district_id]
    );
  }

  logger.info('✅ Pre-aggregates computed');
}
