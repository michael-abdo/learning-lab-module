#!/bin/bash

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create a .env file based on .env.example."
    exit 1
fi

# Check if MongoDB Atlas IP is whitelisted
echo "⚠️ IMPORTANT: Before proceeding, verify that your server's IP is whitelisted in MongoDB Atlas."
echo "   If you haven't done this yet, please run ./mongodb-whitelist.sh for instructions."
echo "   For this deployment, we're assuming you've whitelisted 0.0.0.0/0 in MongoDB Atlas for testing."
# Automatically proceed without prompting
whitelisted="y"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Install dependencies if not already done
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start backend server using PM2
echo "Starting backend server in production mode..."
pm2 start backend/server.js --name "alfred-brain-api" --log-date-format "YYYY-MM-DD HH:mm:ss" 

# Save PM2 configuration to restart automatically
pm2 save

# Display running processes
pm2 list

echo "Production deployment complete."
echo "Use 'pm2 logs alfred-brain-api' to view logs."
echo "Use './check-status.sh' to verify all components are functioning."