#!/bin/bash

# Field mapping test script using curl
echo "🧪 Testing field mapping between extension and server..."
echo ""

# Test 1: Test endpoint works (should succeed)
echo "📋 Test 1: Test endpoint validation"
curl -s -X POST http://localhost:4999/api/analysis/test-analyze \
  -H "Content-Type: application/json" \
  -d '{"content":"測試內容","url":"https://example.com/test"}' | \
  jq -r 'if .success then "✅ Test endpoint works" else "❌ Test endpoint failed: " + (.error // "unknown") end'

echo ""

# Test 2: Production endpoint field validation  
echo "📋 Test 2: Production endpoint field validation"

# Missing content
echo -n "Missing content: "
curl -s -X POST http://localhost:4999/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"url":"https://example.com","userEncryptionKey":"test-key"}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Missing URL
echo -n "Missing URL: "
curl -s -X POST http://localhost:4999/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"content":"test content","userEncryptionKey":"test-key"}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Missing userEncryptionKey
echo -n "Missing userEncryptionKey: "
curl -s -X POST http://localhost:4999/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"content":"test content","url":"https://example.com"}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Empty userEncryptionKey
echo -n "Empty userEncryptionKey: "
curl -s -X POST http://localhost:4999/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"content":"test content","url":"https://example.com","userEncryptionKey":""}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Null userEncryptionKey
echo -n "Null userEncryptionKey: "
curl -s -X POST http://localhost:4999/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"content":"test content","url":"https://example.com","userEncryptionKey":null}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

echo ""
echo "📋 Current extension issue diagnosis:"
echo "The extension sends userEncryptionKey field but its value is falsy (empty/null/undefined)"
echo "This suggests the getUserEncryptionKey message is not returning the expected encryption key"
echo ""
echo "🔍 Next steps:"
echo "1. Check extension background.js getUserEncryptionKey handler"
echo "2. Verify the encryption key is properly stored and retrieved"
echo "3. Ensure content_script.js properly handles the response"
