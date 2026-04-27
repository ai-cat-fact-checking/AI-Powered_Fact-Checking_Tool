const { Pool } = require('pg');

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20, // Maximum number of clients in pool
            idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
            connectionTimeoutMillis: 2000, // How long to wait when connecting
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Unexpected database pool error:', err);
        });
    }

    /**
     * Execute a query with parameters
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise} Query result
     */
    async query(text, params = []) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Query executed:', { 
                    sql: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                    duration: `${duration}ms`,
                    rows: result.rowCount
                });
            }
            
            return result;
        } catch (error) {
            console.error('Database query error:', {
                sql: text,
                error: error.message,
                code: error.code
            });
            throw error;
        }
    }

    /**
     * Get a client from the pool for transactions
     * @returns {Promise} Database client
     */
    async getClient() {
        return await this.pool.connect();
    }

    /**
     * Close all connections in the pool
     */
    async close() {
        await this.pool.end();
    }

    // User-related queries
    async findUserByGoogleId(googleId) {
        const result = await this.query(
            'SELECT * FROM users WHERE google_id = $1',
            [googleId]
        );
        return result.rows[0];
    }

    async createUser(googleId, email, name) {
        const result = await this.query(
            `INSERT INTO users (google_id, email, name) 
             VALUES ($1, $2, $3) 
             RETURNING id, google_id, email, name, created_at`,
            [googleId, email, name]
        );
        return result.rows[0];
    }

    async updateUserApiKey(googleId, encryptedApiKey) {
        const result = await this.query(
            'UPDATE users SET encrypted_api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE google_id = $2 RETURNING id',
            [JSON.stringify(encryptedApiKey), googleId]
        );
        return result.rows[0];
    }

    async getUserApiKey(googleId) {
        const result = await this.query(
            'SELECT encrypted_api_key FROM users WHERE google_id = $1',
            [googleId]
        );
        return result.rows[0]?.encrypted_api_key;
    }

    // Alias for compatibility
    async getUserByGoogleId(googleId) {
        return await this.findUserByGoogleId(googleId);
    }

    // Create or update user (upsert functionality using PostgreSQL ON CONFLICT)
    // This prevents race conditions when multiple requests try to create the same user
    async createOrUpdateUser(userData) {
        const { googleId, email, name, picture } = userData;
        
        // Use UPSERT (INSERT ... ON CONFLICT) to atomically create or update
        const result = await this.query(
            `INSERT INTO users (google_id, email, name, picture) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (google_id) 
             DO UPDATE SET 
                 email = EXCLUDED.email, 
                 name = EXCLUDED.name, 
                 picture = EXCLUDED.picture, 
                 updated_at = CURRENT_TIMESTAMP 
             RETURNING id, google_id, email, name, picture, created_at, updated_at`,
            [googleId, email, name, picture]
        );
        return result.rows[0];
    }

    // Comment-related queries
    async getCommentsByArticleUrl(articleUrl, limit = 50) {
        const result = await this.query(
            `SELECT c.*, u.name as user_name, u.email as user_email
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.article_url = $1
             ORDER BY c.created_at DESC
             LIMIT $2`,
            [articleUrl, limit]
        );
        return result.rows;
    }

    async createComment(userId, articleUrl, content, tag) {
        const result = await this.query(
            `INSERT INTO comments (user_id, article_url, content, tag)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, article_url, content, tag, created_at`,
            [userId, articleUrl, content, tag]
        );
        return result.rows[0];
    }

    async getUserComments(userId, limit = 50) {
        const result = await this.query(
            `SELECT * FROM comments 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    }

    // Analysis cache queries - simplified: only use URL + analysisType, no expiry
    async getCachedAnalysis(articleUrl, analysisType) {
        const result = await this.query(
            `SELECT result_data, created_at FROM analysis_results
             WHERE article_url = $1 AND analysis_type = $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [articleUrl, analysisType]
        );
        return result.rows[0];
    }

    async saveCachedAnalysis(articleUrl, analysisType, resultData) {
        // Use upsert to avoid duplicates
        // content_hash is nullable - we only use article_url + analysis_type for caching
        const result = await this.query(
            `INSERT INTO analysis_results (article_url, content_hash, analysis_type, result_data)
             VALUES ($1, NULL, $2, $3)
             ON CONFLICT (article_url, analysis_type) 
             DO UPDATE SET result_data = $3, created_at = NOW()
             RETURNING id`,
            [articleUrl, analysisType, JSON.stringify(resultData)]
        );
        return result.rows[0];
    }

    // Health check query
    async healthCheck() {
        const result = await this.query('SELECT 1 as healthy, NOW() as timestamp');
        return result.rows[0];
    }

    // Domain info queries for AI-analyzed domain verification
    async getDomainInfo(domain) {
        const result = await this.query(
            'SELECT * FROM domain_info WHERE domain = $1',
            [domain]
        );
        return result.rows[0];
    }

    async saveDomainInfo(domainData) {
        const {
            domain,
            isAuthentic,
            organizationName,
            organizationNameZh,
            description,
            descriptionZh,
            category,
            country,
            politicalStance,
            credibilityNotes,
            aiConfidence,
            analysisSource = 'gemini'
        } = domainData;

        const result = await this.query(
            `INSERT INTO domain_info (
                domain, is_authentic, organization_name, organization_name_zh,
                description, description_zh, category, country,
                political_stance, credibility_notes, ai_confidence, analysis_source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (domain) 
            DO UPDATE SET 
                is_authentic = EXCLUDED.is_authentic,
                organization_name = EXCLUDED.organization_name,
                organization_name_zh = EXCLUDED.organization_name_zh,
                description = EXCLUDED.description,
                description_zh = EXCLUDED.description_zh,
                category = EXCLUDED.category,
                country = EXCLUDED.country,
                political_stance = EXCLUDED.political_stance,
                credibility_notes = EXCLUDED.credibility_notes,
                ai_confidence = EXCLUDED.ai_confidence,
                analysis_source = EXCLUDED.analysis_source,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *`,
            [domain, isAuthentic, organizationName, organizationNameZh,
             description, descriptionZh, category, country,
             politicalStance, credibilityNotes, aiConfidence, analysisSource]
        );
        return result.rows[0];
    }

    async getAllDomainInfo() {
        const result = await this.query(
            'SELECT * FROM domain_info ORDER BY domain ASC'
        );
        return result.rows;
    }
}

// Singleton instance
const database = new Database();

module.exports = database;