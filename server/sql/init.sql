-- Initialize fact-checking database
-- This script runs automatically when PostgreSQL container starts

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for Google OAuth authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    picture TEXT,
    encrypted_api_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments table for storing fact-check comments
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    article_url TEXT NOT NULL,
    content TEXT NOT NULL,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analysis results table for caching analysis results
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    article_url TEXT NOT NULL,
    content_hash VARCHAR(64),
    analysis_type VARCHAR(20) NOT NULL, -- 'initial', 'stage2', 'stage3'
    result_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(article_url, analysis_type)
);

-- Chinese terms table for efficient lookup
CREATE TABLE IF NOT EXISTS chinese_terms (
    id SERIAL PRIMARY KEY,
    term VARCHAR(255) UNIQUE NOT NULL
);

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
    category TEXT,
    country TEXT,
    political_stance TEXT,
    credibility_notes TEXT,
    ai_confidence DECIMAL(3,2),
    analysis_source VARCHAR(50) DEFAULT 'gemini',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_article_url ON comments(article_url);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_results_url_hash ON analysis_results(article_url, content_hash);
CREATE INDEX IF NOT EXISTS idx_analysis_results_created_at ON analysis_results(created_at);
CREATE INDEX IF NOT EXISTS idx_chinese_terms_term ON chinese_terms(term);
CREATE INDEX IF NOT EXISTS idx_domain_info_domain ON domain_info(domain);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for development
INSERT INTO users (google_id, email, name) VALUES 
('dev_user_123', 'dev@example.com', 'Development User') ON CONFLICT (google_id) DO NOTHING;

-- Create database user with limited permissions (if needed)
-- Note: This user is already created by Docker environment variables
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fact_check_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fact_check_user;
