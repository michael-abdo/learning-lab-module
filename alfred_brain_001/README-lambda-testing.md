# Lambda Function Testing Guide

This guide explains how to test the wearable data processing Lambda function that implements decision logic to:
- Alert users when heart rate exceeds 180 BPM
- Suggest increased activity when steps are below 2000/day

## Testing the Live Lambda Function

1. **Set up AWS credentials** (if not already configured):
   ```bash
   aws configure
   ```

2. **Ensure MongoDB URI is accessible**:
   - You need a valid MongoDB connection string
   - The MongoDB user must have read/write access to the database

3. **Run the test script**:
   ```bash
   # Make the script executable first
   chmod +x scripts/test-live-lambda.js
   
   # Run the script
   node scripts/test-live-lambda.js
   ```

4. **Using environment variables**:
   You can set these environment variables before running the script:
   ```bash
   export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/alfred-brain"
   export SNS_TOPIC_ARN="arn:aws:sns:us-east-1:123456789012:notifications"
   
   node scripts/test-live-lambda.js
   ```

## What the Script Tests

The script sends test data to the Lambda function with:
1. High heart rate (190 BPM)
2. Low step count (1500 steps) 
3. Both high heart rate and low steps
4. Normal values that should trigger no alerts

For each test case, it:
- Invokes the Lambda function with test data
- Displays the response including any alerts
- Checks CloudWatch logs to verify execution
- Optionally examines MongoDB for stored alerts

## Troubleshooting

If the script fails:

1. **AWS Credentials**: Ensure AWS CLI is installed and configured with credentials that have permissions to:
   - Invoke Lambda functions
   - Read CloudWatch logs

2. **MongoDB Connection**: Verify your MongoDB connection string is correct and the database is accessible.

3. **Lambda Function**: Confirm the Lambda function name and AWS region are correct.

4. **CloudWatch Logs**: The function might execute but encounter internal errors. Check CloudWatch logs for details.

## Manually Testing with AWS CLI

You can also test directly with the AWS CLI:

```bash
# Invoke with high heart rate
aws lambda invoke \
  --function-name alfred-brain-process-wearable-data \
  --payload '{"body": "{\"userId\":\"test-user\",\"heartRate\":190}"}' \
  --cli-binary-format raw-in-base64-out \
  high-hr-response.json

# Check result
cat high-hr-response.json
```