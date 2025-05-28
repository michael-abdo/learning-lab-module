# Alfred Brain - TryTerra Integration Setup Guide

This document outlines the necessary steps to set up the Alfred Brain system with TryTerra integration for wearable data processing.

## Prerequisites

- AWS Account with appropriate permissions
- MongoDB Atlas account
- TryTerra developer account
- Node.js and npm installed

## Environment Setup

1. Clone the repository and navigate to the alfred_brain directory
2. Copy the `.env` file with all necessary environment variables

## AWS IAM Policy Configuration

The system requires specific AWS IAM roles for Lambda functions and AWS Glue ETL jobs. Follow these steps to set up the required policies:

### 1. Apply the Combined Policy (AWSLambdaBasicExecutionRole + AWSGlueServiceRole)

The policy document `aws-policy-document.json` combines the necessary permissions for both Lambda execution and Glue ETL operations.

```bash
# Attach policy to an IAM user
aws iam put-user-policy \
    --user-name <user-name> \
    --policy-name Alfred-Brain-TryTerra-Policy \
    --policy-document file://aws-policy-document.json

# Alternatively, attach policy to an IAM role
aws iam put-role-policy \
    --role-name <role-name> \
    --policy-name Alfred-Brain-TryTerra-Policy \
    --policy-document file://aws-policy-document.json
```

Replace `<user-name>` or `<role-name>` with your specific IAM user or role name.

### 2. Creating a Dedicated IAM Role for Glue ETL

For production environments, it's recommended to create a dedicated IAM role for Glue ETL jobs:

```bash
# Create a new IAM role
aws iam create-role \
    --role-name AlfredBrainGlueETLRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "glue.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }'

# Attach the Glue policy to the role
aws iam put-role-policy \
    --role-name AlfredBrainGlueETLRole \
    --policy-name GlueServicePolicy \
    --policy-document file://aws-policy-document.json
```

### 3. Creating a Dedicated IAM Role for Lambda

```bash
# Create a new IAM role
aws iam create-role \
    --role-name AlfredBrainLambdaRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "lambda.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }'

# Attach the Lambda basic execution policy
aws iam attach-role-policy \
    --role-name AlfredBrainLambdaRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Attach additional custom policies if needed
aws iam put-role-policy \
    --role-name AlfredBrainLambdaRole \
    --policy-name LambdaMongoDB \
    --policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "secretsmanager:GetSecretValue"
                ],
                "Resource": "*"
            }
        ]
    }'
```

## MongoDB Atlas Setup

1. Create a MongoDB Atlas cluster if you don't already have one
2. Configure network access to allow connections from your application and AWS services
3. Create a database user with appropriate permissions
4. Create collections for TryTerra wearable data:

```bash
# Example MongoDB commands to create collections
# Run these in MongoDB Shell

use alfred_brain_db

db.createCollection("wearableData")
db.createCollection("userProfiles")
db.createCollection("performancePlans")

# Create indexes for efficient queries
db.wearableData.createIndex({ userId: 1, timestamp: -1 })
db.userProfiles.createIndex({ userId: 1 }, { unique: true })
db.performancePlans.createIndex({ userId: 1, planType: 1 })
```

## TryTerra Integration

1. Create a developer account at [TryTerra Developer Portal](https://tryterra.co)
2. Register your application to get API keys
3. The following API keys have been configured in the `.env` file:
   - TRYTERRA_API_KEY_1=runtheons-testing-zbnGQ364kw
   - TRYTERRA_API_KEY_2=LUgN_p9G8krf97q5Et3UHxBXetnDGFpx
4. Configure TryTerra webhook URLs to point to your application endpoints

## AWS Glue ETL Setup

1. Create an AWS Glue Database:

```bash
aws glue create-database \
    --database-input '{"Name":"alfred_brain_db"}'
```

2. Create a Glue Crawler to catalog MongoDB data:

```bash
aws glue create-crawler \
    --name alfred-brain-mongodb-crawler \
    --role AlfredBrainGlueETLRole \
    --database-name alfred_brain_db \
    --targets '{"MongoDBTargets": [{"ConnectionName": "mongodb-connection", "Path": "alfred_brain_db/wearableData"}]}'
```

3. Set up a Glue Connection to MongoDB:

```bash
aws glue create-connection \
    --connection-input '{
        "Name": "mongodb-connection",
        "ConnectionType": "MONGODB",
        "ConnectionProperties": {
            "HOST": "your-mongodb-host",
            "PORT": "27017",
            "USERNAME": "your-username",
            "PASSWORD": "your-password",
            "DATABASE": "alfred_brain_db"
        }
    }'
```

## AWS Lambda Setup

1. Create Lambda functions for processing TryTerra data:

```bash
aws lambda create-function \
    --function-name process-tryterra-data \
    --runtime nodejs18.x \
    --role arn:aws:iam::<account-id>:role/AlfredBrainLambdaRole \
    --handler index.handler \
    --zip-file fileb://lambda-function.zip
```

2. Set up event triggers for the Lambda function:

```bash
aws lambda create-event-source-mapping \
    --function-name process-tryterra-data \
    --event-source-arn arn:aws:sqs:<region>:<account-id>:tryterra-data-queue
```

## Application Deployment

1. Install application dependencies:

```bash
npm install
```

2. Start the application:

```bash
npm start
```

## Verification

Test the integration by sending sample data:

```bash
curl -X POST http://localhost:8080/api/test/tryterra \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
```

## Troubleshooting

- Check application logs for errors
- Verify MongoDB connection string
- Ensure AWS credentials are correctly configured
- Test TryTerra API keys with sample requests