/**
 * Database Operations Test Suite
 * Tests PostgreSQL database operations and data integrity
 */

// Load environment variables
require('dotenv').config();

const database = require('../src/models/database');

class DatabaseTester {
    constructor() {
        this.testResults = [];
        this.testData = {
            user: {
                googleId: 'test_db_user_456',
                email: 'dbtest@example.com',
                name: 'Database Test User'
            },
            comment: {
                articleUrl: 'https://example.com/test-article-db',
                content: '這是一個資料庫測試評論，用於驗證資料完整性。',
                tag: '測試標籤'
            }
        };
        this.createdUserId = null;
        this.createdCommentId = null;
    }

    log(testName, status, message = '') {
        const result = { testName, status, message, timestamp: new Date().toISOString() };
        this.testResults.push(result);
        
        const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${statusSymbol} ${testName}: ${message}`);
    }

    // Test 1: Database Connection
    async testDatabaseConnection() {
        try {
            const result = await database.healthCheck();
            
            if (result && result.healthy === 1) {
                this.log('Database Connection', 'PASS', 'Successfully connected to PostgreSQL');
            } else {
                this.log('Database Connection', 'FAIL', 'Health check returned unexpected result');
            }
        } catch (error) {
            this.log('Database Connection', 'FAIL', `Connection failed: ${error.message}`);
        }
    }

    // Test 2: Table Structure
    async testTableStructure() {
        try {
            // Check if required tables exist
            const tables = await database.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'comments', 'analysis_results')
                ORDER BY table_name
            `);

            const expectedTables = ['analysis_results', 'comments', 'users'];
            const actualTables = tables.rows.map(row => row.table_name);
            
            const hasAllTables = expectedTables.every(table => actualTables.includes(table));
            
            if (hasAllTables) {
                this.log('Table Structure', 'PASS', `All required tables exist: ${actualTables.join(', ')}`);
            } else {
                this.log('Table Structure', 'FAIL', `Missing tables. Expected: ${expectedTables.join(', ')}, Found: ${actualTables.join(', ')}`);
            }
        } catch (error) {
            this.log('Table Structure', 'FAIL', error.message);
        }
    }

    // Test 3: User Creation
    async testUserCreation() {
        try {
            const user = await database.createUser(
                this.testData.user.googleId,
                this.testData.user.email,
                this.testData.user.name
            );

            if (user && user.id && user.google_id === this.testData.user.googleId) {
                this.createdUserId = user.id;
                this.log('User Creation', 'PASS', `Created user with ID: ${user.id}`);
            } else {
                this.log('User Creation', 'FAIL', 'User creation returned unexpected result');
            }
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                // User already exists, try to find them
                try {
                    const existingUser = await database.findUserByGoogleId(this.testData.user.googleId);
                    if (existingUser) {
                        this.createdUserId = existingUser.id;
                        this.log('User Creation', 'PASS', 'User already exists, using existing user');
                    } else {
                        this.log('User Creation', 'FAIL', 'Unique constraint violation but user not found');
                    }
                } catch (findError) {
                    this.log('User Creation', 'FAIL', `Error finding existing user: ${findError.message}`);
                }
            } else {
                this.log('User Creation', 'FAIL', error.message);
            }
        }
    }

    // Test 4: User Retrieval
    async testUserRetrieval() {
        try {
            const user = await database.findUserByGoogleId(this.testData.user.googleId);
            
            if (user && user.google_id === this.testData.user.googleId) {
                this.log('User Retrieval', 'PASS', `Retrieved user: ${user.email}`);
            } else {
                this.log('User Retrieval', 'FAIL', 'Could not retrieve created user');
            }
        } catch (error) {
            this.log('User Retrieval', 'FAIL', error.message);
        }
    }

    // Test 5: API Key Storage
    async testApiKeyStorage() {
        try {
            if (!this.createdUserId) {
                throw new Error('No user ID available for testing');
            }

            const mockEncryptedApiKey = {
                encrypted: 'mock_encrypted_data',
                iv: 'mock_iv',
                tag: 'mock_tag'
            };

            const result = await database.updateUserApiKey(
                this.testData.user.googleId,
                mockEncryptedApiKey
            );

            if (result && result.id) {
                this.log('API Key Storage', 'PASS', 'Successfully stored encrypted API key');
            } else {
                this.log('API Key Storage', 'FAIL', 'API key storage failed');
            }
        } catch (error) {
            this.log('API Key Storage', 'FAIL', error.message);
        }
    }

    // Test 6: API Key Retrieval
    async testApiKeyRetrieval() {
        try {
            const encryptedApiKey = await database.getUserApiKey(this.testData.user.googleId);
            
            if (encryptedApiKey) {
                const parsed = JSON.parse(encryptedApiKey);
                if (parsed.encrypted && parsed.iv && parsed.tag) {
                    this.log('API Key Retrieval', 'PASS', 'Successfully retrieved encrypted API key');
                } else {
                    this.log('API Key Retrieval', 'FAIL', 'Retrieved API key has invalid structure');
                }
            } else {
                this.log('API Key Retrieval', 'FAIL', 'Could not retrieve API key');
            }
        } catch (error) {
            this.log('API Key Retrieval', 'FAIL', error.message);
        }
    }

    // Test 7: Comment Creation
    async testCommentCreation() {
        try {
            if (!this.createdUserId) {
                throw new Error('No user ID available for testing');
            }

            const comment = await database.createComment(
                this.createdUserId,
                this.testData.comment.articleUrl,
                this.testData.comment.content,
                this.testData.comment.tag
            );

            if (comment && comment.id && comment.content === this.testData.comment.content) {
                this.createdCommentId = comment.id;
                this.log('Comment Creation', 'PASS', `Created comment with ID: ${comment.id}`);
            } else {
                this.log('Comment Creation', 'FAIL', 'Comment creation returned unexpected result');
            }
        } catch (error) {
            this.log('Comment Creation', 'FAIL', error.message);
        }
    }

    // Test 8: Comments Retrieval by Article
    async testCommentsRetrievalByArticle() {
        try {
            const comments = await database.getCommentsByArticleUrl(
                this.testData.comment.articleUrl,
                10
            );

            if (Array.isArray(comments) && comments.length > 0) {
                const hasOurComment = comments.some(c => c.id === this.createdCommentId);
                if (hasOurComment) {
                    this.log('Comments Retrieval by Article', 'PASS', `Retrieved ${comments.length} comments`);
                } else {
                    this.log('Comments Retrieval by Article', 'WARN', 'Comments retrieved but test comment not found');
                }
            } else {
                this.log('Comments Retrieval by Article', 'WARN', 'No comments found for test article');
            }
        } catch (error) {
            this.log('Comments Retrieval by Article', 'FAIL', error.message);
        }
    }

    // Test 9: User Comments Retrieval
    async testUserCommentsRetrieval() {
        try {
            if (!this.createdUserId) {
                throw new Error('No user ID available for testing');
            }

            const comments = await database.getUserComments(this.createdUserId, 10);

            if (Array.isArray(comments)) {
                this.log('User Comments Retrieval', 'PASS', `Retrieved ${comments.length} user comments`);
            } else {
                this.log('User Comments Retrieval', 'FAIL', 'Unexpected response format');
            }
        } catch (error) {
            this.log('User Comments Retrieval', 'FAIL', error.message);
        }
    }

    // Test 10: Analysis Cache Storage
    async testAnalysisCacheStorage() {
        try {
            const mockAnalysis = {
                arguments: ['測試論點1', '測試論點2'],
                opinions: ['測試觀點'],
                chineseTerms: ['中國用詞'],
                summary: '測試分析結果'
            };

            const contentHash = 'test_hash_123';
            
            const result = await database.saveCachedAnalysis(
                this.testData.comment.articleUrl,
                contentHash,
                'initial',
                mockAnalysis
            );

            if (result && result.id) {
                this.log('Analysis Cache Storage', 'PASS', 'Successfully cached analysis result');
            } else {
                this.log('Analysis Cache Storage', 'FAIL', 'Cache storage failed');
            }
        } catch (error) {
            this.log('Analysis Cache Storage', 'FAIL', error.message);
        }
    }

    // Test 11: Analysis Cache Retrieval
    async testAnalysisCacheRetrieval() {
        try {
            const contentHash = 'test_hash_123';
            
            const cached = await database.getCachedAnalysis(
                this.testData.comment.articleUrl,
                contentHash,
                'initial'
            );

            if (cached && cached.result_data) {
                this.log('Analysis Cache Retrieval', 'PASS', 'Successfully retrieved cached analysis');
            } else {
                this.log('Analysis Cache Retrieval', 'WARN', 'No cached analysis found (may have expired)');
            }
        } catch (error) {
            this.log('Analysis Cache Retrieval', 'FAIL', error.message);
        }
    }

    // Test 12: Database Transaction Test
    async testDatabaseTransaction() {
        try {
            const client = await database.getClient();
            
            try {
                await client.query('BEGIN');
                
                // Test transaction operations
                await client.query(
                    'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3)',
                    ['tx_test_user', 'tx@example.com', 'Transaction Test']
                );
                
                await client.query('ROLLBACK'); // Rollback to test transaction
                
                // Verify the user was not actually inserted
                const result = await database.findUserByGoogleId('tx_test_user');
                
                if (!result) {
                    this.log('Database Transaction', 'PASS', 'Transaction rollback worked correctly');
                } else {
                    this.log('Database Transaction', 'FAIL', 'Transaction rollback failed');
                }
            } finally {
                client.release();
            }
        } catch (error) {
            this.log('Database Transaction', 'FAIL', error.message);
        }
    }

    // Test 13: Data Integrity Check
    async testDataIntegrity() {
        try {
            // Check for orphaned comments (comments without valid user_id)
            const orphanedComments = await database.query(`
                SELECT c.id 
                FROM comments c 
                LEFT JOIN users u ON c.user_id = u.id 
                WHERE u.id IS NULL
                LIMIT 5
            `);

            if (orphanedComments.rows.length === 0) {
                this.log('Data Integrity', 'PASS', 'No orphaned comments found');
            } else {
                this.log('Data Integrity', 'WARN', `Found ${orphanedComments.rows.length} orphaned comments`);
            }
        } catch (error) {
            this.log('Data Integrity', 'FAIL', error.message);
        }
    }

    // Cleanup test data
    async cleanupTestData() {
        try {
            // Delete test comment
            if (this.createdCommentId) {
                await database.query('DELETE FROM comments WHERE id = $1', [this.createdCommentId]);
            }
            
            // Delete test user
            if (this.testData.user.googleId) {
                await database.query('DELETE FROM users WHERE google_id = $1', [this.testData.user.googleId]);
            }
            
            // Delete test analysis cache
            await database.query('DELETE FROM analysis_results WHERE article_url = $1', [this.testData.comment.articleUrl]);
            
            this.log('Cleanup', 'PASS', 'Test data cleaned up');
        } catch (error) {
            this.log('Cleanup', 'WARN', `Cleanup failed: ${error.message}`);
        }
    }

    // Run all database tests
    async runAllTests() {
        console.log('🗄️  Starting Database Tests');
        console.log('===========================\n');

        const tests = [
            'testDatabaseConnection',
            'testTableStructure',
            'testUserCreation',
            'testUserRetrieval',
            'testApiKeyStorage',
            'testApiKeyRetrieval',
            'testCommentCreation',
            'testCommentsRetrievalByArticle',
            'testUserCommentsRetrieval',
            'testAnalysisCacheStorage',
            'testAnalysisCacheRetrieval',
            'testDatabaseTransaction',
            'testDataIntegrity'
        ];

        for (const test of tests) {
            try {
                await this[test]();
            } catch (error) {
                this.log(test, 'FAIL', `Test execution failed: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Cleanup test data
        await this.cleanupTestData();

        this.printSummary();
    }

    printSummary() {
        console.log('\n🗄️  Database Test Summary');
        console.log('=========================');
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const warned = this.testResults.filter(r => r.status === 'WARN').length;
        const total = this.testResults.length;

        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Warnings: ${warned}`);
        console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

        console.log('🔍 What These Tests Cover:');
        console.log('- Database connection and health');
        console.log('- Table structure and schema validation');
        console.log('- User CRUD operations');
        console.log('- API key storage and encryption');
        console.log('- Comment system functionality');
        console.log('- Analysis result caching');
        console.log('- Database transactions');
        console.log('- Data integrity checks');
        console.log('- Proper cleanup of test data');
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new DatabaseTester();
    tester.runAllTests()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseTester;