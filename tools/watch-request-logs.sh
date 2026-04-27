#!/bin/bash

# Watch and filter logs for request monitoring
# This helps you see what the extension is sending to the Express backend

echo "🔍 Monitoring Extension -> Express Backend Requests"
echo "📡 Watching for analysis and chat requests..."
echo "Press Ctrl+C to stop"
echo "=================================="

# Function to filter and format logs
filter_logs() {
    while read line; do
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        # Filter for request-related logs
        if [[ "$line" =~ (📤|🌐|📡|✅|❌|Analysis|Request|Response|POST|GET|fetch) ]]; then
            # Add timestamp
            timestamp=$(date '+%H:%M:%S')
            echo "[$timestamp] $line"
        fi
    done
}

# Monitor the Docker logs with filtering
docker logs -f ai-powered_fact-checking_tool-web-1 2>&1 | filter_logs
