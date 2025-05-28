#!/usr/bin/env node

/**
 * Deploy Terra Lambda Function
 * 
 * This script packages and deploys the Terra data fetcher Lambda function to AWS.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const STACK_NAME = 'alfred-brain-terra';
const LAMBDA_FUNCTION_NAME = 'AlfredBrainTerraDataFetcher-dev';
const LAMBDA_SOURCE_FILE = path.join(__dirname, '../infrastructure/lambda/fetchTerraData.js');
const BUILD_DIR = path.join(__dirname, '../build');
const ZIP_FILE = path.join(BUILD_DIR, 'terra-lambda.zip');
const NODE_MODULES_DIR = path.join(__dirname, '../node_modules');

// Dependencies required for the Lambda function
const DEPENDENCIES = [
  'aws-sdk',
  'axios',
  'mongoose'
];

// Function to run shell commands safely
function runCommand(command, args, options = {}) {
  console.log(`Running: ${command} ${args.join(' ')}`);
  
  const result = spawnSync(command, args, { 
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    ...options
  });
  
  return {
    success: result.status === 0,
    error: result.error,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

// Function to get Lambda function ARN
function getLambdaArn() {
  console.log(`Getting ARN for Lambda function: ${LAMBDA_FUNCTION_NAME}`);
  
  const result = spawnSync('aws', [
    'lambda',
    'get-function',
    '--function-name', LAMBDA_FUNCTION_NAME,
    '--query', 'Configuration.FunctionArn',
    '--output', 'text'
  ], { encoding: 'utf8', stdio: 'pipe' });
  
  if (result.status !== 0) {
    console.error(`Failed to get Lambda ARN: ${result.stderr}`);
    return null;
  }
  
  return result.stdout.trim();
}

// Function to create a deployment package
function createDeploymentPackage() {
  console.log('Creating deployment package...');
  
  // Create build directory if it doesn't exist
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }
  
  // Create a temporary directory for packaging
  const tempDir = path.join(BUILD_DIR, 'lambda-package');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  
  // Copy the Lambda function file
  fs.copyFileSync(LAMBDA_SOURCE_FILE, path.join(tempDir, 'fetchTerraData.js'));
  
  // Create node_modules directory
  const tempNodeModules = path.join(tempDir, 'node_modules');
  fs.mkdirSync(tempNodeModules, { recursive: true });
  
  // Copy required dependencies
  for (const dependency of DEPENDENCIES) {
    const sourcePath = path.join(NODE_MODULES_DIR, dependency);
    const destPath = path.join(tempNodeModules, dependency);
    
    console.log(`Copying dependency: ${dependency}`);
    
    if (!fs.existsSync(sourcePath)) {
      console.error(`Dependency not found: ${dependency}`);
      continue;
    }
    
    // Copy the dependency folder
    runCommand('cp', ['-r', sourcePath, destPath]);
  }
  
  // Create zip file
  console.log(`Creating zip file: ${ZIP_FILE}`);
  if (fs.existsSync(ZIP_FILE)) {
    fs.unlinkSync(ZIP_FILE);
  }
  
  // Change to the temp directory to zip
  const currentDir = process.cwd();
  process.chdir(tempDir);
  
  // Create the zip file
  const zipResult = runCommand('zip', ['-r', ZIP_FILE, '.']);
  
  // Return to the original directory
  process.chdir(currentDir);
  
  if (!zipResult.success) {
    console.error('Failed to create zip file');
    return false;
  }
  
  console.log('Deployment package created successfully');
  
  // Clean up the temporary directory
  fs.rmSync(tempDir, { recursive: true, force: true });
  
  return true;
}

// Function to update the Lambda function code
function updateLambdaCode() {
  console.log('Updating Lambda function code...');
  
  if (!fs.existsSync(ZIP_FILE)) {
    console.error(`Zip file not found: ${ZIP_FILE}`);
    return false;
  }
  
  // Update the Lambda function code
  const updateResult = runCommand('aws', [
    'lambda',
    'update-function-code',
    '--function-name', LAMBDA_FUNCTION_NAME,
    '--zip-file', `fileb://${ZIP_FILE}`
  ]);
  
  if (!updateResult.success) {
    console.error('Failed to update Lambda function code');
    return false;
  }
  
  console.log('Lambda function code updated successfully');
  
  // Wait for the function to be updated
  console.log('Waiting for function update to complete...');
  const waitResult = runCommand('aws', [
    'lambda',
    'wait',
    'function-updated',
    '--function-name', LAMBDA_FUNCTION_NAME
  ]);
  
  if (!waitResult.success) {
    console.error('Failed to wait for function update');
    return false;
  }
  
  console.log('Lambda function update completed successfully');
  return true;
}

// Function to create the MongoDB secret in AWS Secrets Manager
function createMongoDBSecret(secretName, mongoUri) {
  console.log(`Creating/updating MongoDB secret: ${secretName}`);
  
  const secretValue = JSON.stringify({
    MONGODB_URI: mongoUri
  });
  
  // Check if the secret exists
  const checkResult = runCommand('aws', [
    'secretsmanager',
    'describe-secret',
    '--secret-id', secretName
  ], { silent: true });
  
  if (checkResult.success) {
    // Secret exists, update it
    const updateResult = runCommand('aws', [
      'secretsmanager',
      'update-secret',
      '--secret-id', secretName,
      '--secret-string', secretValue
    ]);
    
    if (!updateResult.success) {
      console.error('Failed to update MongoDB secret');
      return false;
    }
  } else {
    // Secret doesn't exist, create it
    const createResult = runCommand('aws', [
      'secretsmanager',
      'create-secret',
      '--name', secretName,
      '--description', 'MongoDB connection URI for Alfred Brain',
      '--secret-string', secretValue
    ]);
    
    if (!createResult.success) {
      console.error('Failed to create MongoDB secret');
      return false;
    }
  }
  
  console.log('MongoDB secret created/updated successfully');
  return true;
}

// Function to test the Lambda function
function testLambda() {
  console.log('Testing Lambda function...');
  
  const testPayload = JSON.stringify({
    batchSize: 10,
    skipUsers: 0,
    environment: 'dev',
    test: true
  });
  
  const tempPayloadFile = path.join(BUILD_DIR, 'test-payload.json');
  fs.writeFileSync(tempPayloadFile, testPayload);
  
  const invokeResult = runCommand('aws', [
    'lambda',
    'invoke',
    '--function-name', LAMBDA_FUNCTION_NAME,
    '--payload', `file://${tempPayloadFile}`,
    '--cli-binary-format', 'raw-in-base64-out',
    path.join(BUILD_DIR, 'lambda-result.json')
  ]);
  
  // Clean up the temporary payload file
  fs.unlinkSync(tempPayloadFile);
  
  if (!invokeResult.success) {
    console.error('Failed to invoke Lambda function');
    return false;
  }
  
  console.log('Lambda function invoked successfully');
  
  // Display the result
  const resultFile = path.join(BUILD_DIR, 'lambda-result.json');
  if (fs.existsSync(resultFile)) {
    const result = fs.readFileSync(resultFile, 'utf8');
    console.log('Lambda function result:');
    console.log(result);
    fs.unlinkSync(resultFile);
  }
  
  return true;
}

// Main function with option to use environment variables or command line arguments
async function main() {
  try {
    // Get MongoDB URI from environment or command line
    let mongoUri = process.env.MONGODB_URI;
    let runTest = process.env.RUN_LAMBDA_TEST === 'true';
    
    // Use command line arguments if provided
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--mongodb-uri' && i + 1 < args.length) {
        mongoUri = args[i + 1];
        i++;
      } else if (args[i] === '--test') {
        runTest = true;
      } else if (args[i] === '--help') {
        console.log(`
Usage: node deploy-terra-lambda.js [options]

Options:
  --mongodb-uri <uri>  MongoDB connection URI (required if MONGODB_URI env var not set)
  --test               Run Lambda test after deployment
  --help               Show this help message
        `);
        process.exit(0);
      }
    }
    
    // Check for MongoDB URI
    if (!mongoUri) {
      console.log('MongoDB URI not provided via environment or command line arguments.');
      console.log('Please enter your MongoDB URI:');
      
      // Interactive prompt for MongoDB URI
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const promptMongoUri = () => {
        return new Promise((resolve) => {
          readline.question('MongoDB URI: ', (uri) => {
            readline.close();
            resolve(uri);
          });
        });
      };
      
      mongoUri = await promptMongoUri();
    }
    
    if (!mongoUri || mongoUri.trim() === '') {
      console.error('MongoDB URI is required');
      process.exit(1);
    }
    
    // Create MongoDB secret
    const secretName = 'alfred-brain/mongodb';
    const secretCreated = createMongoDBSecret(secretName, mongoUri);
    
    if (!secretCreated) {
      console.error('Failed to create MongoDB secret');
      process.exit(1);
    }
    
    // Create deployment package
    const packageCreated = createDeploymentPackage();
    if (!packageCreated) {
      console.error('Failed to create deployment package');
      process.exit(1);
    }
    
    // First make sure the stack is deployed with the placeholder Lambda
    console.log('Deploying CloudFormation stack if needed...');
    const deployStackResult = runCommand('node', [
      path.join(__dirname, 'deploy-terra-scheduler.js')
    ]);
    
    if (!deployStackResult.success) {
      console.error('Failed to deploy CloudFormation stack');
      process.exit(1);
    }
    
    // Update the Lambda function code
    const lambdaUpdated = updateLambdaCode();
    if (!lambdaUpdated) {
      console.error('Failed to update Lambda function code');
      process.exit(1);
    }
    
    // Test the Lambda function if requested
    if (runTest) {
      console.log('Running Lambda function test...');
      const testResult = testLambda();
      if (!testResult) {
        console.error('Lambda test failed');
        process.exit(1);
      }
    } else {
      console.log('Skipping Lambda test (use --test flag to run test)');
    }
    
    console.log('Deployment completed successfully!');
    console.log(`Lambda function ${LAMBDA_FUNCTION_NAME} has been deployed.`);
    
    const lambdaArn = getLambdaArn();
    if (lambdaArn) {
      console.log(`Lambda ARN: ${lambdaArn}`);
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the main function
main();