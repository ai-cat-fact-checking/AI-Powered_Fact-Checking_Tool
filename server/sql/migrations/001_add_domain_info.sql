-- Migration: Add domain_info table for AI-analyzed domain verification
-- Run this migration on existing databases to add the new domain_info table

-- Domain info table for AI-analyzed domain verification results
-- Stores domain authenticity verification and background information
CREATE TABLE IF NOT EXISTS domain_info (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    is_authentic BOOLEAN NOT NULL DEFAULT TRUE,
    organization_name VARCHAR(500),
    organization_name_zh VARCHAR(500),
    description TEXT,
    description_zh TEXT,
    category VARCHAR(100),
    country VARCHAR(100),
    political_stance VARCHAR(100),
    credibility_notes TEXT,
    ai_confidence DECIMAL(3,2),
    analysis_source VARCHAR(50) DEFAULT 'gemini',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster domain lookups
CREATE INDEX IF NOT EXISTS idx_domain_info_domain ON domain_info(domain);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_domain_info_updated_at BEFORE UPDATE ON domain_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify migration
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'domain_info') THEN
        RAISE NOTICE 'Migration successful: domain_info table created';
    ELSE
        RAISE EXCEPTION 'Migration failed: domain_info table not created';
    END IF;
END $$;
