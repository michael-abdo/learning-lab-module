#!/bin/bash

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create a .env file based on .env.example."
    exit 1
fi

# Start backend server
echo "Starting backend server..."
node backend/server.js