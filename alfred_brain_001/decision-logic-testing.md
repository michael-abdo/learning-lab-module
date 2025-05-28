# Testing the Wearable Data Decision Logic

This guide provides instructions on how to test the AWS Lambda function that processes wearable data and implements the decision logic to:

1. Alert users when heart rate exceeds 180 BPM
2. Suggest increased activity when steps are below 2000/day

## Method 1: Local Testing with Jest

The simplest and most reliable way to test the decision logic is using Jest locally:

```bash
# Run the decision logic test suite
npm run test:decision-logic
```

This command runs the test file at `tests/infrastructure/decisionLogic.test.js`, which verifies:
- High heart rate detection (>180 BPM)
- Normal heart rate handling
- Low step count detection (<2000 steps/day)
- Normal step count handling
- Multiple metrics processing
- Empty request handling

Jest provides a clean output showing which tests passed or failed.

## Method 2: Local Script Testing

For a more detailed examination of how the decision logic works:

```bash
# Run the local test script
npm run test:decision-logic:local
```

This script in `scripts/local-test.js` provides comprehensive details about each test case, including:
- The exact input data
- The resulting alerts (or lack thereof)
- Validation against expected behavior
- Detailed explanation of any discrepancies

## Method 3: AWS Testing (Requires AWS Permissions)

If you have appropriate AWS credentials and permissions, you can deploy and test the Lambda in AWS:

### 1. Deploy using CloudFormation
```bash
cd infrastructure/cloudformation
aws cloudformation deploy \
  --template-file terra-scheduler.yaml \
  --stack-name alfred-brain-terra \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2. Update Lambda Code
```bash
cd ../lambda
zip -r function.zip processWearableData.js
aws lambda update-function-code \
  --function-name alfred-brain-process-wearable-data \
  --zip-file fileb://function.zip
```

### 3. Test Using AWS CLI
```bash
# Test with high heart rate
aws lambda invoke \
  --function-name alfred-brain-process-wearable-data \
  --payload '{"body": "{\"userId\":\"test-user\",\"heartRate\":190}"}' \
  --cli-binary-format raw-in-base64-out \
  high-hr-response.json

# Test with low steps
aws lambda invoke \
  --function-name alfred-brain-process-wearable-data \
  --payload '{"body": "{\"userId\":\"test-user\",\"steps\":1500}"}' \
  --cli-binary-format raw-in-base64-out \
  low-steps-response.json

# Check responses
cat high-hr-response.json
cat low-steps-response.json
```

### 4. Use the Script for Comprehensive Testing
```bash
node scripts/test-live-lambda.js
```

## Lambda Function Decision Logic Details

The decision logic is implemented as follows:

### Heart Rate Processing
```javascript
// Process heart rate data
const processHeartRate = (heartRate) => {
  if (heartRate > 180) {
    return {
      type: 'high_heart_rate',
      value: heartRate,
      message: 'High heart rate detected'
    };
  }
  return null;
};
```

### Steps Processing
```javascript
// Process steps data
const processSteps = (steps) => {
  if (steps < 2000) {
    return {
      type: 'low_steps',
      value: steps,
      message: 'Low daily step count detected'
    };
  }
  return null;
};
```

## Troubleshooting

1. **Missing AWS Permissions**: If you get access denied errors when deploying to AWS, you need these permissions:
   - `cloudformation:*`
   - `lambda:*`
   - `iam:*` (for role creation)
   - `logs:*` (for CloudWatch logs)

2. **"Function not found" Error**: Ensure you're using the correct AWS region and function name.

3. **"Module not found" Errors**: If the local test complains about missing modules, install them with:
   ```bash
   npm install aws-sdk mongoose
   ```

4. **"MongoNetworkError" in AWS**: Make sure your Lambda function has proper network access to MongoDB and that the connection string is correct.

5. **High Latency in AWS**: Consider increasing the Lambda memory allocation in the CloudFormation template.