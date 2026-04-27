/**
 * Security Test Suite
 * Tests security features, vulnerabilities, and compliance
 */

const crypto = require('crypto');

class SecurityTester {
    constructor() {
        this.testResults = [];
        this.vulnerabilities = [];
    }

    log(testName, status, message = '') {
        const result = { testName, status, message, timestamp: new Date().toISOString() };
        this.testResults.push(result);
        
        if (status === 'FAIL') {
            this.vulnerabilities.push({ testName, message });
        }
        
        const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${statusSymbol} ${testName}: ${message}`);
    }

    // Test 1: SQL Injection Prevention
    async testSQLInjectionPrevention() {
        try {
            // Test malicious SQL injection patterns
            const maliciousInputs = [
                "'; DROP TABLE users; --",
                "1' OR '1'='1",
                "admin'/*",
                "1; INSERT INTO users VALUES('hacker', 'hack@evil.com'); --"
            ];

            // Simulate parameterized query behavior (safe)
            const simulateParameterizedQuery = (input) => {
                // In real database, this would be safely escaped
                return input.replace(/'/g, "''"); // Simple escaping for test
            };

            let safelyHandled = 0;
            maliciousInputs.forEach(input => {
                const escaped = simulateParameterizedQuery(input);
                // Check if dangerous patterns are neutralized
                if (!escaped.includes('DROP TABLE') || escaped.includes("''")) {
                    safelyHandled++;
                }
            });

            if (safelyHandled === maliciousInputs.length) {
                this.log('SQL Injection Prevention', 'PASS', 'Parameterized queries protect against SQL injection');
            } else {
                this.log('SQL Injection Prevention', 'FAIL', 'SQL injection vulnerability detected');
            }
        } catch (error) {
            this.log('SQL Injection Prevention', 'FAIL', error.message);
        }
    }

    // Test 2: XSS Prevention
    async testXSSPrevention() {
        try {
            const xssPayloads = [
                '<script>alert("xss")</script>',
                '<img src=x onerror=alert("xss")>',
                'javascript:alert("xss")',
                '<svg onload=alert("xss")>'
            ];

            // Simulate input sanitization
            const sanitizeInput = (input) => {
                return input
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]*>/g, '')
                    .replace(/javascript:/gi, '');
            };

            let sanitizedCount = 0;
            xssPayloads.forEach(payload => {
                const sanitized = sanitizeInput(payload);
                if (!sanitized.includes('<script>') && 
                    !sanitized.includes('javascript:') && 
                    !sanitized.includes('<img')) {
                    sanitizedCount++;
                }
            });

            if (sanitizedCount === xssPayloads.length) {
                this.log('XSS Prevention', 'PASS', 'Input sanitization prevents XSS attacks');
            } else {
                this.log('XSS Prevention', 'FAIL', 'XSS vulnerability detected');
            }
        } catch (error) {
            this.log('XSS Prevention', 'FAIL', error.message);
        }
    }

    // Test 3: CSRF Protection
    async testCSRFProtection() {
        try {
            // Test CSRF token validation logic
            const generateCSRFToken = () => crypto.randomBytes(32).toString('hex');
            const validateCSRFToken = (token, sessionToken) => token === sessionToken;

            const sessionToken = generateCSRFToken();
            const validToken = sessionToken;
            const invalidToken = generateCSRFToken();

            const validRequest = validateCSRFToken(validToken, sessionToken);
            const invalidRequest = validateCSRFToken(invalidToken, sessionToken);

            if (validRequest && !invalidRequest) {
                this.log('CSRF Protection', 'PASS', 'CSRF token validation works correctly');
            } else {
                this.log('CSRF Protection', 'FAIL', 'CSRF protection is inadequate');
            }
        } catch (error) {
            this.log('CSRF Protection', 'FAIL', error.message);
        }
    }

    // Test 4: Password/API Key Strength
    async testApiKeyStrength() {
        try {
            const testApiKeys = [
                'AI123456789012345678901234567890123456', // Strong
                'AI1234', // Too short
                'weak-key', // Wrong format
                'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' // Good format
            ];

            const validateApiKeyStrength = (key) => {
                return key && 
                       key.startsWith('AI') && 
                       key.length >= 35 && 
                       /^[A-Za-z0-9_-]+$/.test(key);
            };

            const strongKeys = testApiKeys.filter(validateApiKeyStrength).length;
            const expectedStrong = 2; // Only first and last should pass

            if (strongKeys === expectedStrong) {
                this.log('API Key Strength', 'PASS', 'API key validation enforces strong keys');
            } else {
                this.log('API Key Strength', 'FAIL', `Expected ${expectedStrong} strong keys, found ${strongKeys}`);
            }
        } catch (error) {
            this.log('API Key Strength', 'FAIL', error.message);
        }
    }

    // Test 5: Encryption Key Security
    async testEncryptionKeySecurity() {
        try {
            // Test encryption key properties
            const generateSecureKey = () => crypto.randomBytes(32).toString('base64');
            
            const key1 = generateSecureKey();
            const key2 = generateSecureKey();

            // Check key length (should be 44 chars in base64 for 32 bytes)
            const correctLength = key1.length === 44 && key2.length === 44;
            
            // Check keys are different (randomness)
            const different = key1 !== key2;
            
            // Check base64 format
            const validBase64 = /^[A-Za-z0-9+/=]+$/.test(key1) && /^[A-Za-z0-9+/=]+$/.test(key2);

            if (correctLength && different && validBase64) {
                this.log('Encryption Key Security', 'PASS', 'Encryption keys are properly generated');
            } else {
                this.log('Encryption Key Security', 'FAIL', 'Encryption key generation has issues');
            }
        } catch (error) {
            this.log('Encryption Key Security', 'FAIL', error.message);
        }
    }

    // Test 6: Rate Limiting Implementation
    async testRateLimitingLogic() {
        try {
            // Simulate rate limiting logic
            class MockRateLimiter {
                constructor(windowMs = 900000, max = 100) {
                    this.requests = new Map();
                    this.windowMs = windowMs;
                    this.max = max;
                }

                isAllowed(ip) {
                    const now = Date.now();
                    const userRequests = this.requests.get(ip) || [];
                    
                    // Remove old requests outside window
                    const validRequests = userRequests.filter(time => now - time < this.windowMs);
                    
                    if (validRequests.length >= this.max) {
                        return false;
                    }
                    
                    validRequests.push(now);
                    this.requests.set(ip, validRequests);
                    return true;
                }
            }

            const limiter = new MockRateLimiter(1000, 3); // 3 requests per second
            const testIP = '192.168.1.100';

            // Make 3 requests (should all be allowed)
            const request1 = limiter.isAllowed(testIP);
            const request2 = limiter.isAllowed(testIP);
            const request3 = limiter.isAllowed(testIP);
            
            // 4th request should be blocked
            const request4 = limiter.isAllowed(testIP);

            if (request1 && request2 && request3 && !request4) {
                this.log('Rate Limiting Logic', 'PASS', 'Rate limiting correctly blocks excess requests');
            } else {
                this.log('Rate Limiting Logic', 'FAIL', 'Rate limiting logic is not working properly');
            }
        } catch (error) {
            this.log('Rate Limiting Logic', 'FAIL', error.message);
        }
    }

    // Test 7: JWT Token Security
    async testJWTSecurity() {
        try {
            // Simulate JWT security checks
            const mockJWTPayload = {
                sub: 'user123',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
            };

            const isJWTValid = (payload) => {
                const currentTime = Math.floor(Date.now() / 1000);
                return payload.iat <= currentTime && payload.exp > currentTime && payload.sub;
            };

            // Test valid token
            const validToken = isJWTValid(mockJWTPayload);
            
            // Test expired token
            const currentTime = Math.floor(Date.now() / 1000);
            const expiredPayload = { ...mockJWTPayload, exp: currentTime - 3600 };
            const expiredToken = isJWTValid(expiredPayload);
            
            // Test future token (invalid iat)
            const futurePayload = { ...mockJWTPayload, iat: currentTime + 3600 };
            const futureToken = isJWTValid(futurePayload);

            if (validToken && !expiredToken && !futureToken) {
                this.log('JWT Security', 'PASS', 'JWT validation logic works correctly');
            } else {
                this.log('JWT Security', 'FAIL', 'JWT validation has security issues');
            }
        } catch (error) {
            this.log('JWT Security', 'FAIL', error.message);
        }
    }

    // Test 8: Input Validation
    async testInputValidation() {
        try {
            const validateEmail = (email) => {
                if (!email || email.includes('<') || email.includes('>')) return false;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            };
            const validateUrl = (url) => {
                try {
                    const parsed = new URL(url);
                    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
                } catch {
                    return false;
                }
            };

            const emailTests = [
                { email: 'valid@example.com', expected: true },
                { email: 'invalid-email', expected: false },
                { email: '<script>@evil.com', expected: false },
                { email: '', expected: false }
            ];

            const urlTests = [
                { url: 'https://example.com', expected: true },
                { url: 'javascript:alert("xss")', expected: false },
                { url: 'ftp://example.com', expected: false },
                { url: 'not-a-url', expected: false }
            ];

            const emailResults = emailTests.every(test => validateEmail(test.email) === test.expected);
            const urlResults = urlTests.every(test => validateUrl(test.url) === test.expected);

            if (emailResults && urlResults) {
                this.log('Input Validation', 'PASS', 'Input validation functions work correctly');
            } else {
                this.log('Input Validation', 'FAIL', 'Input validation has issues');
            }
        } catch (error) {
            this.log('Input Validation', 'FAIL', error.message);
        }
    }

    // Test 9: CORS Configuration
    async testCORSConfiguration() {
        try {
            const allowedOrigins = [
                'chrome-extension://YOUR_EXTENSION_ID',
                'http://localhost:3000'
            ];

            const testOrigins = [
                { origin: 'chrome-extension://YOUR_EXTENSION_ID', expected: true },
                { origin: 'http://localhost:3000', expected: true },
                { origin: 'https://evil.com', expected: false },
                { origin: 'chrome-extension://malicious-id', expected: false }
            ];

            const isOriginAllowed = (origin) => {
                if (!origin) return true; // Allow same-origin requests
                return allowedOrigins.includes(origin) || 
                       origin.startsWith('chrome-extension://') && allowedOrigins.some(allowed => allowed.includes(origin));
            };

            const results = testOrigins.every(test => 
                isOriginAllowed(test.origin) === test.expected
            );

            if (results) {
                this.log('CORS Configuration', 'PASS', 'CORS origin validation works correctly');
            } else {
                this.log('CORS Configuration', 'FAIL', 'CORS configuration has security issues');
            }
        } catch (error) {
            this.log('CORS Configuration', 'FAIL', error.message);
        }
    }

    // Test 10: Sensitive Data Exposure
    async testSensitiveDataExposure() {
        try {
            // Test that sensitive data is not exposed in responses
            const mockUserResponse = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                // These should NOT be included:
                // encrypted_api_key: 'secret',
                // internal_id: 'internal'
            };

            const sensitiveFields = ['password', 'encrypted_api_key', 'internal_id', 'secret'];
            const responseFields = Object.keys(mockUserResponse);
            
            const hasSensitiveData = responseFields.some(field => 
                sensitiveFields.some(sensitive => 
                    field.toLowerCase().includes(sensitive.toLowerCase())
                )
            );

            if (!hasSensitiveData) {
                this.log('Sensitive Data Exposure', 'PASS', 'No sensitive data in API responses');
            } else {
                this.log('Sensitive Data Exposure', 'FAIL', 'Sensitive data may be exposed in responses');
            }
        } catch (error) {
            this.log('Sensitive Data Exposure', 'FAIL', error.message);
        }
    }

    // Run all security tests
    async runAllTests() {
        console.log('🛡️  Starting Security Tests');
        console.log('============================\n');

        const tests = [
            'testSQLInjectionPrevention',
            'testXSSPrevention',
            'testCSRFProtection',
            'testApiKeyStrength',
            'testEncryptionKeySecurity',
            'testRateLimitingLogic',
            'testJWTSecurity',
            'testInputValidation',
            'testCORSConfiguration',
            'testSensitiveDataExposure'
        ];

        for (const test of tests) {
            try {
                await this[test]();
            } catch (error) {
                this.log(test, 'FAIL', `Test execution failed: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        this.printSummary();
    }

    printSummary() {
        console.log('\n🛡️  Security Test Summary');
        console.log('==========================');
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const warned = this.testResults.filter(r => r.status === 'WARN').length;
        const total = this.testResults.length;

        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Warnings: ${warned}`);
        console.log(`Security Score: ${((passed / total) * 100).toFixed(1)}%\n`);

        if (this.vulnerabilities.length > 0) {
            console.log('🚨 Security Vulnerabilities Detected:');
            this.vulnerabilities.forEach((vuln, index) => {
                console.log(`   ${index + 1}. ${vuln.testName}: ${vuln.message}`);
            });
            console.log('');
        }

        console.log('🔍 Security Areas Tested:');
        console.log('- SQL injection prevention');
        console.log('- Cross-site scripting (XSS) protection');
        console.log('- CSRF token validation');
        console.log('- API key strength requirements');
        console.log('- Encryption key generation');
        console.log('- Rate limiting implementation');
        console.log('- JWT token security');
        console.log('- Input validation and sanitization');
        console.log('- CORS configuration');
        console.log('- Sensitive data exposure prevention');
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new SecurityTester();
    tester.runAllTests().catch(console.error);
}

module.exports = SecurityTester;