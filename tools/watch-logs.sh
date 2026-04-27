#!/bin/bash
echo "🔍 Watching API logs for analysis requests..."
echo "Press Ctrl+C to stop"
echo ""

docker logs -f fact-check-api 2>&1 | grep -E "(ANALYSIS|TEST|error|Error|❌|✅|🔍|📊|🎉)" --line-buffered
