#!/bin/bash

echo "🚀 Starting Fact-Check System Setup"
echo "====================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    case $2 in
        "success") echo -e "${GREEN}✅ $1${NC}" ;;
        "error") echo -e "${RED}❌ $1${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️ $1${NC}" ;;
        "info") echo -e "${BLUE}ℹ️ $1${NC}" ;;
        *) echo "$1" ;;
    esac
}

print_status "Step 1: Checking Prerequisites" "info"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js version: $NODE_VERSION" "success"
else
    print_status "Node.js not found. Please install Node.js 18+" "error"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    print_status "npm is available" "success"
else
    print_status "npm not found" "error"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        print_status "Docker is running" "success"
        DOCKER_READY=true
    else
        print_status "Docker found but not running. Please start Docker Desktop" "warning"
        DOCKER_READY=false
    fi
else
    print_status "Docker not found. Please install Docker" "error"
    DOCKER_READY=false
fi

print_status "\nStep 2: Setting up Backend Dependencies" "info"

# Install npm dependencies
if [ ! -d "server/node_modules" ]; then
    print_status "Installing npm packages..." "info"
    cd server
    npm install --silent
    if [ $? -eq 0 ]; then
        print_status "npm packages installed successfully" "success"
    else
        print_status "Failed to install npm packages" "error"
        exit 1
    fi
    cd ..
else
    print_status "npm packages already installed" "success"
fi

print_status "\nStep 3: Environment Configuration" "info"

# Check .env file
if [ -f "server/.env" ]; then
    print_status ".env file exists" "success"
    
    # Check if Google Client ID is configured
        print_status "Google OAuth Client ID configured" "success"
    else
        print_status "Please update GOOGLE_CLIENT_ID in server/.env" "warning"
    fi
    
    # Check if Gemini API key needs to be set
    if grep -q "your_gemini_api_key_here" server/.env; then
        print_status "Please set your GEMINI_API_KEY in server/.env" "warning"
    else
        print_status "Gemini API key configured" "success"
    fi
else
    print_status ".env file missing" "error"
    exit 1
fi

print_status "\nStep 4: Database Setup" "info"

if [ "$DOCKER_READY" = true ]; then
    print_status "Starting Docker services..." "info"
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        print_status "Docker services started" "success"
        
        # Wait for PostgreSQL to be ready
        print_status "Waiting for PostgreSQL to start..." "info"
        sleep 10
        
        # Test database connection and run migrations
        cd server
        print_status "Running database migrations..." "info"
        if npm run db:migrate &> /dev/null; then
            print_status "Database migrations completed" "success"
        else
            print_status "Database migrations failed, trying alternative..." "warning"

            if node src/utils/migrate.js migrate &> /dev/null; then
                print_status "Database migrations completed" "success"
            else
                print_status "Database migrations failed" "error"
            fi
        fi
        
        # Test database connection
        if node src/utils/dbTest.js &> /dev/null; then
            print_status "Database connection successful" "success"
        else
            print_status "Database connection test failed" "warning"
        fi
        cd ..
    else
        print_status "Failed to start Docker services" "error"
    fi
else
    print_status "Skipping database setup - Docker not available" "warning"
    print_status "Start Docker Desktop and run: docker-compose up -d" "info"
fi

print_status "\nStep 6: Starting API Server" "info"

if [ "$DOCKER_READY" = true ]; then
    # Check if API server is already running
    if curl -s http://localhost:4999/health > /dev/null 2>&1; then
        print_status "API server is already running" "success"
    else
        print_status "API server not responding, checking container status..." "info"
        if docker-compose ps | grep -q "fact-check-api.*Up"; then
            print_status "API container is running but not responding, restarting..." "warning"
            docker-compose restart api
            sleep 5
        fi
        
        # Wait for API server to be ready
        print_status "Waiting for API server to be ready..." "info"
        for i in {1..30}; do
            if curl -s http://localhost:4999/health > /dev/null 2>&1; then
                print_status "API server is ready" "success"
                break
            fi
            if [ $i -eq 30 ]; then
                print_status "API server failed to start after 30 seconds" "error"
                print_status "Check logs with: docker-compose logs api" "info"
            else
                sleep 1
            fi
        done
    fi
else
    print_status "Skipping API server check - Docker not available" "warning"
fi

print_status "\nStep 7: Extension Configuration" "info"

# Check extension files
if [ -f "extension/manifest.json" ]; then
    print_status "Extension manifest.json exists" "success"
    
    # Check if OAuth is configured
        print_status "Extension OAuth configured" "success"
    else
        print_status "Extension OAuth needs configuration" "warning"
    fi
else
    print_status "Extension manifest.json missing" "error"
fi

if [ -f "extension/options/options.html" ]; then
    print_status "Extension options page exists" "success"
else
    print_status "Extension options page missing" "error"
fi

print_status "\n🎉 Backend Environment Setup Complete!" "info"

if [ "$DOCKER_READY" = true ]; then
    print_status "\n✅ Services Status:" "info"
    echo "- PostgreSQL Database: Running on port 5432"
    echo "- API Server: Running on port 4999"
    echo "- Health Check: http://localhost:4999/health"
    
    print_status "\n🔗 Quick Links:" "info"
    echo "- API Health: http://localhost:4999/health"
    echo "- Database Tools: ./tools/view-database.sh"
    echo "- API Logs: docker-compose logs -f api"
    echo "- Database Logs: docker-compose logs -f postgres"
    
    print_status "\n🧪 Testing:" "info"
    echo "- Test Stage 1 Analysis: ./tools/test_stage1.sh"
    echo "- Test Stage 2 Analysis: ./tools/test_stage2.sh"
    echo "- Run All Tests: cd server && npm test"
else
    print_status "\n⚠️ Docker Setup Required:" "info"
    echo "1. Install and start Docker Desktop"
    echo "2. Run this script again: ./start-system.sh"
fi

print_status "\n📱 Extension Setup:" "info"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select the 'extension' folder"
echo "4. Open extension options and configure:"
echo "   - Sign in with Google"
echo "   - Add your Gemini API key"

print_status "\n📚 Documentation:" "info"
echo "- Setup Guide: README.md"
echo "- Development Tools: tools/ directory"
echo "- Database Management: tools/view-database.sh"
