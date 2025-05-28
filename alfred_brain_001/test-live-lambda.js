#!/usr/bin/env node
/**
 * Live Lambda Test Harness
 * 
 * This script tests the live Lambda function for processing wearable data
 * and verifies the results in MongoDB.
 * 
 * Usage:
 *   node test-live-lambda.js
 * 
 * Requirements:
 *   - AWS CLI configured with appropriate credentials
 *   - MongoDB shell (mongosh) installed
 *   - Lambda function deployed to AWS
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const config = {
  // AWS settings
  awsRegion: 'us-east-1',
  lambdaFunctionName: 'alfred-brain-process-wearable-data',
  snsTopicArn: process.env.SNS_TOPIC_ARN || 'arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:YOUR_TOPIC_NAME',
  
  // MongoDB settings
  mongoUri: process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/alfred-brain',
  alertsCollection: 'alerts',
  
  // Test data
  testCases: [
    {
      name: 'High Heart Rate Test',
      data: { userId: 'test-user', heartRate: 190, timestamp: new Date().toISOString() }
    },
    {
      name: 'Low Steps Test',
      data: { userId: 'test-user', steps: 1500, timestamp: new Date().toISOString() }
    },
    {
      name: 'Multiple Metrics Test',
      data: { userId: 'test-user', heartRate: 190, steps: 1500, timestamp: new Date().toISOString() }
    },
    {
      name: 'Normal Values Test (No Alerts)',
      data: { userId: 'test-user', heartRate: 75, steps: 8000, timestamp: new Date().toISOString() }
    }
  ]
};

// Create temp directory for test outputs
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

/**
 * Execute shell command and return output
 */
function executeCommand(command) {
  try {
    const output = execSync(command, { encoding: 'utf-8' });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || '', 
      error: error.stderr || error.message 
    };
  }
}

/**
 * Prompt user for input
 */
async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Verify AWS CLI is installed and configured
 */
function checkAwsConfiguration() {
  console.log('Checking AWS CLI configuration...');
  
  const result = executeCommand('aws configure get region');
  if (!result.success) {
    console.error('AWS CLI not installed or not configured correctly');
    console.error(result.error);
    process.exit(1);
  }
  
  console.log(`AWS CLI configured for region: ${result.output.trim()}`);
  return true;
}

/**
 * Verify mongosh is installed
 */
function checkMongoshInstallation() {
  console.log('Checking MongoDB shell installation...');
  
  const result = executeCommand('mongosh --version');
  if (!result.success) {
    console.error('MongoDB shell (mongosh) is not installed or not in PATH');
    console.error(result.error);
    process.exit(1);
  }
  
  console.log(`MongoDB shell version: ${result.output.trim()}`);
  return true;
}

/**
 * Verify Lambda function exists
 */
function checkLambdaFunction() {
  console.log(`Checking if Lambda function ${config.lambdaFunctionName} exists...`);
  
  const result = executeCommand(`aws lambda get-function --function-name ${config.lambdaFunctionName} --region ${config.awsRegion} --query 'Configuration.FunctionName'`);
  if (!result.success) {
    console.error(`Lambda function ${config.lambdaFunctionName} does not exist in region ${config.awsRegion}`);
    console.error(result.error);
    return false;
  }
  
  console.log(`Lambda function ${result.output.trim()} found!`);
  return true;
}

/**
 * Invoke Lambda function with test data
 */
function invokeLambdaFunction(testCase) {
  const testName = testCase.name.replace(/\s+/g, '-').toLowerCase();
  const responseFile = path.join(tempDir, `${testName}-response.json`);
  
  console.log(`\nInvoking Lambda function with test case: ${testCase.name}`);
  console.log(`Test data: ${JSON.stringify(testCase.data)}`);
  
  // Prepare the payload - Lambda expects event.body to be a stringified JSON
  const payload = JSON.stringify({
    body: JSON.stringify(testCase.data)
  });
  
  // Execute the Lambda invoke command
  const command = `aws lambda invoke --function-name ${config.lambdaFunctionName} --region ${config.awsRegion} --payload '${payload}' --cli-binary-format raw-in-base64-out ${responseFile}`;
  
  const result = executeCommand(command);
  if (!result.success) {
    console.error(`Failed to invoke Lambda function for test case: ${testCase.name}`);
    console.error(result.error);
    return null;
  }
  
  // Parse and display the Lambda response
  try {
    const responseContent = fs.readFileSync(responseFile, 'utf-8');
    const response = JSON.parse(responseContent);
    
    console.log('Lambda invocation successful');
    console.log('Response status code:', response.statusCode);
    
    if (response.body) {
      const responseBody = JSON.parse(response.body);
      console.log('Processed metrics:', responseBody.processed);
      console.log('Alerts generated:', responseBody.alerts.length);
      
      if (responseBody.alerts.length > 0) {
        console.log('Alert details:');
        responseBody.alerts.forEach(alert => {
          console.log(`  - Type: ${alert.type}, Value: ${alert.value}, Message: ${alert.message}`);
        });
      }
    }
    
    return response;
  } catch (error) {
    console.error('Failed to parse Lambda response');
    console.error(error);
    return null;
  }
}

/**
 * Check CloudWatch logs for Lambda execution
 */
function checkCloudWatchLogs() {
  console.log('\nChecking CloudWatch logs for recent Lambda executions...');
  
  const logGroupName = `/aws/lambda/${config.lambdaFunctionName}`;
  
  // Get the most recent log stream
  const streamCommand = `aws logs describe-log-streams --log-group-name ${logGroupName} --region ${config.awsRegion} --order-by LastEventTime --descending --limit 1 --query 'logStreams[0].logStreamName' --output text`;
  
  const streamResult = executeCommand(streamCommand);
  if (!streamResult.success) {
    console.error('Failed to get log streams');
    console.error(streamResult.error);
    return;
  }
  
  const logStreamName = streamResult.output.trim();
  
  // Get recent log events
  const logsCommand = `aws logs get-log-events --log-group-name ${logGroupName} --log-stream-name ${logStreamName} --region ${config.awsRegion} --limit 10`;
  
  const logsResult = executeCommand(logsCommand);
  if (!logsResult.success) {
    console.error('Failed to get log events');
    console.error(logsResult.error);
    return;
  }
  
  try {
    const logs = JSON.parse(logsResult.output);
    console.log('Recent log events:');
    
    if (logs.events && logs.events.length > 0) {
      logs.events.forEach(event => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`[${timestamp}] ${event.message.trim()}`);
      });
    } else {
      console.log('No recent log events found');
    }
  } catch (error) {
    console.error('Failed to parse CloudWatch logs');
    console.error(error);
  }
}

/**
 * Check MongoDB for stored alerts
 */
function checkMongoDBAlerts(userId) {
  console.log(`\nChecking MongoDB for alerts for user: ${userId}`);
  
  // Create a script to execute with mongosh
  const mongoScriptFile = path.join(tempDir, 'check-alerts.js');
  const mongoScript = `
    use('${config.mongoUri.split('/').pop()}');
    db.${config.alertsCollection}.find(
      { userId: '${userId}' }, 
      { projection: { _id: 0, userId: 1, type: 1, value: 1, message: 1, timestamp: 1 } }
    ).sort({ timestamp: -1 }).limit(10).toArray();
  `;
  
  fs.writeFileSync(mongoScriptFile, mongoScript);
  
  // Execute the MongoDB script
  const command = `mongosh "${config.mongoUri}" --quiet --file "${mongoScriptFile}"`;
  
  const result = executeCommand(command);
  if (!result.success) {
    console.error('Failed to query MongoDB');
    console.error(result.error);
    return;
  }
  
  try {
    // Format and display the results
    console.log('Recent alerts from MongoDB:');
    console.log(result.output);
  } catch (error) {
    console.error('Failed to parse MongoDB results');
    console.error(error);
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('=== Live Lambda Testing Harness ===\n');
  
  // Verify prerequisites
  checkAwsConfiguration();
  checkMongoshInstallation();
  
  // Ask for confirmations and configurations
  const proceedWithTest = await promptUser('This will test your live Lambda function in AWS. Continue? (y/n): ');
  if (proceedWithTest.toLowerCase() !== 'y') {
    console.log('Test cancelled');
    return;
  }
  
  // Allow updating configuration
  const updateConfig = await promptUser('Do you want to update the test configuration? (y/n): ');
  if (updateConfig.toLowerCase() === 'y') {
    config.lambdaFunctionName = await promptUser(`Lambda function name [${config.lambdaFunctionName}]: `) || config.lambdaFunctionName;
    config.awsRegion = await promptUser(`AWS region [${config.awsRegion}]: `) || config.awsRegion;
    config.mongoUri = await promptUser(`MongoDB URI [${config.mongoUri}]: `) || config.mongoUri;
  }
  
  // Check if Lambda function exists
  if (!checkLambdaFunction()) {
    const createLambda = await promptUser('Lambda function not found. Do you want to create it? (y/n): ');
    if (createLambda.toLowerCase() === 'y') {
      console.log('Please follow the deployment instructions in the README.md file');
    }
    return;
  }
  
  // Run the tests
  console.log('\n=== Running Lambda Tests ===');
  
  for (const testCase of config.testCases) {
    const response = invokeLambdaFunction(testCase);
    if (response) {
      console.log(`Test case: ${testCase.name} completed successfully`);
    }
  }
  
  // Check CloudWatch logs
  checkCloudWatchLogs();
  
  // Check MongoDB for alerts
  const userId = config.testCases[0].data.userId;
  const checkMongo = await promptUser('\nDo you want to check MongoDB for stored alerts? (y/n): ');
  if (checkMongo.toLowerCase() === 'y') {
    checkMongoDBAlerts(userId);
  }
  
  console.log('\n=== All Tests Completed ===');
  console.log('Check the results above to confirm everything is working as expected.');
  
  // Clean up temp files
  console.log('\nCleaning up temporary files...');
  fs.rmSync(tempDir, { recursive: true, force: true });
  
  console.log('Done!');
}

// Run the tests
runTests().catch(error => {
  console.error('Test failed with error:', error);
});