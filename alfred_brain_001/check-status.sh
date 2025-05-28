#!/bin/bash

echo "===== Alfred Brain System Status ====="
echo ""

# Check AWS resources
echo "AWS Resources:"
echo "--------------"
echo "Checking CloudFormation stacks..."
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE | grep StackName
echo ""

echo "Checking Lambda functions..."
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `AlfredBrain`)].FunctionName' --output table
echo ""

echo "Testing Lambda function..."
aws lambda invoke --function-name AlfredBrainTerraDataFetcher-dev --payload '{"test":true,"batchSize":5}' /tmp/lambda-output.json
echo ""

# Check backend server status
echo "Backend Server:"
echo "--------------"
if command -v pm2 &> /dev/null && pm2 list | grep alfred-brain-api; then
    echo "Backend server is running with PM2"
    pm2 list | grep alfred-brain-api
else
    echo "Backend server is not running with PM2"
    echo "To start the server in production mode, run: ./start-production.sh"
fi

echo ""
echo "MongoDB Connection:"
echo "-----------------"
if command -v curl &> /dev/null; then
    echo "Using curl to check health endpoint..."
    if curl -s http://localhost:3000/health > /tmp/health-output.json; then
        cat /tmp/health-output.json
        echo ""
        # Extract MongoDB status
        if grep -q "\"status\":\"connected\"" /tmp/health-output.json; then
            echo "✅ MongoDB connection successful"
        else
            echo "❌ MongoDB connection failed"
            echo "Please whitelist your IP in MongoDB Atlas (see ./mongodb-whitelist.sh)"
        fi
    else
        echo "Health endpoint not accessible. Server may not be running."
    fi
else
    echo "curl command not available, please install curl or manually check http://localhost:8080/health"
    echo "To start the server, run: ./start-production.sh"
fi

echo ""
echo "==================================="