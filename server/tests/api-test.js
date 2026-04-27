/**
 * API Integration Test Suite
 * Tests all API endpoints and functionality
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

class APITester {
    constructor() {
        this.baseUrl = 'http://localhost:4999';
        this.testResults = [];
        this.authToken = null;
        this.testUser = {
            id: 'test_user_123',
            email: 'test@example.com',
            name: 'Test User'
        };
    }

    // Utility method to make HTTP requests
    async makeRequest(method, path, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const jsonBody = body ? JSON.parse(body) : {};
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: jsonBody
                        });
                    } catch (e) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: body
                        });
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    // Test logging utility
    log(testName, status, message = '') {
        const result = { testName, status, message, timestamp: new Date().toISOString() };
        this.testResults.push(result);
        
        const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${statusSymbol} ${testName}: ${message}`);
    }

    // Test 1: Health Check
    async testHealthCheck() {
        try {
            const response = await this.makeRequest('GET', '/health');
            
            if (response.statusCode === 200 && response.body.status === 'healthy') {
                this.log('Health Check', 'PASS', 'API server is healthy');
            } else {
                this.log('Health Check', 'FAIL', `Unexpected response: ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Health Check', 'FAIL', `Connection failed: ${error.message}`);
        }
    }

    // Test 2: CORS Headers
    async testCORS() {
        try {
            const response = await this.makeRequest('OPTIONS', '/api/auth/verify-user', null, {
                'Origin': 'chrome-extension://test-extension-id',
                'Access-Control-Request-Method': 'POST'
            });
            
            if (response.headers['access-control-allow-origin']) {
                this.log('CORS Headers', 'PASS', 'CORS headers present');
            } else {
                this.log('CORS Headers', 'FAIL', 'Missing CORS headers');
            }
        } catch (error) {
            this.log('CORS Headers', 'FAIL', error.message);
        }
    }

    // Test 3: Rate Limiting
    async testRateLimit() {
        try {
            // Make multiple rapid requests
            const promises = Array(5).fill().map(() => 
                this.makeRequest('GET', '/health')
            );
            
            const responses = await Promise.all(promises);
            const allSuccessful = responses.every(r => r.statusCode === 200);
            
            if (allSuccessful) {
                this.log('Rate Limiting', 'PASS', 'Rate limiting allows normal usage');
            } else {
                this.log('Rate Limiting', 'WARN', 'Some requests were rate limited');
            }
        } catch (error) {
            this.log('Rate Limiting', 'FAIL', error.message);
        }
    }

    // Test 4: Authentication - Invalid Token
    async testInvalidAuth() {
        try {
            const response = await this.makeRequest('POST', '/api/auth/verify-user', {}, {
                'Authorization': 'Bearer invalid_token'
            });
            
            if (response.statusCode === 401) {
                this.log('Invalid Authentication', 'PASS', 'Correctly rejected invalid token');
            } else {
                this.log('Invalid Authentication', 'FAIL', `Expected 401, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Invalid Authentication', 'FAIL', error.message);
        }
    }

    // Test 5: Authentication - Missing Token
    async testMissingAuth() {
        try {
            const response = await this.makeRequest('POST', '/api/auth/store-api-key', {
                apiKey: 'test-api-key',
                userEncryptionKey: 'test-key'
            });
            
            if (response.statusCode === 401) {
                this.log('Missing Authentication', 'PASS', 'Correctly requires authentication');
            } else {
                this.log('Missing Authentication', 'FAIL', `Expected 401, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Missing Authentication', 'FAIL', error.message);
        }
    }

    // Test 6: Store API Key - Validation
    async testApiKeyValidation() {
        try {
            const response = await this.makeRequest('POST', '/api/auth/store-api-key', {
                apiKey: 'invalid-key', // Should start with 'AI'
                userEncryptionKey: 'test-key'
            }, {
                'Authorization': 'Bearer mock_token'
            });
            
            if (response.statusCode === 400) {
                this.log('API Key Validation', 'PASS', 'Correctly validates API key format');
            } else {
                this.log('API Key Validation', 'FAIL', `Expected 400, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('API Key Validation', 'FAIL', error.message);
        }
    }

    // Test 7: Analysis Endpoint - Missing Auth
    async testAnalysisAuth() {
        try {
            const response = await this.makeRequest('POST', '/api/analysis/analyze', {
                content: 'Test news content',
                url: 'https://example.com/news'
            });
            
            if (response.statusCode === 401) {
                this.log('Analysis Authentication', 'PASS', 'Analysis requires authentication');
            } else {
                this.log('Analysis Authentication', 'FAIL', `Expected 401, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Analysis Authentication', 'FAIL', error.message);
        }
    }

    // Test 8: Comments - Get Public Comments
    async testGetComments() {
        try {
            const testUrl = encodeURIComponent('https://example.com/test-article');
            const response = await this.makeRequest('GET', `/api/comments/${testUrl}`);
            
            if (response.statusCode === 200) {
                this.log('Get Comments', 'PASS', `Retrieved comments: ${response.body.total || 0}`);
            } else {
                this.log('Get Comments', 'FAIL', `Expected 200, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Get Comments', 'FAIL', error.message);
        }
    }

    // Test 9: Comments - Create Without Auth
    async testCreateCommentAuth() {
        try {
            const response = await this.makeRequest('POST', '/api/comments', {
                articleUrl: 'https://example.com/test',
                content: 'Test comment',
                tag: '測試'
            });
            
            if (response.statusCode === 401) {
                this.log('Create Comment Auth', 'PASS', 'Comment creation requires authentication');
            } else {
                this.log('Create Comment Auth', 'FAIL', `Expected 401, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Create Comment Auth', 'FAIL', error.message);
        }
    }

    // Test 10: Input Validation
    async testInputValidation() {
        try {
            const response = await this.makeRequest('POST', '/api/comments', {
                articleUrl: 'invalid-url', // Should be valid URL
                content: '', // Should not be empty
                tag: 'invalid-tag' // Should be valid tag
            }, {
                'Authorization': 'Bearer mock_token'
            });
            
            if (response.statusCode === 400) {
                this.log('Input Validation', 'PASS', 'Correctly validates input data');
            } else {
                this.log('Input Validation', 'FAIL', `Expected 400, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Input Validation', 'FAIL', error.message);
        }
    }

    // Test 11: 404 Handling
    async test404Handling() {
        try {
            const response = await this.makeRequest('GET', '/api/nonexistent-endpoint');
            
            if (response.statusCode === 404) {
                this.log('404 Handling', 'PASS', 'Correctly handles non-existent endpoints');
            } else {
                this.log('404 Handling', 'FAIL', `Expected 404, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('404 Handling', 'FAIL', error.message);
        }
    }

    // Test 12: Cached Analysis Retrieval
    async testCachedAnalysis() {
        try {
            const testUrl = encodeURIComponent('https://example.com/test-article');
            const response = await this.makeRequest('GET', `/api/analysis/cached/${testUrl}`);
            
            if (response.statusCode === 200) {
                this.log('Cached Analysis', 'PASS', `Retrieved ${response.body.results?.length || 0} cached results`);
            } else {
                this.log('Cached Analysis', 'FAIL', `Expected 200, got ${response.statusCode}`);
            }
        } catch (error) {
            this.log('Cached Analysis', 'FAIL', error.message);
        }
    }

    // Run all tests
    async runAllTests() {
        console.log('🧪 Starting API Integration Tests');
        console.log('==================================\n');

        const tests = [
            'testHealthCheck',
            'testCORS',
            'testRateLimit',
            'testInvalidAuth',
            'testMissingAuth',
            'testApiKeyValidation',
            'testAnalysisAuth',
            'testGetComments',
            'testCreateCommentAuth',
            'testInputValidation',
            'test404Handling',
            'testCachedAnalysis'
        ];

        for (const test of tests) {
            try {
                await this[test]();
            } catch (error) {
                this.log(test, 'FAIL', `Test execution failed: ${error.message}`);
            }
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.printSummary();
    }

    // Print test summary
    printSummary() {
        console.log('\n📊 Test Summary');
        console.log('===============');
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const warned = this.testResults.filter(r => r.status === 'WARN').length;
        const total = this.testResults.length;

        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Warnings: ${warned}`);
        console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

        if (failed > 0) {
            console.log('❌ Failed Tests:');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => console.log(`   - ${r.testName}: ${r.message}`));
            console.log('');
        }

        console.log('💡 What These Tests Do:');
        console.log('- Verify API server is running and healthy');
        console.log('- Check security (authentication, CORS, rate limiting)');
        console.log('- Test input validation and error handling');
        console.log('- Verify all endpoints respond correctly');
        console.log('- Ensure proper HTTP status codes');
        console.log('\n🔧 To fix failures:');
        console.log('1. Make sure Docker services are running: docker-compose up -d');
        console.log('2. Check API server logs: docker-compose logs api');
        console.log('3. Verify database is accessible: npm run db:test');
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new APITester();
    tester.runAllTests().catch(console.error);
}

module.exports = APITester;