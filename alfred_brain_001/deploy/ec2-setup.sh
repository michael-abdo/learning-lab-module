#!/bin/bash
set -e

# Copy environment variables
cat > .env << 'ENVFILE'
# MongoDB Atlas
MONGODB_URI=your_mongodb_connection_string_here

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1

# TryTerra API
TRYTERRA_API_KEY_1=your_tryterra_api_key_1_here
TRYTERRA_API_KEY_2=your_tryterra_api_key_2_here
TRYTERRA_DEV_ID=your_tryterra_dev_id_here

# LLM Integration (OpenAI)
OPENAI_API_KEY=your_openai_api_key_here

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
DEFAULT_LOOKBACK_DAYS=7
MAX_FETCH_RETRIES=3
RETRY_DELAY=1000
ENVFILE

# Install dependencies
npm install

# Start the server
npm start