#!/bin/bash

echo "===== Alfred Brain Mock System Status ====="
echo ""

# Check if the mock server is running
echo "Checking if the mock server is running..."

# Check running processes
echo "PM2 Processes:"
echo "-------------"
pm2 list

echo ""
echo "Frontend Status:"
echo "--------------"
echo "Mock frontend UI is not implemented yet."

echo ""
echo "Backend Server:"
echo "--------------"
if pm2 list | grep -q alfred-brain-mock; then
    echo "✅ Mock backend server is running"
    
    # Get the port from PM2 logs
    PORT=$(pm2 logs alfred-brain-mock --lines 100 --nostream | grep "Server running on port" | tail -1 | grep -o -E "port [0-9]+" | awk '{print $2}')
    
    if [ -n "$PORT" ]; then
        echo "Server is running on port: $PORT"
        echo "Health check endpoint: http://localhost:$PORT/health"
        echo "Terra API endpoint: http://localhost:$PORT/api/terra"
        echo "Analysis API endpoint: http://localhost:$PORT/api/analysis"
    else
        echo "Could not determine server port"
    fi
else
    echo "❌ Mock backend server is not running"
    echo "To start the server in mock mode, run: ./start-mock-environment.sh"
fi

echo ""
echo "Additional Status:"
echo "----------------"
echo "MongoDB: Mock implementation (in-memory)"
echo "TryTerra API: Mock implementation"
echo "AWS Resources: Mock implementation"

echo ""
echo "=== To run full status check, use: ./check-status.sh ==="
echo "=== This script is specific to the mock environment ==="