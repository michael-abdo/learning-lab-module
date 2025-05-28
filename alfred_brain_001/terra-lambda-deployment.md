# TryTerra Data Fetcher Lambda Deployment Guide

This guide explains how to deploy and test the TryTerra data fetcher Lambda function to AWS.

## Prerequisites

1. AWS CLI installed and configured with appropriate credentials
2. Node.js 18.x or later installed
3. MongoDB Atlas account with a cluster set up
4. TryTerra API keys
5. Git repository cloned locally

## Deployment Steps

There are several ways to deploy the Lambda function:

### Option 1: Automated Deployment (Recommended)

Run the provided deployment script with your MongoDB URI:

```bash
# Set MongoDB URI as environment variable
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/alfred-brain"

# Run deployment script with test flag
node scripts/deploy-terra-lambda.js --test
```

This script will:

1. Store your MongoDB connection details in AWS Secrets Manager
2. Create a deployment package with the Lambda code and dependencies
3. Deploy the CloudFormation stack if it doesn't exist
4. Update the Lambda function code
5. Test the Lambda function if `--test` flag is provided

### Option 2: Step-by-Step Manual Deployment

#### 1. Deploy CloudFormation Stack

```bash
node scripts/deploy-terra-scheduler.js
```

This creates the CloudFormation stack with:
- IAM role with necessary permissions
- Lambda function (placeholder code)
- CloudWatch Event rule for scheduling
- CloudWatch Alarm for monitoring errors

#### 2. Store MongoDB URI in AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name alfred-brain/mongodb \
  --description "MongoDB connection URI for Alfred Brain" \
  --secret-string '{"MONGODB_URI":"mongodb+srv://username:password@cluster.mongodb.net/alfred-brain"}'
```

#### 3. Package and Deploy Lambda Function

```bash
# Create build directory
mkdir -p build/lambda-package/node_modules

# Copy Lambda code
cp infrastructure/lambda/fetchTerraData.js build/lambda-package/

# Copy dependencies
cp -r node_modules/aws-sdk node_modules/axios node_modules/mongoose build/lambda-package/node_modules/

# Create zip file
cd build/lambda-package && zip -r ../terra-lambda.zip .

# Update Lambda function code
aws lambda update-function-code \
  --function-name AlfredBrainTerraDataFetcher-dev \
  --zip-file fileb://build/terra-lambda.zip
```

## Testing

### 1. Create Test Users in MongoDB

Run the test user creation script:

```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/alfred-brain"
node scripts/create-test-users.js
```

This script creates two test users with TryTerra connections.

### 2. Test Lambda Function Locally

```bash
node scripts/test-terra-lambda-local-simplified.js
```

This simulates the Lambda's behavior using mock dependencies.

### 3. Test Lambda Function in AWS

```bash
# Create test payload
echo '{"batchSize":10,"skipUsers":0,"environment":"dev","test":true}' > build/test-payload.json

# Invoke Lambda
aws lambda invoke \
  --function-name AlfredBrainTerraDataFetcher-dev \
  --payload file://build/test-payload.json \
  --cli-binary-format raw-in-base64-out \
  build/lambda-response.json

# View response
cat build/lambda-response.json
```

## Monitoring

Monitor the Lambda function using CloudWatch:

```bash
# Get recent logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/AlfredBrainTerraDataFetcher-dev \
  --limit 100
```

The CloudFormation template also creates a CloudWatch Alarm for Lambda errors.

## Schedule Configuration

The Lambda function is scheduled to run every 6 hours by default. To change the schedule:

```bash
aws events put-rule \
  --name AlfredBrainTerraDataFetcher-Scheduler-dev \
  --schedule-expression "rate(12 hours)"
```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failure**
   - Check if the Lambda has VPC access (if MongoDB is in VPC)
   - Verify MongoDB URI in AWS Secrets Manager
   - Check MongoDB Atlas network settings (IP whitelist)

2. **TryTerra API Errors**
   - Verify API keys in Lambda environment variables
   - Check request format and parameters

3. **Lambda Timeouts**
   - Increase Lambda timeout in CloudFormation template
   - Consider increasing memory allocation

4. **Permissions Issues**
   - Check IAM role permissions
   - Verify Secrets Manager access policy

## Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [CloudWatch Events Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/)
- [TryTerra API Documentation](https://docs.tryterra.co/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)