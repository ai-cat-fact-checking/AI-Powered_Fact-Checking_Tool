#!/bin/bash

# Test Stage 2 re-analysis endpoint field mapping
echo "🧪 Testing Stage 2 re-analysis endpoint..."
echo ""

# Test 1: Missing data field
echo -n "Missing data field: "
curl -s -X POST http://localhost:4999/api/analysis/re-analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"userEncryptionKey":"test-key"}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Test 2: Missing userEncryptionKey
echo -n "Missing userEncryptionKey: "
curl -s -X POST http://localhost:4999/api/analysis/re-analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"data":{"arguments":[],"opinions":[]}}' | \
  jq -r 'if .error then "❌ " + .error else "✅ Unexpected success" end'

# Test 3: Correct structure using test endpoint
echo -n "Test endpoint with correct structure: "
curl -s -X POST http://localhost:4999/api/analysis/test-re-analyze \
  -H "Content-Type: application/json" \
  -d '{"data":{"arguments":[{"argument":"測試論點"}],"opinions":[],"chinese_terms":[]}}' | \
  jq -r 'if .success then "✅ Test endpoint works" else "❌ " + (.error // "unknown error") end'

echo ""
echo "🔍 Expected request body structure for re-analysis:"
echo '{
  "data": {
    "arguments": [...],
    "opinions": [...], 
    "chinese_terms": [...],
    "verified_domain": boolean,
    "summary": "string",
    "domain": "string"
  },
  "userEncryptionKey": "string"
}'
