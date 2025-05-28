#!/bin/bash

# Alfred Brain Quick Deployment Script
# This script performs a basic deployment on an EC2 instance
# It skips some prompts and uses default values

set -e

echo "===== Alfred Brain Quick Deployment ====="
echo "This script will install and configure Alfred Brain on this EC2 instance."
echo "Make sure you have your MongoDB Atlas, AWS, and TryTerra credentials ready."
echo "Press Ctrl+C now if you want to cancel."
echo ""
sleep 5

# Install required packages
echo "===== Installing required packages ====="
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install -y nodejs git
sudo npm install -g pm2

# Clone repository
echo "===== Cloning repository ====="
if [ ! -d "Runtheons_Beta_Backend" ]; then
  git clone https://github.com/Runtheons/Runtheons_Beta_Backend.git
fi
cd Runtheons_Beta_Backend
git fetch
git checkout alfred-brain

# Configure environment variables
echo "===== Setting up environment ====="
echo "Please enter your configuration details:"

read -p "MongoDB Atlas URI: " MONGODB_URI
read -p "AWS Access Key ID: " AWS_KEY
read -p "AWS Secret Access Key: " AWS_SECRET
read -p "TryTerra API Key: " TERRA_KEY
read -p "OpenAI API Key: " OPENAI_KEY

# Create .env file
cat > .env << EOF
# MongoDB Atlas
MONGODB_URI=${MONGODB_URI}

# AWS Configuration
AWS_ACCESS_KEY_ID=${AWS_KEY}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET}
AWS_REGION=us-east-1

# TryTerra API
TRYTERRA_API_KEY_1=${TERRA_KEY}

# LLM Integration (OpenAI)
OPENAI_API_KEY=${OPENAI_KEY}

# Environment
PORT=8080
NODE_ENV=production
LOG_LEVEL=INFO

# Alert Thresholds
HIGH_HEART_RATE_THRESHOLD=180
LOW_DAILY_STEPS_THRESHOLD=2000
HIGH_RESTING_HEART_RATE_THRESHOLD=90
LOW_SLEEP_DURATION_THRESHOLD=360
ENABLE_ALERTS=true

# Scheduler Configuration
DATA_FETCH_INTERVAL=0 */6 * * *
USER_FETCH_LIMIT=50
USER_FETCH_DELAY=200
EOF

# Install dependencies
echo "===== Installing dependencies ====="
npm install

# Start the application
echo "===== Starting application ====="
pm2 start backend/server.js --name alfred-brain-api
pm2 save
pm2_startup=$(pm2 startup | grep -o "sudo .*")
eval "$pm2_startup"

# Display public IP
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
echo ""
echo "===== Deployment Complete ====="
echo "Your application should now be running at: http://${PUBLIC_IP}:8080"
echo "IMPORTANT: Make sure to whitelist this IP address in MongoDB Atlas!"
echo "Use 'pm2 logs alfred-brain-api' to view application logs."
echo "Use 'pm2 status' to check the application status."