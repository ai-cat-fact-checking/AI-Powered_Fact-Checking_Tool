# 🧪 Comprehensive Test Suite

This directory contains a complete testing framework for the fact-checking backend API, covering all critical functionality and security aspects.

## 📁 Test Files Overview

### 🌐 `api-test.js` - API Integration Tests
Tests all HTTP endpoints and API functionality:
- **Health Check** - Verifies server is running
- **CORS Headers** - Validates cross-origin request handling
- **Rate Limiting** - Ensures API protection against abuse
- **Authentication** - Tests OAuth token validation
- **Input Validation** - Verifies proper data validation
- **Error Handling** - Tests 404, 401, 400 responses
- **Comment System** - Tests comment CRUD operations
- **Analysis Endpoints** - Tests fact-checking API calls

### 🔐 `auth-test.js` - Authentication & Security Tests
Tests authentication flows and cryptographic security:
- **Encryption Key Generation** - Tests deterministic key creation
- **API Key Encryption/Decryption** - Validates AES-256-GCM encryption
- **Wrong Key Protection** - Ensures keys can't decrypt each other's data
- **Google OAuth Simulation** - Tests user info validation
- **Data Sanitization** - Prevents XSS and malicious input
- **JWT Structure** - Validates token format
- **Memory Cleanup** - Tests sensitive data clearing
- **OAuth Scope Validation** - Ensures proper permissions

### 🗄️ `database-test.js` - Database Operations Tests
Tests PostgreSQL database functionality and data integrity:
- **Connection Health** - Verifies database connectivity
- **Table Structure** - Validates schema exists correctly
- **User CRUD** - Tests user creation, retrieval, updates
- **API Key Storage** - Tests encrypted key database storage
- **Comment System** - Tests comment creation and retrieval
- **Analysis Caching** - Tests result caching system
- **Transactions** - Validates database transaction handling
- **Data Integrity** - Checks for orphaned records
- **Cleanup** - Removes test data after completion

### 🛡️ `security-test.js` - Security Vulnerability Tests
Tests security measures and prevents common vulnerabilities:
- **SQL Injection Prevention** - Tests parameterized queries
- **XSS Protection** - Validates input sanitization
- **CSRF Protection** - Tests token validation
- **API Key Strength** - Enforces strong key requirements
- **Encryption Security** - Tests key generation quality
- **Rate Limiting Logic** - Validates request throttling
- **JWT Security** - Tests token expiration and validation
- **Input Validation** - Tests email/URL validation
- **CORS Configuration** - Tests origin restrictions
- **Sensitive Data Exposure** - Prevents data leaks

### 🎯 `run-all-tests.js` - Master Test Runner
Orchestrates all test suites and provides comprehensive reporting:
- **Sequential Execution** - Runs tests in logical order
- **Result Aggregation** - Combines results from all suites
- **Critical Issue Detection** - Identifies security vulnerabilities
- **System Health Check** - Validates overall system status
- **Comprehensive Reporting** - Generates detailed test reports
- **JSON Report Export** - Saves results for CI/CD integration

## 🚀 How to Run Tests

### Prerequisites
1. **Database Running**: `docker-compose up -d`
2. **API Server Running**: `npm run dev` (in server directory)
3. **Dependencies Installed**: `npm install`

### Run All Tests (Recommended)
```bash
cd server
npm test
```
This runs the complete test suite with comprehensive reporting.

### Run Individual Test Suites
```bash
# Security tests (fastest, no dependencies)
npm run test:security

# Authentication tests
npm run test:auth

# Database tests (requires PostgreSQL)
npm run test:db

# API integration tests (requires running server)
npm run test:api
```

### Database Setup for Tests
```bash
# Start database
docker-compose up -d

# Run migrations
npm run db:migrate

# Verify database
npm run db:test
```

## 📊 Understanding Test Results

### Test Status Indicators
- ✅ **PASS** - Test completed successfully
- ❌ **FAIL** - Test failed, issue needs attention
- ⚠️ **WARN** - Test passed with warnings, review recommended

### Success Rates
- **95-100%** - Excellent, system ready for production
- **80-94%** - Good, review failed tests
- **60-79%** - Needs attention, fix critical issues
- **<60%** - System not ready, significant issues

### Critical Issues
The test runner identifies critical failures that must be fixed:
- Database Connection failures
- API Server connectivity issues
- Security vulnerabilities (SQL injection, XSS)
- Authentication bypass attempts
- Data integrity problems

## 🔧 What Each Test Suite Validates

### 🛡️ Security Tests (No External Dependencies)
**Purpose**: Validate security implementations and prevent vulnerabilities
**What it tests**: 
- Encryption algorithms work correctly
- Input validation prevents attacks
- Rate limiting logic functions
- CORS configuration is secure
- Sensitive data isn't exposed

**Why it matters**: Prevents security breaches, data leaks, and attacks

### 🔐 Authentication Tests (No External Dependencies)  
**Purpose**: Ensure user authentication and API key management work correctly
**What it tests**:
- API keys are properly encrypted/decrypted
- User data is validated and sanitized
- Memory is cleared of sensitive information
- OAuth token structures are valid
- Encryption keys are generated securely

**Why it matters**: Protects user data and prevents unauthorized access

### 🗄️ Database Tests (Requires PostgreSQL)
**Purpose**: Validate database operations and data integrity
**What it tests**:
- All required tables exist with correct structure
- Users can be created, updated, and retrieved
- Comments system works end-to-end
- Analysis results are cached properly
- Transactions work correctly
- No data corruption or orphaned records

**Why it matters**: Ensures data persistence and system reliability

### 🌐 API Tests (Requires Running Server)
**Purpose**: Validate all HTTP endpoints and API functionality
**What it tests**:
- Server responds to requests correctly
- Authentication is properly enforced
- Input validation works on all endpoints
- Error responses are appropriate
- Rate limiting protects against abuse
- CORS allows legitimate requests

**Why it matters**: Ensures the API works correctly for the Chrome extension

## 🚨 Common Issues and Solutions

### Database Connection Failures
```bash
# Check if PostgreSQL is running
docker-compose ps

# Start services
docker-compose up -d

# Wait for startup (10-15 seconds)
sleep 15

# Test connection
npm run db:test
```

### API Server Connection Failures
```bash
# Check if server is running on port 4999
curl http://localhost:4999/health

# Start server
npm run dev

# Check server logs
docker-compose logs api
```

### OAuth/Authentication Issues
- Verify Google Client ID in `.env` matches manifest.json
- Check extension ID is correctly configured
- Ensure CORS origins include your extension ID

### Security Test Failures
- Review failed test messages for specific vulnerability
- Check implementation against test requirements
- Update security measures as needed

## 📈 Test Report Generation

The master test runner generates detailed reports in multiple formats:

### Console Output
- Real-time test progress
- Color-coded results
- Suite breakdowns
- Critical issue alerts
- System health status
- Next steps recommendations

### JSON Report (`test-report.json`)
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "duration": 5420,
  "extensionId": "YOUR_EXTENSION_ID",
  "stats": {
    "total": 45,
    "passed": 42,
    "failed": 2,
    "warned": 1
  },
  "suites": {
    "security": { "total": 10, "passed": 10, "failed": 0 },
    "auth": { "total": 10, "passed": 9, "failed": 1 },
    "database": { "total": 13, "passed": 12, "failed": 1 },
    "api": { "total": 12, "passed": 11, "failed": 0, "warned": 1 }
  }
}
```

## 🔄 Continuous Integration

These tests are designed for CI/CD integration:

```bash
# In your CI pipeline
npm install
docker-compose up -d
npm run db:migrate
npm run dev &
sleep 10
npm test
```

The test runner exits with:
- **Code 0** - All tests passed
- **Code 1** - Some tests failed

## 💡 Best Practices

1. **Run tests before deployment** - Always verify system health
2. **Fix security issues first** - Security tests are highest priority
3. **Monitor success rates** - Maintain >95% success rate
4. **Review warnings** - Address warnings before they become failures
5. **Keep tests updated** - Update tests when adding new features

## 🔍 Test Development Guidelines

When adding new tests:
1. Follow existing patterns and naming conventions
2. Include both positive and negative test cases
3. Clean up any test data created
4. Add appropriate logging and error messages
5. Update this README with new test descriptions

---

This comprehensive test suite ensures your fact-checking system is secure, reliable, and ready for production use! 🚀