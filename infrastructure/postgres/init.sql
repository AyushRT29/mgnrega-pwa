-- MGNREGA Database Schema
-- PostgreSQL 16 + PostGIS

-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For text search

-- =====================================================
-- 1. DISTRICTS TABLE
-- =====================================================
CREATE TABLE districts (
    district_id VARCHAR(50) PRIMARY KEY,
    district_name VARCHAR(255) NOT NULL,
    district_name_hi VARCHAR(255) NOT NULL, -- Hindi name
    state VARCHAR(100) NOT NULL DEFAULT 'Uttar Pradesh',
    lat DECIMAL(10, 7),
    lon DECIMAL(10, 7),
    geom GEOMETRY(Point, 4326), -- PostGIS point
    bbox GEOMETRY(Polygon, 4326), -- District boundary
    population_2011 INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_districts_geom ON districts USING GIST(geom);
CREATE INDEX idx_districts_bbox ON districts USING GIST(bbox);
CREATE INDEX idx_districts_name_trgm ON districts USING gin(district_name gin_trgm_ops);

-- =====================================================
-- 2. MONTHLY METRICS TABLE
-- =====================================================
CREATE TABLE monthly_metrics (
    id SERIAL PRIMARY KEY,
    district_id VARCHAR(50) NOT NULL REFERENCES districts(district_id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    
    -- Core Metrics
    households_work BIGINT DEFAULT 0,
    person_days BIGINT DEFAULT 0,
    avg_days_per_household DECIMAL(10, 2),
    
    -- Payment Metrics
    total_payments_due BIGINT DEFAULT 0,
    payments_completed BIGINT DEFAULT 0,
    payments_on_time BIGINT DEFAULT 0,
    payments_on_time_pct DECIMAL(5, 2),
    
    -- Work Category Breakdown (optional)
    sc_person_days BIGINT DEFAULT 0,
    st_person_days BIGINT DEFAULT 0,
    women_person_days BIGINT DEFAULT 0,
    
    -- Financial Metrics
    total_expenditure_lakhs DECIMAL(15, 2),
    wage_expenditure_lakhs DECIMAL(15, 2),
    material_expenditure_lakhs DECIMAL(15, 2),
    
    -- Data Quality
    source VARCHAR(50) DEFAULT 'gov_api', -- 'gov_api' or 'snapshot'
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(district_id, year, month)
);

CREATE INDEX idx_monthly_metrics_district ON monthly_metrics(district_id);
CREATE INDEX idx_monthly_metrics_date ON monthly_metrics(year DESC, month DESC);
CREATE INDEX idx_monthly_metrics_composite ON monthly_metrics(district_id, year DESC, month DESC);

-- =====================================================
-- 3. PRE-AGGREGATES TABLE (for fast queries)
-- =====================================================
CREATE TABLE preaggregates (
    id SERIAL PRIMARY KEY,
    district_id VARCHAR(50) REFERENCES districts(district_id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL, -- e.g., 'households_work_3m_avg'
    window VARCHAR(20) NOT NULL, -- '3m', '12m', 'ytd'
    value DECIMAL(15, 2),
    value_json JSONB, -- For complex aggregates
    calculation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(district_id, metric, window)
);

CREATE INDEX idx_preagg_district_metric ON preaggregates(district_id, metric);
CREATE INDEX idx_preagg_calc_date ON preaggregates(calculation_date DESC);

-- =====================================================
-- 4. DATA SNAPSHOTS TABLE (backup tracking)
-- =====================================================
CREATE TABLE data_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL UNIQUE,
    s3_path VARCHAR(500) NOT NULL, -- Path to CSV in object storage
    records_count INTEGER,
    status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 5. AUDIO CACHE TABLE (pre-generated TTS)
-- =====================================================
CREATE TABLE audio_cache (
    id SERIAL PRIMARY KEY,
    text_key VARCHAR(255) NOT NULL UNIQUE, -- Hash of text + lang
    text_content TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'hi', -- 'hi' or 'en'
    audio_url VARCHAR(500), -- S3 URL
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audio_cache_key ON audio_cache(text_key);

-- =====================================================
-- 6. ETL LOGS TABLE (monitoring)
-- =====================================================
CREATE TABLE etl_logs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL, -- 'nightly_sync', 'hourly_incremental'
    status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
    records_processed INTEGER,
    records_inserted INTEGER,
    records_updated INTEGER,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER
);

CREATE INDEX idx_etl_logs_started ON etl_logs(started_at DESC);

-- =====================================================
-- SEED DATA: Uttar Pradesh Districts
-- =====================================================

-- Note: These are sample districts. Complete list has 75 districts.
-- Coordinates are approximate centroids.

INSERT INTO districts (district_id, district_name, district_name_hi, lat, lon, geom, population_2011) VALUES
('UP_AGR', 'Agra', 'आगरा', 27.1767, 78.0081, ST_SetSRID(ST_MakePoint(78.0081, 27.1767), 4326), 4418797),
('UP_ALL', 'Allahabad', 'इलाहाबाद', 25.4358, 81.8463, ST_SetSRID(ST_MakePoint(81.8463, 25.4358), 4326), 5954391),
('UP_LKO', 'Lucknow', 'लखनऊ', 26.8467, 80.9462, ST_SetSRID(ST_MakePoint(80.9462, 26.8467), 4326), 4589838),
('UP_KNP', 'Kanpur Nagar', 'कानपुर नगर', 26.4499, 80.3319, ST_SetSRID(ST_MakePoint(80.3319, 26.4499), 4326), 4581268),
('UP_GZB', 'Ghaziabad', 'गाजियाबाद', 28.6692, 77.4538, ST_SetSRID(ST_MakePoint(77.4538, 28.6692), 4326), 4681645),
('UP_GBN', 'Gautam Buddha Nagar', 'गौतम बुद्ध नगर', 28.4744, 77.5040, ST_SetSRID(ST_MakePoint(77.5040, 28.4744), 4326), 1648115),
('UP_VNS', 'Varanasi', 'वाराणसी', 25.3176, 82.9739, ST_SetSRID(ST_MakePoint(82.9739, 25.3176), 4326), 3676841),
('UP_MRT', 'Meerut', 'मेरठ', 28.9845, 77.7064, ST_SetSRID(ST_MakePoint(77.7064, 28.9845), 4326), 3443689),
('UP_BRE', 'Bareilly', 'बरेली', 28.3670, 79.4304, ST_SetSRID(ST_MakePoint(79.4304, 28.3670), 4326), 4448359),
('UP_ALD', 'Aligarh', 'अलीगढ़', 27.8974, 78.0880, ST_SetSRID(ST_MakePoint(78.0880, 27.8974), 4326), 3673849);

-- Add more districts... (total 75 for full Uttar Pradesh)

-- =====================================================
-- SEED DATA: Sample Monthly Metrics (Last 3 Months)
-- =====================================================

-- October 2025 data
INSERT INTO monthly_metrics 
(district_id, year, month, households_work, person_days, avg_days_per_household, 
 total_payments_due, payments_completed, payments_on_time, payments_on_time_pct,
 women_person_days, total_expenditure_lakhs, wage_expenditure_lakhs)
VALUES
('UP_AGR', 2025, 10, 12500, 187500, 15.0, 12500, 12100, 11800, 94.40, 93750, 125.5, 112.3),
('UP_ALL', 2025, 10, 15800, 237000, 15.0, 15800, 15200, 14900, 94.30, 118500, 158.2, 142.0),
('UP_LKO', 2025, 10, 9200, 138000, 15.0, 9200, 8900, 8700, 94.57, 69000, 92.1, 82.5),
('UP_KNP', 2025, 10, 10500, 157500, 15.0, 10500, 10100, 9900, 94.29, 78750, 105.2, 94.2),
('UP_GZB', 2025, 10, 5200, 78000, 15.0, 5200, 5000, 4900, 94.23, 39000, 52.1, 46.7),
('UP_GBN', 2025, 10, 3800, 57000, 15.0, 3800, 3650, 3580, 94.21, 28500, 38.0, 34.1),
('UP_VNS', 2025, 10, 13200, 198000, 15.0, 13200, 12700, 12450, 94.32, 99000, 132.1, 118.4),
('UP_MRT', 2025, 10, 8900, 133500, 15.0, 8900, 8550, 8380, 94.16, 66750, 89.1, 79.9),
('UP_BRE', 2025, 10, 11600, 174000, 15.0, 11600, 11150, 10930, 94.22, 87000, 116.2, 104.1),
('UP_ALD', 2025, 10, 9800, 147000, 15.0, 9800, 9420, 9235, 94.24, 73500, 98.1, 87.9);

-- September 2025 data
INSERT INTO monthly_metrics 
(district_id, year, month, households_work, person_days, avg_days_per_household, 
 total_payments_due, payments_completed, payments_on_time, payments_on_time_pct,
 women_person_days, total_expenditure_lakhs, wage_expenditure_lakhs)
VALUES
('UP_AGR', 2025, 9, 11200, 168000, 15.0, 11200, 10850, 10500, 93.75, 84000, 112.2, 100.5),
('UP_ALL', 2025, 9, 14500, 217500, 15.0, 14500, 14000, 13600, 93.79, 108750, 145.1, 130.2),
('UP_LKO', 2025, 9, 8800, 132000, 15.0, 8800, 8500, 8250, 93.75, 66000, 88.0, 78.9),
('UP_KNP', 2025, 9, 9800, 147000, 15.0, 9800, 9450, 9180, 93.67, 73500, 98.2, 88.0),
('UP_GZB', 2025, 9, 4900, 73500, 15.0, 4900, 4730, 4590, 93.67, 36750, 49.1, 44.0),
('UP_GBN', 2025, 9, 3500, 52500, 15.0, 3500, 3380, 3280, 93.71, 26250, 35.0, 31.4),
('UP_VNS', 2025, 9, 12500, 187500, 15.0, 12500, 12050, 11700, 93.60, 93750, 125.2, 112.3),
('UP_MRT', 2025, 9, 8400, 126000, 15.0, 8400, 8100, 7870, 93.69, 63000, 84.1, 75.4),
('UP_BRE', 2025, 9, 10800, 162000, 15.0, 10800, 10420, 10120, 93.70, 81000, 108.1, 96.9),
('UP_ALD', 2025, 9, 9200, 138000, 15.0, 9200, 8880, 8620, 93.70, 69000, 92.1, 82.6);

-- August 2025 data
INSERT INTO monthly_metrics 
(district_id, year, month, households_work, person_days, avg_days_per_household, 
 total_payments_due, payments_completed, payments_on_time, payments_on_time_pct,
 women_person_days, total_expenditure_lakhs, wage_expenditure_lakhs)
VALUES
('UP_AGR', 2025, 8, 10800, 162000, 15.0, 10800, 10400, 10050, 93.06, 81000, 108.1, 96.9),
('UP_ALL', 2025, 8, 13900, 208500, 15.0, 13900, 13400, 12950, 93.17, 104250, 139.2, 124.9),
('UP_LKO', 2025, 8, 8500, 127500, 15.0, 8500, 8200, 7920, 93.18, 63750, 85.1, 76.3),
('UP_KNP', 2025, 8, 9500, 142500, 15.0, 9500, 9150, 8840, 93.05, 71250, 95.1, 85.3),
('UP_GZB', 2025, 8, 4700, 70500, 15.0, 4700, 4530, 4380, 93.19, 35250, 47.1, 42.2),
('UP_GBN', 2025, 8, 3300, 49500, 15.0, 3300, 3180, 3070, 93.03, 24750, 33.0, 29.6),
('UP_VNS', 2025, 8, 12000, 180000, 15.0, 12000, 11550, 11170, 93.08, 90000, 120.1, 107.7),
('UP_MRT', 2025, 8, 8100, 121500, 15.0, 8100, 7800, 7540, 93.09, 60750, 81.1, 72.7),
('UP_BRE', 2025, 8, 10400, 156000, 15.0, 10400, 10020, 9680, 93.08, 78000, 104.1, 93.3),
('UP_ALD', 2025, 8, 8900, 133500, 15.0, 8900, 8570, 8280, 93.03, 66750, 89.1, 79.9);

-- =====================================================
-- SAMPLE PRE-AGGREGATES (Updated by ETL worker)
-- =====================================================

INSERT INTO preaggregates (district_id, metric, window, value, value_json) VALUES
('UP_AGR', 'households_work_avg', '3m', 11500.00, '{"values": [10800, 11200, 12500], "trend": "up"}'),
('UP_AGR', 'person_days_total', '3m', 517500, '{"monthly": [162000, 168000, 187500]}'),
('UP_AGR', 'payment_performance', '3m', 93.73, '{"on_time_pct": [93.06, 93.75, 94.40]}'),
('UP_ALL', 'households_work_avg', '3m', 14733.33, NULL),
('UP_ALL', 'person_days_total', '3m', 663000, NULL),
('UP_LKO', 'households_work_avg', '3m', 8833.33, NULL);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Latest month data for all districts
CREATE OR REPLACE VIEW v_latest_metrics AS
SELECT 
    d.district_id,
    d.district_name,
    d.district_name_hi,
    mm.*
FROM monthly_metrics mm
JOIN districts d ON mm.district_id = d.district_id
WHERE (mm.year, mm.month) = (
    SELECT year, month FROM monthly_metrics ORDER BY year DESC, month DESC LIMIT 1
);

-- District rankings by person-days (current month)
CREATE OR REPLACE VIEW v_district_rankings AS
WITH latest AS (
    SELECT year, month FROM monthly_metrics ORDER BY year DESC, month DESC LIMIT 1
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY mm.person_days DESC) as rank,
    d.district_name,
    d.district_name_hi,
    mm.person_days,
    mm.households_work,
    mm.payments_on_time_pct
FROM monthly_metrics mm
JOIN districts d ON mm.district_id = d.district_id
JOIN latest l ON mm.year = l.year AND mm.month = l.month
ORDER BY mm.person_days DESC;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to find district by coordinates
CREATE OR REPLACE FUNCTION find_district_by_coords(
    lat_input DECIMAL,
    lon_input DECIMAL
) RETURNS TABLE(
    district_id VARCHAR,
    district_name VARCHAR,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.district_id,
        d.district_name,
        ROUND(ST_Distance(
            d.geom::geography,
            ST_SetSRID(ST_MakePoint(lon_input, lat_input), 4326)::geography
        ) / 1000, 2) as distance_km
    FROM districts d
    WHERE d.state = 'Uttar Pradesh'
    ORDER BY d.geom <-> ST_SetSRID(ST_MakePoint(lon_input, lat_input), 4326)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- GRANTS (adjust for your DB user)
-- =====================================================

-- CREATE ROLE mgnrega_api WITH LOGIN PASSWORD 'secure_password_here';
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mgnrega_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mgnrega_api;

-- Create the user
CREATE USER mgnrega_user WITH PASSWORD 'password';

-- Create the database
CREATE DATABASE mgnrega OWNER mgnrega_user;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE mgnrega TO mgnrega_user;

-- Connect to the new database
\c mgnrega

-- Grant schema privileges (important for PostGIS)
GRANT ALL ON SCHEMA public TO mgnrega_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mgnrega_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mgnrega_user;

-- Exit
\q