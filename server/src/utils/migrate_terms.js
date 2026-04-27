const fs = require('fs').promises;
const path = require('path');
const database = require('../models/database');

/**
 * One-time script to migrate Chinese terms from JSON file to the database.
 */
async function migrateTerms() {
    console.log('🚀 Starting Chinese terms migration...');
    const client = await database.getClient();

    try {
        // 1. Ensure the table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS chinese_terms (
                id SERIAL PRIMARY KEY,
                term VARCHAR(255) UNIQUE NOT NULL
            );
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_chinese_terms_term ON chinese_terms(term);');
        console.log('✅ Table chinese_terms is ready.');

        // 2. Read the JSON file
        const jsonPath = path.join(__dirname, '../../config/chinese_terms.json');
        const termsJson = await fs.readFile(jsonPath, 'utf8');
        const terms = JSON.parse(termsJson);

        if (!Array.isArray(terms) || terms.length === 0) {
            console.log('✅ No terms to migrate or file is empty. Exiting.');
            return;
        }

        console.log(`📝 Found ${terms.length} terms in chinese_terms.json.`);

        // 3. Insert terms into the database
        await client.query('BEGIN');
        console.log('📦 Inserting terms into the database... (This may take a moment)');

        let insertedCount = 0;
        for (const term of terms) {
            if (typeof term === 'string' && term.trim()) {
                const result = await client.query(
                    'INSERT INTO chinese_terms (term) VALUES ($1) ON CONFLICT (term) DO NOTHING',
                    [term.trim()]
                );
                if (result.rowCount > 0) {
                    insertedCount++;
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Migration complete. Inserted ${insertedCount} new terms.`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error during database transaction:', error);
        throw error;
    } finally {
        client.release();
        await database.close();
    }
}

// Run the migration
migrateTerms().catch(err => {
    console.error("Migration script failed with an unhandled error:", err);
});