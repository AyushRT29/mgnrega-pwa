-- Run this as postgres superuser FIRST
-- psql -U postgres -d postgres -f setup-user.sql

-- Drop existing user and database if they exist (for clean setup)
DROP DATABASE IF EXISTS mgnrega;
DROP USER IF EXISTS mgnrega_user;

-- Create the user
CREATE USER mgnrega_user WITH PASSWORD 'password';

-- Create the database
CREATE DATABASE mgnrega OWNER mgnrega_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE mgnrega TO mgnrega_user;