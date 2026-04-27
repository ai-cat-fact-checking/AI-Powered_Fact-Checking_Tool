const { Pool } = require('pg');
require('dotenv').config();

// Database connection test utility
async function testDatabaseConnection() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Testing database connection...');
        
        // Test basic connection
        const client = await pool.connect();
        console.log('✅ Successfully connected to PostgreSQL');

        // Test query execution
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ Query executed successfully');
        console.log(`   Current time: ${result.rows[0].current_time}`);
        console.log(`   PostgreSQL version: ${result.rows[0].pg_version.split(',')[0]}`);

        // Test tables existence
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('✅ Database tables:');
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        // Test sample user query
        const userCount = await client.query('SELECT COUNT(*) as count FROM users');
        console.log(`✅ Users table: ${userCount.rows[0].count} users found`);

        client.release();
        
    } catch (error) {
        console.error('❌ Database connection failed:');
        console.error(`   Error: ${error.message}`);
        console.error(`   Code: ${error.code}`);
        process.exit(1);
    } finally {
        await pool.end();
    }

    console.log('🎉 Database test completed successfully!');
}

// Run test if called directly
if (require.main === module) {
    testDatabaseConnection();
}

module.exports = { testDatabaseConnection };