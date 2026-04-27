/**
 * Master Test Runner
 * Executes all test suites and provides comprehensive results
 */

// Load environment variables
require('dotenv').config();

const APITester = require('./api-test');
const AuthTester = require('./auth-test');
const DatabaseTester = require('./database-test');
const SecurityTester = require('./security-test');

class MasterTestRunner {
    constructor() {
        this.allResults = {
            api: [],
            auth: [],
            database: [],
            security: []
        };
        this.overallStats = {
            total: 0,
            passed: 0,
            failed: 0,
            warned: 0
        };
        this.startTime = null;
        this.endTime = null;
    }

    // Collect results from a test suite
    collectResults(suiteName, tester) {
        this.allResults[suiteName] = tester.testResults || [];
        
        const results = this.allResults[suiteName];
        results.forEach(result => {
            this.overallStats.total++;
            if (result.status === 'PASS') this.overallStats.passed++;
            else if (result.status === 'FAIL') this.overallStats.failed++;
            else if (result.status === 'WARN') this.overallStats.warned++;
        });
    }

    // Run all test suites
    async runAllTestSuites() {
        this.startTime = new Date();
        
        console.log('🧪 COMPREHENSIVE TEST SUITE');
        console.log('============================');
        console.log(`Started: ${this.startTime.toLocaleString()}`);
        console.log('Extension ID: YOUR_EXTENSION_ID');
        console.log('============================\n');

        try {
            // 1. Security Tests (run first to ensure basic security)
            console.log('🛡️  Running Security Tests...');
            const securityTester = new SecurityTester();
            await securityTester.runAllTests();
            this.collectResults('security', securityTester);
            console.log('\n' + '─'.repeat(50) + '\n');

            // 2. Authentication Tests
            console.log('🔐 Running Authentication Tests...');
            const authTester = new AuthTester();
            await authTester.runAllTests();
            this.collectResults('auth', authTester);
            console.log('\n' + '─'.repeat(50) + '\n');

            // 3. Database Tests (requires database connection)
            console.log('🗄️  Running Database Tests...');
            const databaseTester = new DatabaseTester();
            try {
                await databaseTester.runAllTests();
                this.collectResults('database', databaseTester);
            } catch (error) {
                console.log('❌ Database tests failed to run. Is the database running?');
                console.log('   Run: docker-compose up -d');
                console.log('   Error:', error.message);
                
                // Add failed results for database tests
                this.allResults.database = [{
                    testName: 'Database Connection',
                    status: 'FAIL',
                    message: 'Database not accessible',
                    timestamp: new Date().toISOString()
                }];
                this.overallStats.total++;
                this.overallStats.failed++;
            }
            console.log('\n' + '─'.repeat(50) + '\n');

            // 4. API Integration Tests (requires running server)
            console.log('🌐 Running API Integration Tests...');
            const apiTester = new APITester();
            try {
                await apiTester.runAllTests();
                this.collectResults('api', apiTester);
            } catch (error) {
                console.log('❌ API tests failed to run. Is the server running?');
                console.log('   Run: npm run dev (in server directory)');
                console.log('   Error:', error.message);
                
                // Add failed results for API tests
                this.allResults.api = [{
                    testName: 'API Server Connection',
                    status: 'FAIL',
                    message: 'API server not accessible',
                    timestamp: new Date().toISOString()
                }];
                this.overallStats.total++;
                this.overallStats.failed++;
            }

        } catch (error) {
            console.error('Test runner encountered an error:', error);
        }

        this.endTime = new Date();
        this.printMasterSummary();
    }

    // Print comprehensive test summary
    printMasterSummary() {
        const duration = this.endTime - this.startTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('🎯 COMPREHENSIVE TEST RESULTS');
        console.log('='.repeat(60));
        
        console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`📊 Total Tests: ${this.overallStats.total}`);
        console.log(`✅ Passed: ${this.overallStats.passed}`);
        console.log(`❌ Failed: ${this.overallStats.failed}`);
        console.log(`⚠️  Warnings: ${this.overallStats.warned}`);
        
        const successRate = this.overallStats.total > 0 
            ? ((this.overallStats.passed / this.overallStats.total) * 100).toFixed(1)
            : 0;
        
        console.log(`🎯 Success Rate: ${successRate}%`);

        // Suite breakdown
        console.log('\n📋 Suite Breakdown:');
        Object.keys(this.allResults).forEach(suiteName => {
            const results = this.allResults[suiteName];
            if (results.length > 0) {
                const suitePassed = results.filter(r => r.status === 'PASS').length;
                const suiteFailed = results.filter(r => r.status === 'FAIL').length;
                const suiteWarned = results.filter(r => r.status === 'WARN').length;
                const suiteRate = ((suitePassed / results.length) * 100).toFixed(1);
                
                const icon = this.getSuiteIcon(suiteName);
                console.log(`   ${icon} ${suiteName.toUpperCase()}: ${suitePassed}/${results.length} (${suiteRate}%)`);
                
                if (suiteFailed > 0) {
                    console.log(`      ❌ ${suiteFailed} failed`);
                }
                if (suiteWarned > 0) {
                    console.log(`      ⚠️  ${suiteWarned} warnings`);
                }
            }
        });

        // Critical failures
        const criticalFailures = this.getCriticalFailures();
        if (criticalFailures.length > 0) {
            console.log('\n🚨 CRITICAL ISSUES:');
            criticalFailures.forEach((failure, index) => {
                console.log(`   ${index + 1}. ${failure.suite} - ${failure.testName}: ${failure.message}`);
            });
        }

        // System status
        this.printSystemStatus();

        // Next steps
        this.printNextSteps();

        console.log('\n' + '='.repeat(60));
    }

    getSuiteIcon(suiteName) {
        const icons = {
            security: '🛡️',
            auth: '🔐',
            database: '🗄️',
            api: '🌐'
        };
        return icons[suiteName] || '📋';
    }

    getCriticalFailures() {
        const critical = [];
        
        Object.keys(this.allResults).forEach(suiteName => {
            this.allResults[suiteName].forEach(result => {
                if (result.status === 'FAIL' && this.isCriticalTest(result.testName)) {
                    critical.push({
                        suite: suiteName.toUpperCase(),
                        testName: result.testName,
                        message: result.message
                    });
                }
            });
        });

        return critical;
    }

    isCriticalTest(testName) {
        const criticalTests = [
            'Database Connection',
            'API Server Connection',
            'SQL Injection Prevention',
            'XSS Prevention',
            'Health Check',
            'User Creation',
            'API Key Encryption'
        ];
        
        return criticalTests.some(critical => 
            testName.toLowerCase().includes(critical.toLowerCase())
        );
    }

    printSystemStatus() {
        console.log('\n🔧 SYSTEM STATUS:');
        
        // Check if core systems are working
        const hasDbConnection = this.allResults.database.some(r => 
            r.testName.includes('Database Connection') && r.status === 'PASS'
        );
        
        const hasApiConnection = this.allResults.api.some(r => 
            r.testName.includes('Health Check') && r.status === 'PASS'
        );
        
        const hasSecurityPass = this.allResults.security.filter(r => 
            r.status === 'PASS'
        ).length > this.allResults.security.length * 0.8;

        console.log(`   📡 API Server: ${hasApiConnection ? '✅ Running' : '❌ Not Running'}`);
        console.log(`   🗄️  Database: ${hasDbConnection ? '✅ Connected' : '❌ Not Connected'}`);
        console.log(`   🛡️  Security: ${hasSecurityPass ? '✅ Good' : '⚠️  Needs Attention'}`);
        
        // Overall system health
        const systemHealth = (hasDbConnection && hasApiConnection && hasSecurityPass) ? 
            '✅ HEALTHY' : '⚠️  NEEDS ATTENTION';
        console.log(`   🎯 Overall: ${systemHealth}`);
    }

    printNextSteps() {
        console.log('\n📝 WHAT THESE TESTS DO:');
        console.log('   🛡️  SECURITY: Prevent SQL injection, XSS, validate encryption');
        console.log('   🔐 AUTH: Test Google OAuth, API key encryption, JWT handling');
        console.log('   🗄️  DATABASE: Verify CRUD operations, data integrity, transactions');
        console.log('   🌐 API: Test all endpoints, error handling, rate limiting');

        console.log('\n🚀 NEXT STEPS:');
        
        if (this.overallStats.failed === 0) {
            console.log('   ✅ All tests passing! Your system is ready for production.');
            console.log('   🔧 Load your extension: chrome://extensions/');
            console.log('   🌐 Test in browser with extension ID: YOUR_EXTENSION_ID');
        } else {
            console.log('   🔧 Fix failed tests before deployment:');
            
            if (!this.allResults.api.some(r => r.testName.includes('Health Check') && r.status === 'PASS')) {
                console.log('      - Start API server: cd server && npm run dev');
            }
            
            if (!this.allResults.database.some(r => r.testName.includes('Database Connection') && r.status === 'PASS')) {
                console.log('      - Start database: docker-compose up -d');
                console.log('      - Run migrations: cd server && npm run db:migrate');
            }
            
            console.log('   📖 Check logs: docker-compose logs api');
            console.log('   🔍 Debug: Review failed test messages above');
        }
    }

    // Generate test report
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            duration: this.endTime - this.startTime,
            extensionId: 'YOUR_EXTENSION_ID',
            stats: this.overallStats,
            suites: {}
        };

        Object.keys(this.allResults).forEach(suiteName => {
            const results = this.allResults[suiteName];
            report.suites[suiteName] = {
                total: results.length,
                passed: results.filter(r => r.status === 'PASS').length,
                failed: results.filter(r => r.status === 'FAIL').length,
                warned: results.filter(r => r.status === 'WARN').length,
                tests: results
            };
        });

        return report;
    }
}

// Run all tests if called directly
if (require.main === module) {
    const runner = new MasterTestRunner();
    runner.runAllTestSuites()
        .then(() => {
            const report = runner.generateReport();
            
            // Save report to file
            const fs = require('fs');
            const reportPath = './test-report.json';
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Test report saved to: ${reportPath}`);
            
            // Exit with appropriate code
            process.exit(runner.overallStats.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Test runner failed:', error);
            process.exit(1);
        });
}

module.exports = MasterTestRunner;