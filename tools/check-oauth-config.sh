#!/bin/bash

# Google Cloud OAuth Configuration Checker
# Run this script to verify your OAuth setup

echo "🔍 Checking Google Cloud OAuth Configuration..."
echo "================================================"

# Set your project ID - replace with your actual project ID
PROJECT_ID="ai-powered-fact-checking-tool"
CLIENT_ID="419011497667-rifgvchcetq9e6hqbqo61go7rud1rkvl"
EXTENSION_ID="YOUR_EXTENSION_ID"

echo "Project ID: $PROJECT_ID"
echo "Client ID: $CLIENT_ID"
echo "Extension ID: $EXTENSION_ID"
echo ""

# 1. Check if logged in to gcloud
echo "1. Checking gcloud authentication..."
gcloud auth list --filter=status:ACTIVE --format="table(account)" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to gcloud. Run: gcloud auth login"
    exit 1
fi
echo "✅ gcloud authenticated"
echo ""

# 2. Set the project
echo "2. Setting project..."
gcloud config set project $PROJECT_ID
echo ""

# 3. Check enabled APIs
echo "3. Checking enabled APIs..."
echo "Checking People API:"
gcloud services list --enabled --filter="name:people.googleapis.com" --format="table(name)" 2>/dev/null
echo "Checking OAuth2 API:"
gcloud services list --enabled --filter="name:oauth2.googleapis.com" --format="table(name)" 2>/dev/null
echo "Checking Google+ API:"
gcloud services list --enabled --filter="name:plus.googleapis.com" --format="table(name)" 2>/dev/null
echo ""

# 4. Check OAuth consent screen
echo "4. Checking OAuth consent screen..."
gcloud alpha iap oauth-brands list --format="table(name,applicationTitle,supportEmail)" 2>/dev/null
echo ""

# 5. Check OAuth credentials (this is limited in gcloud, but we'll try)
echo "5. Checking OAuth 2.0 credentials..."
echo "Note: OAuth credential details are not fully accessible via gcloud CLI"
echo "You need to manually verify in the console at:"
echo "https://console.cloud.google.com/apis/credentials"
echo ""
echo "Verify that your OAuth 2.0 Client ID ($CLIENT_ID) has:"
echo "- Application type: Chrome extension"  
echo "- Item ID: $EXTENSION_ID"
echo ""

# 6. Test API access
echo "6. Testing API access..."
echo "Getting access token for testing..."
ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)
if [ -n "$ACCESS_TOKEN" ]; then
    echo "✅ Access token obtained"
    echo "Testing People API..."
    curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
         "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses" \
         | jq -r '.names[0].displayName // "API accessible"' 2>/dev/null || echo "People API test completed"
else
    echo "❌ Could not get access token"
fi
echo ""

echo "7. Required manual checks:"
echo "================================="
echo "Go to: https://console.cloud.google.com/apis/credentials/consent"
echo ""
echo "Check OAuth Consent Screen:"
echo "- Publishing status should be 'Published' or add test users"
echo "- Scopes should include:"
echo "  • ../auth/userinfo.email"
echo "  • ../auth/userinfo.profile" 
echo "  • openid"
echo ""
echo "If you don't see scope settings, it means your consent screen"
echo "is already configured. The scopes are implicit for Chrome extensions."
echo ""

echo "8. Extension debugging:"
echo "======================"
echo "After fixing OAuth config, reload your extension and check console logs."
echo "The enhanced debugging will show token validation details."
echo ""

echo "✅ Configuration check complete!"
echo "If APIs are enabled and OAuth client is configured correctly,"
echo "your authentication should work."