# Alfred Brain Production Deployment Guide

This guide provides step-by-step instructions for deploying Alfred Brain in a production environment.

## Quick Deployment

For a guided deployment process:

```bash
./deploy-all.sh
```

## Key Components

The Alfred Brain system consists of the following key components:

1. **Backend Express Server**: Handles API requests and data processing
2. **MongoDB Atlas**: Stores wearable data and user profiles
3. **AWS Lambda Functions**: Process wearable data from TryTerra
4. **AWS S3 Bucket**: Stores raw and processed data
5. **AWS Glue ETL** (optional): Performs advanced data transformations

## Deployment Steps

### 1. Environment Setup

Ensure your `.env` file contains the following:

```
# MongoDB Atlas
MONGODB_URI=mongodb+srv://[username]:[password]@[cluster].mongodb.net/[database]?retryWrites=true&w=majority&tls=true

# AWS S3 Storage
AWS_ACCESS_KEY_ID=[your-aws-access-key]
AWS_SECRET_ACCESS_KEY=[your-aws-secret-key]
AWS_REGION=[your-aws-region]
S3_BUCKET=[your-s3-bucket-name]

# TryTerra API
TRYTERRA_API_KEY_1=[your-terra-api-key]
TRYTERRA_API_KEY_2=[your-terra-secondary-key]
TRYTERRA_DEV_ID=[your-terra-dev-id]

# Environment
PORT=8080
NODE_ENV=production

# LLM API (OpenAI) - if using LLM analysis
OPENAI_API_KEY=[your-openai-api-key]
```

### 2. MongoDB Atlas Configuration

**Critical Step**: Whitelist your server's IP address in MongoDB Atlas:

1. Log into MongoDB Atlas at https://cloud.mongodb.com
2. Navigate to your project
3. Click on "Network Access" in the left sidebar
4. Click "+ ADD IP ADDRESS"
5. Add your server's IP address (or temporarily use 0.0.0.0/0 for testing)
6. Click "Confirm"

### 3. AWS Infrastructure Deployment

Deploy AWS components in this order:

```bash
# 1. Deploy S3 bucket and IAM roles
node scripts/deploy-aws-infrastructure.js

# 2. Deploy Terra Lambda function
node scripts/deploy-terra-lambda.js

# 3. Deploy Data Processor Lambda
node scripts/deploy-data-processor.js

# 4. Deploy Terra Scheduler
node scripts/deploy-terra-scheduler.js
```

Optional Glue ETL deployment:

```bash
# Deploy Glue base infrastructure
node scripts/deploy-glue-base.js

# Deploy Glue MongoDB crawler
node scripts/deploy-glue-infrastructure.js
```

### 4. Backend Server Deployment

Deploy the backend server using PM2:

```bash
# Start the backend server with PM2
./start-production.sh
```

### 5. System Verification

Check that all components are working properly:

```bash
# Verify deployment status
./check-status.sh
```

## Troubleshooting

### MongoDB Connection Issues

- **Problem**: Backend server can't connect to MongoDB
- **Solution**: Verify IP whitelisting in MongoDB Atlas and check MONGODB_URI

### AWS Lambda Issues

- **Problem**: Lambda functions not executing
- **Solution**: Check CloudWatch logs and verify IAM permissions

### Backend Server Issues

- **Problem**: Server crashes or fails to start
- **Solution**: Check PM2 logs with `pm2 logs alfred-brain-api`

## Monitoring and Maintenance

### Backend Server

```bash
# View logs
pm2 logs alfred-brain-api

# Restart server
pm2 restart alfred-brain-api

# View server status
pm2 status
```

### AWS Resources

```bash
# Check Lambda functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `AlfredBrain`)].FunctionName' --output table

# Check S3 bucket
aws s3 ls s3://[your-bucket-name]

# Test Terra Lambda function
aws lambda invoke --function-name AlfredBrainTerraDataFetcher-dev --payload '{"test":true}' output.json
```

## Security Considerations

1. **MongoDB Atlas**: Use specific IP whitelisting in production
2. **AWS IAM**: Use principle of least privilege for all roles
3. **API Keys**: Rotate TryTerra and OpenAI API keys periodically
4. **HTTPS**: Ensure all API endpoints use HTTPS in production

## Next Steps After Deployment

1. Create test users and connect TryTerra devices
2. Set up monitoring and alerts
3. Implement regular database backups
4. Set up CI/CD for future updates