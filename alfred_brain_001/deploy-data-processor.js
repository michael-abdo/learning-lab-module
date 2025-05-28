/**
 * Deploy Data Processor Infrastructure
 * 
 * Script to deploy CloudFormation stack for the data processing Lambda function
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const archiver = require('archiver');

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-1';
AWS.config.update({
  region: region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cloudformation = new AWS.CloudFormation();
const lambda = new AWS.Lambda();
const s3 = new AWS.S3();

// Command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Stack configuration
const processorStack = {
  name: 'alfred-brain-data-processor',
  template: 'infrastructure/cloudformation/data-processor.yaml',
  description: 'Alfred Brain data processor Lambda function',
  params: [
    { ParameterKey: 'EnvironmentName', UsePreviousValue: false },
    { ParameterKey: 'S3BucketName', UsePreviousValue: false },
    { ParameterKey: 'LambdaFunctionName', UsePreviousValue: false },
    { ParameterKey: 'ScheduleExpression', UsePreviousValue: false },
    { ParameterKey: 'MongoDBURI', UsePreviousValue: false }
  ]
};

// Function to read template files
function readTemplate(templatePath) {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), templatePath), 'utf8');
  } catch (error) {
    console.error(`Error reading template file ${templatePath}: ${error.message}`);
    process.exit(1);
  }
}

// Function to ask questions
async function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Function to ask for stack parameters
async function getStackParameters(params) {
  console.log(`\nConfiguring parameters for data processor stack:`);
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const paramName = param.ParameterKey;
    
    let defaultValue = '';
    if (paramName === 'EnvironmentName') {
      defaultValue = 'dev';
    } else if (paramName === 'S3BucketName') {
      defaultValue = process.env.S3_BUCKET || 'learning-lab-demo--bucket';
    } else if (paramName === 'LambdaFunctionName') {
      defaultValue = 'AlfredBrainDataProcessor';
    } else if (paramName === 'ScheduleExpression') {
      defaultValue = 'rate(1 day)';
    } else if (paramName === 'MongoDBURI') {
      defaultValue = process.env.MONGODB_URI || '';
    }
    
    const answer = await askQuestion(`${paramName} (${defaultValue}): `);
    param.ParameterValue = answer || defaultValue;
    delete param.UsePreviousValue;
  }
  
  return params;
}

// Function to create a Lambda deployment package
async function createLambdaPackage() {
  return new Promise((resolve, reject) => {
    const outputPath = path.resolve(process.cwd(), 'build/lambda-package.zip');
    const outputDir = path.dirname(outputPath);
    
    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create a file to stream archive data to
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level
    });
    
    // Listen for all archive data to be written
    output.on('close', () => {
      console.log(`Lambda package created: ${outputPath} (${archive.pointer()} bytes)`);
      resolve(outputPath);
    });
    
    // Good practice to catch warnings
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archive warning:', err);
      } else {
        reject(err);
      }
    });
    
    // Good practice to catch this error explicitly
    archive.on('error', (err) => {
      reject(err);
    });
    
    // Pipe archive data to the file
    archive.pipe(output);
    
    // Add Lambda function code
    archive.file(
      path.resolve(process.cwd(), 'infrastructure/lambda/processWearableData.js'),
      { name: 'processWearableData.js' }
    );
    
    // Add utilities
    archive.file(
      path.resolve(process.cwd(), 'scripts/normalize-utils.js'),
      { name: 'normalize-utils.js' }
    );
    
    archive.file(
      path.resolve(process.cwd(), 'scripts/process-data.js'),
      { name: 'process-data.js' }
    );
    
    // Add wearable data model
    archive.file(
      path.resolve(process.cwd(), 'backend/models/wearableDataModel.js'),
      { name: 'models/wearableDataModel.js' }
    );
    
    // Add package.json
    const packageJson = {
      name: 'alfred-brain-data-processor',
      version: '1.0.0',
      description: 'Lambda function to process Alfred Brain wearable data',
      main: 'processWearableData.js',
      dependencies: {
        'aws-sdk': '^2.1450.0',
        'mongoose': '^7.4.3',
        'date-fns': '^2.30.0',
        'date-fns-tz': '^2.0.0'
      }
    };
    
    archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
    
    // Finalize the archive
    archive.finalize();
  });
}

// Function to upload Lambda package to S3
async function uploadLambdaPackage(packagePath, bucketName) {
  const s3Key = 'lambda/alfred-brain-data-processor.zip';
  
  try {
    console.log(`\nUploading Lambda package to S3...`);
    
    // Read the package file
    const fileContent = fs.readFileSync(packagePath);
    
    // Upload to S3
    const params = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent
    };
    
    await s3.putObject(params).promise();
    console.log(`Lambda package uploaded to s3://${bucketName}/${s3Key}`);
    
    return {
      bucket: bucketName,
      key: s3Key
    };
  } catch (error) {
    console.error(`Error uploading Lambda package to S3: ${error.message}`);
    throw error;
  }
}

// Function to update Lambda function code
async function updateLambdaFunction(functionName, s3Location) {
  try {
    console.log(`\nUpdating Lambda function code...`);
    
    // Update the Lambda function code
    const params = {
      FunctionName: functionName,
      S3Bucket: s3Location.bucket,
      S3Key: s3Location.key
    };
    
    const result = await lambda.updateFunctionCode(params).promise();
    console.log(`Lambda function updated: ${result.FunctionName}, version: ${result.Version}`);
    
    return result;
  } catch (error) {
    console.error(`Error updating Lambda function: ${error.message}`);
    throw error;
  }
}

// Function to deploy a CloudFormation stack
async function deployStack(stackConfig) {
  try {
    const stackName = stackConfig.name;
    const templateBody = readTemplate(stackConfig.template);
    
    // Check if stack exists
    let stackExists = false;
    try {
      await cloudformation.describeStacks({ StackName: stackName }).promise();
      stackExists = true;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        stackExists = false;
      } else {
        throw error;
      }
    }
    
    // Get parameters from user
    const params = await getStackParameters(stackConfig.params);
    
    // Extract bucket name and Lambda function name
    const bucketName = params.find(p => p.ParameterKey === 'S3BucketName')?.ParameterValue;
    const lambdaFunctionName = params.find(p => p.ParameterKey === 'LambdaFunctionName')?.ParameterValue;
    const environmentName = params.find(p => p.ParameterKey === 'EnvironmentName')?.ParameterValue || 'dev';
    
    // Prepare the CloudFormation parameters
    const cfParams = {
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: params,
      Capabilities: ['CAPABILITY_NAMED_IAM'],
      Tags: [
        { Key: 'Application', Value: 'AlfredBrain' },
        { Key: 'Environment', Value: environmentName }
      ]
    };
    
    // Create or update the stack
    if (stackExists) {
      console.log(`\nUpdating stack ${stackName}...`);
      await cloudformation.updateStack(cfParams).promise();
    } else {
      console.log(`\nCreating stack ${stackName}...`);
      await cloudformation.createStack(cfParams).promise();
    }
    
    console.log(`\nStack ${stackName} ${stackExists ? 'update' : 'creation'} initiated.`);
    console.log('Waiting for stack to complete...');
    
    // Wait for stack to complete
    await cloudformation.waitFor(
      stackExists ? 'stackUpdateComplete' : 'stackCreateComplete',
      { StackName: stackName }
    ).promise();
    
    // Get stack outputs
    const stackResult = await cloudformation.describeStacks({ StackName: stackName }).promise();
    const outputs = stackResult.Stacks[0].Outputs;
    
    console.log(`\nStack ${stackName} ${stackExists ? 'updated' : 'created'} successfully!`);
    
    if (outputs && outputs.length > 0) {
      console.log('\nStack Outputs:');
      outputs.forEach(output => {
        console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
      });
    }
    
    // Create and upload Lambda package
    if (bucketName && lambdaFunctionName) {
      try {
        const packagePath = await createLambdaPackage();
        const s3Location = await uploadLambdaPackage(packagePath, bucketName);
        await updateLambdaFunction(`${lambdaFunctionName}-${environmentName}`, s3Location);
      } catch (error) {
        console.error(`\nError deploying Lambda package: ${error.message}`);
        console.log('CloudFormation stack was deployed, but Lambda function code was not updated.');
      }
    }
    
    return true;
  } catch (error) {
    if (error.message.includes('No updates are to be performed')) {
      console.log('\nNo changes detected in the template. Stack is up to date.');
      return true;
    }
    
    console.error(`\nError deploying stack: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('==== Alfred Brain Data Processor Deployment ====');
  
  try {
    // First, install required packages for deployment
    console.log('Installing required packages...');
    try {
      if (!fs.existsSync(path.resolve(process.cwd(), 'node_modules/archiver'))) {
        require('child_process').execSync('npm install archiver --no-save', { stdio: 'inherit' });
      }
    } catch (error) {
      console.warn(`Warning: Unable to install packages: ${error.message}`);
      console.warn('You may need to manually install "archiver" package.');
    }
    
    // Deploy data processor stack
    await deployStack(processorStack);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
main();