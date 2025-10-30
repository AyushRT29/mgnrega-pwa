import { Pool } from 'pg';
import { Logger } from 'pino';
import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Configure axios with retries
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429;
  }
});

// S3 client for DigitalOcean Spaces
const s3Client = new S3Client({
  endpoint: `https://${process.env.S3_ENDPOINT}`,
  region: 'us-east-1', // DO Spaces uses this
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!
  }
});

// Schema for data.gov.in API response
const apiRecordSchema = z.object({
  state: z.string(),
  district_code: z.string().optional(),
  district_name: z.string(),
  financial_year: z.string(),
  month: z.string(),
  total_households_worked: z.coerce.number(),
  total_persondays_generated: z.coerce.number(),
  average_days_per_household: z.coerce.number().optional(),
  total_no_of_works: z.coerce.number().optional(),
  // Add more fields as per actual API
});

export async function nightlySync(db: Pool, logger: Logger) {
  const jobId = await logJobStart(db, 'nightly_sync');
  
  try {
    logger.info('Fetching data from data.gov.in API...');
    
    const apiKey = process.env.DATAGOVIN_API_KEY;
    if (!apiKey) {
      throw new Error('DATAGOVIN_API_KEY not configured');
    }

    const baseUrl = process.env.DATAGOVIN_BASE_URL || 'https://api.data.gov.in';
    const resourceId = process.env.MGNREGA_RESOURCE_ID; // Get from env
    
    let allRecords: any[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    // Fetch paginated data
    while (hasMore) {
      const url = `${baseUrl}/resource/${resourceId}`;
      const params = {
        'api-key': apiKey,
        format: 'json',
        offset,
        limit,
        'filters[state]': 'Uttar Pradesh'
      };

      logger.info(`Fetching records ${offset} to ${offset + limit}`);
      
      const response = await axios.get(url, { 
        params,
        timeout: 30000 
      });

      const records = response.data.records || [];
      
      if (records.length === 0) {
        hasMore = false;
      } else {
        allRecords = allRecords.concat(records);
        offset += limit;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Safety limit
      if (offset > 100000) {
        logger.warn('Hit safety limit of 100k records');
        break;
      }
    }

    logger.info(`Fetched ${allRecords.length} records from API`);

    // Validate and normalize records
    const normalizedRecords = await normalizeRecords(allRecords, db, logger);

    // Upsert to database
    let inserted = 0;
    let updated = 0;

    for (const record of normalizedRecords) {
      const result = await db.query(
        `INSERT INTO monthly_metrics (
          district_id, year, month, households_work, person_days,
          avg_days_per_household, total_payments_due, payments_completed,
          payments_on_time, payments_on_time_pct, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gov_api')
        ON CONFLICT (district_id, year, month) 
        DO UPDATE SET
          households_work = EXCLUDED.households_work,
          person_days = EXCLUDED.person_days,
          avg_days_per_household = EXCLUDED.avg_days_per_household,
          source = EXCLUDED.source,
          last_updated = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted`,
        [
          record.district_id,
          record.year,
          record.month,
          record.households_work,
          record.person_days,
          record.avg_days_per_household,
          record.total_payments_due || 0,
          record.payments_completed || 0,
          record.payments_on_time || 0,
          record.payments_on_time_pct || 0
        ]
      );

      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
    }

    logger.info(`Inserted: ${inserted}, Updated: ${updated}`);

    // Create CSV snapshot and upload to S3
    await createSnapshot(db, logger);

    await logJobComplete(db, jobId, allRecords.length, inserted, updated);
    
  } catch (error) {
    logger.error('Nightly sync failed:', error);
    await logJobFailed(db, jobId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

async function normalizeRecords(records: any[], db: Pool, logger: Logger): Promise<any[]> {
  // Load district mapping
  const districtMap = new Map<string, string>();
  const result = await db.query(
    `SELECT district_name, district_id FROM districts WHERE state = 'Uttar Pradesh'`
  );
  
  result.rows.forEach(row => {
    districtMap.set(row.district_name.toLowerCase().trim(), row.district_id);
  });

  const normalized: any[] = [];

  for (const record of records) {
    try {
      // Normalize district name
      const districtName = record.district_name?.toLowerCase().trim();
      const districtId = districtMap.get(districtName);

      if (!districtId) {
        logger.warn(`Unknown district: ${record.district_name}`);
        continue;
      }

      // Parse year and month
      const [year, month] = parseYearMonth(record.financial_year, record.month);

      if (!year || !month) {
        logger.warn(`Invalid date: ${record.financial_year} ${record.month}`);
        continue;
      }

      normalized.push({
        district_id: districtId,
        year,
        month,
        households_work: record.total_households_worked || 0,
        person_days: record.total_persondays_generated || 0,
        avg_days_per_household: record.average_days_per_household || 
          (record.total_persondays_generated / (record.total_households_worked || 1)),
        total_payments_due: record.total_payments_due || 0,
        payments_completed: record.payments_completed || 0,
        payments_on_time: record.payments_on_time || 0,
        payments_on_time_pct: record.payments_on_time_pct || 0
      });
    } catch (error) {
      logger.warn(`Failed to normalize record:`, error);
    }
  }

  return normalized;
}

function parseYearMonth(fyString: string, monthString: string): [number, number] {
  // Example: "2025-26" and "October" -> [2025, 10]
  const monthMap: Record<string, number> = {
    'april': 4, 'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'january': 1, 'february': 2, 'march': 3
  };

  const month = monthMap[monthString.toLowerCase()] || 0;
  const yearMatch = fyString.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : 0;

  return [year, month];
}

async function createSnapshot(db: Pool, logger: Logger) {
  logger.info('Creating CSV snapshot...');
  
  const result = await db.query(
    `SELECT 
      d.district_name,
      mm.year,
      mm.month,
      mm.households_work,
      mm.person_days,
      mm.avg_days_per_household,
      mm.payments_on_time_pct
    FROM monthly_metrics mm
    JOIN districts d ON mm.district_id = d.district_id
    ORDER BY d.district_name, mm.year DESC, mm.month DESC`
  );

  // Generate CSV
  const headers = ['district_name', 'year', 'month', 'households_work', 
                   'person_days', 'avg_days_per_household', 'payments_on_time_pct'];
  let csv = headers.join(',') + '\n';
  
  result.rows.forEach(row => {
    csv += Object.values(row).join(',') + '\n';
  });

  // Upload to S3
  const today = new Date().toISOString().split('T')[0];
  const key = `snapshots/mgnrega_${today}.csv`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: csv,
    ContentType: 'text/csv'
  }));

  // Log snapshot
  await db.query(
    `INSERT INTO data_snapshots (snapshot_date, s3_path, records_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (snapshot_date) DO UPDATE 
     SET s3_path = EXCLUDED.s3_path, records_count = EXCLUDED.records_count`,
    [today, key, result.rows.length]
  );

  logger.info(`Snapshot uploaded: ${key}`);
}

async function logJobStart(db: Pool, jobType: string): Promise<number> {
  const result = await db.query(
    `INSERT INTO etl_logs (job_type, status) VALUES ($1, 'started') RETURNING id`,
    [jobType]
  );
  return result.rows[0].id;
}

async function logJobComplete(
  db: Pool, 
  jobId: number, 
  processed: number, 
  inserted: number, 
  updated: number
) {
  await db.query(
    `UPDATE etl_logs 
     SET status = 'completed', 
         records_processed = $2,
         records_inserted = $3,
         records_updated = $4,
         completed_at = CURRENT_TIMESTAMP,
         duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))
     WHERE id = $1`,
    [jobId, processed, inserted, updated]
  );
}

async function logJobFailed(db: Pool, jobId: number, errorMessage: string) {
  await db.query(
    `UPDATE etl_logs 
     SET status = 'failed', 
         error_message = $2,
         completed_at = CURRENT_TIMESTAMP,
         duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))
     WHERE id = $1`,
    [jobId, errorMessage]
  );
}
