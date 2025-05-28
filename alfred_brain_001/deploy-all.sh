#!/bin/bash

echo "=== Alfred Brain System Full Deployment ==="
echo ""
echo "This script will guide you through the full deployment process for Alfred Brain."
echo "It includes deploying AWS infrastructure, MongoDB configuration, and starting the backend server."
echo ""

# Step 1: Environment Setup
echo "Step 1: Environment Setup"
echo "------------------------"

# Check .env file
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env file from .env.example..."
        cp .env.example .env
        echo "Please edit the .env file with your actual configuration values."
        echo "Press Enter when you've updated the .env file."
        read -p ""
    else
        echo "Error: .env.example file not found. Please create a .env file manually."
        exit 1
    fi
fi

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies. Please check npm configuration."
        exit 1
    fi
fi

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install AWS CLI and configure it with your credentials."
    echo "Visit https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html for installation instructions."
    echo "After installing, run 'aws configure' to set up your credentials."
    echo "Press Enter to continue once AWS CLI is installed and configured."
    read -p ""
fi

# Step 2: AWS Infrastructure Deployment
echo ""
echo "Step 2: AWS Infrastructure Deployment"
echo "------------------------------------"
echo "This step will deploy the AWS infrastructure including S3 buckets, IAM roles, and Lambda functions."
read -p "Do you want to deploy AWS infrastructure? (y/n): " deploy_aws

if [ "$deploy_aws" = "y" ]; then
    echo "Deploying S3 bucket and IAM roles..."
    node scripts/deploy-aws-infrastructure.js
    
    echo "Deploying Terra Lambda function..."
    node scripts/deploy-terra-lambda.js
    
    echo "Deploying Data Processor Lambda function..."
    node scripts/deploy-data-processor.js
    
    echo "Deploying Terra Scheduler..."
    node scripts/deploy-terra-scheduler.js
    
    echo "Optionally deploying Glue infrastructure (advanced)..."
    read -p "Do you want to deploy Glue ETL infrastructure? (y/n): " deploy_glue
    if [ "$deploy_glue" = "y" ]; then
        echo "Deploying Glue base infrastructure..."
        node scripts/deploy-glue-base.js
        
        echo "Deploying Glue crawler and MongoDB connection..."
        node scripts/deploy-glue-infrastructure.js
    else
        echo "Skipping Glue ETL infrastructure deployment."
    fi
else
    echo "Skipping AWS infrastructure deployment."
fi

# Step 3: MongoDB Atlas Setup
echo ""
echo "Step 3: MongoDB Atlas Setup"
echo "--------------------------"
echo "You need to whitelist your server's IP address in MongoDB Atlas to allow connections."
./mongodb-whitelist.sh
read -p "Have you completed the MongoDB Atlas IP whitelisting? (y/n): " mongodb_ready

if [ "$mongodb_ready" != "y" ]; then
    echo "Please complete MongoDB Atlas IP whitelisting before continuing."
    echo "The deployment will continue, but the backend server may not connect to MongoDB."
fi

# Step 4: Backend Server Deployment
echo ""
echo "Step 4: Backend Server Deployment"
echo "-------------------------------"
echo "This step will start the backend server using PM2 for production deployment."
read -p "Do you want to deploy the backend server now? (y/n): " deploy_backend

if [ "$deploy_backend" = "y" ]; then
    echo "Starting backend server in production mode..."
    ./start-production.sh
else
    echo "Skipping backend server deployment."
    echo "You can deploy it later by running: ./start-production.sh"
fi

# Step 5: Verification
echo ""
echo "Step 5: Deployment Verification"
echo "-----------------------------"
echo "This step will verify that all components are deployed and functioning correctly."
read -p "Do you want to verify the deployment now? (y/n): " verify_deployment

if [ "$verify_deployment" = "y" ]; then
    echo "Verifying deployment..."
    ./check-status.sh
else
    echo "Skipping deployment verification."
    echo "You can verify it later by running: ./check-status.sh"
fi

echo ""
echo "=== Deployment Process Complete ==="
echo ""
echo "Next steps:"
echo "1. If you skipped any steps, complete them manually using the individual scripts."
echo "2. Monitor the application logs: pm2 logs alfred-brain-api"
echo "3. Set up monitoring and alerts if needed."
echo ""
echo "Thank you for using Alfred Brain!"