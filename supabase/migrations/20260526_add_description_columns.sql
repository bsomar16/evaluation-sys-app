-- Migration: Add description columns to roles and branches tables
-- Date: 2026-05-26

-- Add description column to roles if it doesn't exist
ALTER TABLE roles 
ADD COLUMN IF NOT EXISTS description varchar(500);

-- Add description column to branches if it doesn't exist
ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS description varchar(500);

-- Add location column to branches if it doesn't exist (in case older schema)
ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS location varchar(255);
