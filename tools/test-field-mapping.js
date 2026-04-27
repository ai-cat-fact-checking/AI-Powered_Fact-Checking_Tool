#!/usr/bin/env node

/**
 * Test script to verify all fields are correctly mapped between extension and server
 * This will test the endpoint field requirements and data structure
 */

const axios = require('axios');

// Test data structure that matches what the extension should send
const testAnalysisData = {
  content: '這是測試內容。測試中國大陸相關條款的偵測功能。',
  url: 'https://example.com/test-article',
  title: '測試文章標題',
  domain: 'example.com',
  userEncryptionKey: 'test-encryption-key-12345'
};

const testReAnalysisData = {
  data: {
    arguments: [
      {
        argument: '測試論點',
        location: 'paragraph 1'
      }
    ],
    opinions: [
      {
        opinion: '測試觀點',
        location: 'paragraph 2'
      }
    ],
    chinese_terms: ['中國大陸'],
    verified_domain: false,
    summary: '測試摘要'
  },
  userEncryptionKey: 'test-encryption-key-12345'
};

async function testFieldMapping() {
  console.log('🧪 Testing field mapping between extension and server...\n');

  // Test 1: Analysis endpoint field requirements
  console.log('📋 Test 1: Analysis endpoint (/api/analysis/test-analyze)');
  try {
    const response = await axios.post(
      'http://localhost:4999/api/analysis/test-analyze',
      {
        content: testAnalysisData.content,
        url: testAnalysisData.url
      }
    );

    console.log('✅ Test endpoint works');
    console.log('📊 Response structure:', {
      hasSuccess: !!response.data.success,
      hasAnalysis: !!response.data.analysis,
      analysisKeys: Object.keys(response.data.analysis || {}),
      isTestMode: response.data.isTestMode
    });
  } catch (error) {
    console.log(
      '❌ Test endpoint failed:',
      error.response?.data || error.message
    );
  }

  console.log('\n📋 Test 2: Production endpoint field validation');

  // Test 2: Missing fields
  const testCases = [
    {
      name: 'Missing content',
      data: {
        url: testAnalysisData.url,
        userEncryptionKey: testAnalysisData.userEncryptionKey
      }
    },
    {
      name: 'Missing url',
      data: {
        content: testAnalysisData.content,
        userEncryptionKey: testAnalysisData.userEncryptionKey
      }
    },
    {
      name: 'Missing userEncryptionKey',
      data: { content: testAnalysisData.content, url: testAnalysisData.url }
    },
    {
      name: 'Empty userEncryptionKey',
      data: {
        content: testAnalysisData.content,
        url: testAnalysisData.url,
        userEncryptionKey: ''
      }
    },
    {
      name: 'Null userEncryptionKey',
      data: {
        content: testAnalysisData.content,
        url: testAnalysisData.url,
        userEncryptionKey: null
      }
    },
    {
      name: 'All fields present',
      data: testAnalysisData
    }
  ];

  for (const testCase of testCases) {
    try {
      const response = await axios.post(
        'http://localhost:4999/api/analysis/analyze',
        testCase.data,
        {
          headers: {
            Authorization: 'Bearer fake-token-for-field-testing',
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ ${testCase.name}: SUCCESS`);
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.log(`❌ ${testCase.name}: ${status} - ${message}`);
    }
  }

  console.log('\n📋 Test 3: Re-analysis endpoint field validation');

  // Test 3: Re-analysis endpoint
  const reAnalysisTestCases = [
    {
      name: 'Missing data field',
      data: { userEncryptionKey: testReAnalysisData.userEncryptionKey }
    },
    {
      name: 'Missing userEncryptionKey',
      data: { data: testReAnalysisData.data }
    },
    {
      name: 'All fields present',
      data: testReAnalysisData
    }
  ];

  for (const testCase of reAnalysisTestCases) {
    try {
      const response = await axios.post(
        'http://localhost:4999/api/analysis/re-analyze',
        testCase.data,
        {
          headers: {
            Authorization: 'Bearer fake-token-for-field-testing',
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ Re-analysis ${testCase.name}: SUCCESS`);
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.log(`❌ Re-analysis ${testCase.name}: ${status} - ${message}`);
    }
  }

  console.log('\n📋 Test 4: Extension data structure validation');

  // Test 4: Validate extension sends all expected fields
  console.log('Expected extension request body for /analyze:');
  console.log(
    JSON.stringify(
      {
        content: 'string (required)',
        url: 'string (required)',
        title: 'string (optional)',
        domain: 'string (optional)',
        userEncryptionKey: 'string (required, non-empty)'
      },
      null,
      2
    )
  );

  console.log('\nExpected extension request body for /re-analyze:');
  console.log(
    JSON.stringify(
      {
        data: {
          arguments: 'array (optional)',
          opinions: 'array (optional)',
          chinese_terms: 'array (optional)',
          verified_domain: 'boolean (optional)',
          summary: 'string (optional)'
        },
        userEncryptionKey: 'string (required, non-empty)'
      },
      null,
      2
    )
  );

  console.log('\n🔍 Field mapping test completed!');
}

// Run the test
testFieldMapping().catch(console.error);
