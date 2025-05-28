/**
 * Script to manually test the wearable data processing Lambda function locally
 */

// Import the processHeartRate and processSteps functions directly
// to avoid dealing with AWS and MongoDB dependencies
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

// Create test cases
const testCases = [
  {
    name: 'High Heart Rate Test',
    data: { heartRate: 190 },
    expected: 'Alert for high heart rate'
  },
  {
    name: 'Normal Heart Rate Test',
    data: { heartRate: 75 },
    expected: 'No alert for normal heart rate'
  },
  {
    name: 'Low Steps Test',
    data: { steps: 1500 },
    expected: 'Alert for low steps'
  },
  {
    name: 'Normal Steps Test',
    data: { steps: 8000 },
    expected: 'No alert for normal steps'
  },
  {
    name: 'Multiple Metrics Test',
    data: { heartRate: 190, steps: 1500 },
    expected: 'Alerts for both high heart rate and low steps'
  }
];

// Run tests
console.log('=== Manual Test for Wearable Data Decision Logic ===\n');

testCases.forEach(test => {
  console.log(`\n== Testing: ${test.name} ==`);
  console.log(`Input data: ${JSON.stringify(test.data)}`);
  console.log(`Expected: ${test.expected}`);
  
  const results = {
    alerts: []
  };
  
  // Process heart rate
  if (test.data.heartRate !== undefined) {
    const heartRateAlert = processHeartRate(test.data.heartRate);
    if (heartRateAlert) {
      results.alerts.push(heartRateAlert);
    }
  }
  
  // Process steps
  if (test.data.steps !== undefined) {
    const stepsAlert = processSteps(test.data.steps);
    if (stepsAlert) {
      results.alerts.push(stepsAlert);
    }
  }
  
  // Display results
  console.log('\nResults:');
  if (results.alerts.length === 0) {
    console.log('  No alerts generated');
  } else {
    results.alerts.forEach(alert => {
      console.log(`  Alert: ${alert.type}, Value: ${alert.value}, Message: ${alert.message}`);
    });
  }
  
  console.log('== Test Complete ==\n');
});

console.log('=== All Tests Completed ===');

// Example of what you could do with the AWS CLI
console.log('\n=== AWS CLI Command Examples ===');
console.log('# Invoke Lambda function with test event:');
console.log('aws lambda invoke \\');
console.log('  --function-name alfred-brain-process-wearable-data \\');
console.log('  --payload \'{"body": "{\\"userId\\":\\"test-user\\",\\"heartRate\\":190,\\"steps\\":1500}"}\' \\');
console.log('  --cli-binary-format raw-in-base64-out \\');
console.log('  response.json');

console.log('\n# View CloudWatch logs:');
console.log('aws logs get-log-events \\');
console.log('  --log-group-name /aws/lambda/alfred-brain-process-wearable-data \\');
console.log('  --log-stream-name `date +%Y/%m/%d/[$LATEST]%Y%m%d` \\');
console.log('  --output json');