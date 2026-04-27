const database = require('../models/database');
require('dotenv').config();

/**
 * Database migration and setup utility
 */
class MigrationTool {
    constructor() {
        this.migrations = [
            {
                name: 'create_users_table',
                sql: `
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        google_id VARCHAR(255) UNIQUE NOT NULL,
                        email VARCHAR(255) NOT NULL,
                        name VARCHAR(255),
                        encrypted_api_key TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                `
            },
            {
                name: 'create_comments_table',
                sql: `
                    CREATE TABLE IF NOT EXISTS comments (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id),
                        article_url TEXT NOT NULL,
                        content TEXT NOT NULL,
                        tag VARCHAR(50) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
                    CREATE INDEX IF NOT EXISTS idx_comments_article_url ON comments(article_url);
                    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
                `
            },
            {
                name: 'create_analysis_results_table',
                sql: `
                    CREATE TABLE IF NOT EXISTS analysis_results (
                        id SERIAL PRIMARY KEY,
                        article_url TEXT NOT NULL,
                        content_hash VARCHAR(64) NOT NULL,
                        analysis_type VARCHAR(20) NOT NULL,
                        result_data JSONB NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_analysis_results_url_hash ON analysis_results(article_url, content_hash);
                    CREATE INDEX IF NOT EXISTS idx_analysis_results_created_at ON analysis_results(created_at);
                `
            },
            {
                name: 'create_updated_at_function',
                sql: `
                    CREATE OR REPLACE FUNCTION update_updated_at_column()
                    RETURNS TRIGGER AS $$
                    BEGIN
                        NEW.updated_at = CURRENT_TIMESTAMP;
                        RETURN NEW;
                    END;
                    $$ language 'plpgsql';
                `
            },
            {
                name: 'create_users_trigger',
                sql: `
                    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
                    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
                        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
                `
            }
        ];
    }

    async runMigrations() {
        console.log('🚀 Starting database migrations...');
        
        try {
            // Test database connection first
            await database.healthCheck();
            console.log('✅ Database connection successful');

            // Run each migration
            for (const migration of this.migrations) {
                console.log(`📝 Running migration: ${migration.name}`);
                await database.query(migration.sql);
                console.log(`✅ Migration completed: ${migration.name}`);
            }

            // Insert sample development data
            if (process.env.NODE_ENV === 'development') {
                await this.insertSampleData();
            }

            console.log('🎉 All migrations completed successfully!');
            
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    async insertSampleData() {
        console.log('📝 Inserting sample development data...');
        
        try {
            // Check if sample user already exists
            const existingUser = await database.findUserByGoogleId('dev_user_123');
            if (existingUser) {
                console.log('ℹ️ Sample user already exists, skipping insert');
                return;
            }

            // Insert sample user
            const user = await database.createUser(
                'dev_user_123',
                'dev@example.com',
                'Development User'
            );

            // Insert sample comments
            await database.createComment(
                user.id,
                'https://example.com/news/sample-article',
                '這是一個測試評論，用於開發環境測試。',
                '測試標籤'
            );

            console.log('✅ Sample data inserted successfully');
            
        } catch (error) {
            console.error('⚠️ Failed to insert sample data:', error.message);
        }
    }

    async resetDatabase() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Database reset not allowed in production');
        }

        console.log('🔄 Resetting database...');
        
        try {
            // Drop all tables
            await database.query('DROP TABLE IF EXISTS analysis_results CASCADE');
            await database.query('DROP TABLE IF EXISTS comments CASCADE');
            await database.query('DROP TABLE IF EXISTS users CASCADE');
            await database.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

            console.log('✅ Database reset completed');
            
            // Run migrations again
            await this.runMigrations();
            
        } catch (error) {
            console.error('❌ Database reset failed:', error);
            throw error;
        }
    }

    async showStatus() {
        try {
            console.log('📊 Database Status:');
            
            // Check tables
            const tables = await database.query(`
                SELECT table_name, table_rows 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            
            console.log('\n📋 Tables:');
            tables.rows.forEach(row => {
                console.log(`  - ${row.table_name}`);
            });

            // Check row counts
            const userCount = await database.query('SELECT COUNT(*) as count FROM users');
            const commentCount = await database.query('SELECT COUNT(*) as count FROM comments');
            const analysisCount = await database.query('SELECT COUNT(*) as count FROM analysis_results');

            console.log('\n📈 Row Counts:');
            console.log(`  - Users: ${userCount.rows[0].count}`);
            console.log(`  - Comments: ${commentCount.rows[0].count}`);
            console.log(`  - Analysis Results: ${analysisCount.rows[0].count}`);

        } catch (error) {
            console.error('❌ Failed to get database status:', error);
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const migrationTool = new MigrationTool();
    
    try {
        switch (command) {
            case 'migrate':
                await migrationTool.runMigrations();
                break;
            case 'reset':
                await migrationTool.resetDatabase();
                break;
            case 'status':
                await migrationTool.showStatus();
                break;
            default:
                console.log('Available commands:');
                console.log('  migrate - Run database migrations');
                console.log('  reset   - Reset database (development only)');
                console.log('  status  - Show database status');
                break;
        }
    } catch (error) {
        console.error('Command failed:', error.message);
        process.exit(1);
    } finally {
        await database.close();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MigrationTool;