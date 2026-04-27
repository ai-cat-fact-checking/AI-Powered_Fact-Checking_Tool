-- Migration: Expand domain_info columns that may contain long AI-generated text
-- Date: 2026-02-04
-- Issue: "value too long for type character varying(100)" error

-- Change VARCHAR columns to TEXT for AI-generated content
ALTER TABLE domain_info ALTER COLUMN political_stance TYPE TEXT;
ALTER TABLE domain_info ALTER COLUMN category TYPE TEXT;
ALTER TABLE domain_info ALTER COLUMN country TYPE TEXT;

-- Log migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 002: Expanded domain_info columns (political_stance, category, country) to TEXT';
END $$;
