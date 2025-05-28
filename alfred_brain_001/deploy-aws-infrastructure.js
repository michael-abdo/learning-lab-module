/**
 * Deploy AWS Infrastructure
 * 
 * Script to deploy CloudFormation stacks for AWS infrastructure
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-1';
AWS.config.update({
  region: region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cloudformation = new AWS.CloudFormation();

// Command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Stack configuration
const stacks = {
  s3: {
    name: 'alfred-brain-s3',
    template: 'infrastructure/cloudformation/s3-bucket.yaml',
    description: 'Alfred Brain S3 bucket infrastructure',
    params: [
      { ParameterKey: 'EnvironmentName', UsePreviousValue: false },
      { ParameterKey: 'BucketName', UsePreviousValue: false },
      { ParameterKey: 'AccessLogBucketEnabled', UsePreviousValue: false },
      { ParameterKey: 'ExpirationDays', UsePreviousValue: false },
      { ParameterKey: 'TransitionToColdStorageDays', UsePreviousValue: false }
    ],
    defaultParams: {
      EnvironmentName: 'dev',
      BucketName: 'alfred-brain-data',
      AccessLogBucketEnabled: 'false',
      ExpirationDays: '90',
      TransitionToColdStorageDays: '30'
    }
  },
  iam: {
    name: 'alfred-brain-iam',
    template: 'infrastructure/cloudformation/iam-roles.yaml',
    description: 'Alfred Brain IAM roles and policies',
    params: [
      { ParameterKey: 'EnvironmentName', UsePreviousValue: false },
      { ParameterKey: 'DataBucketName', UsePreviousValue: false },
      { ParameterKey: 'LambdaFunctionName', UsePreviousValue: false },
      { ParameterKey: 'ApiUserName', UsePreviousValue: false }
    ],
    defaultParams: {
      EnvironmentName: 'dev',
      DataBucketName: process.env.S3_BUCKET || 'alfred-brain-data',
      LambdaFunctionName: 'AlfredBrainProcessor',
      ApiUserName: 'alfred-brain-api'
    }
  },
  terra: {
    name: 'alfred-brain-terra',
    template: 'infrastructure/cloudformation/terra-scheduler.yaml',
    description: 'Alfred Brain Terra Scheduler',
    params: [
      { ParameterKey: 'EnvironmentName', UsePreviousValue: false },
      { ParameterKey: 'LambdaFunctionName', UsePreviousValue: false },
      { ParameterKey: 'ScheduleExpression', UsePreviousValue: false },
      { ParameterKey: 'BatchSize', UsePreviousValue: false },
      { ParameterKey: 'LambdaMemorySize', UsePreviousValue: false },
      { ParameterKey: 'LambdaTimeout', UsePreviousValue: false },
      { ParameterKey: 'MongoDBSecretName', UsePreviousValue: false }
    ],
    defaultParams: {
      EnvironmentName: 'dev',
      LambdaFunctionName: 'AlfredBrainTerraDataFetcher',
      ScheduleExpression: 'rate(6 hours)',
      BatchSize: '50',
      LambdaMemorySize: '512',
      LambdaTimeout: '300',
      MongoDBSecretName: 'alfred-brain/mongodb'
    }
  }
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
async function getStackParameters(params, stackName, stackConfig) {
  console.log(`\nConfiguring parameters for ${stackName}:`);
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const paramName = param.ParameterKey;
    
    // Get default value from stackConfig or use an empty string
    let defaultValue = '';
    if (stackConfig && stackConfig.defaultParams && stackConfig.defaultParams[paramName]) {
      defaultValue = stackConfig.defaultParams[paramName];
    }
    
    const answer = await askQuestion(`${paramName} (${defaultValue}): `);
    param.ParameterValue = answer || defaultValue;
    delete param.UsePreviousValue;
  }
  
  return params;
}

// Function to check stack status
async function getStackStatus(stackName) {
  try {
    const result = await cloudformation.describeStacks({ StackName: stackName }).promise();
    return { exists: true, status: result.Stacks[0].StackStatus };
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return { exists: false, status: null };
    }
    throw error;
  }
}

// Function to delete a stack
async function deleteStack(stackName) {
  console.log(`\nDeleting stack ${stackName}...`);
  try {
    await cloudformation.deleteStack({ StackName: stackName }).promise();
    console.log(`Stack deletion initiated for ${stackName}`);
    
    // Wait for stack deletion to complete
    console.log('Waiting for stack deletion to complete...');
    await cloudformation.waitFor('stackDeleteComplete', { StackName: stackName }).promise();
    console.log('Stack deletion completed successfully.');
    return true;
  } catch (error) {
    console.error(`Error deleting stack: ${error.message}`);
    return false;
  }
}

// Function to deploy a CloudFormation stack
async function deployStack(stackConfig) {
  try {
    const stackName = stackConfig.name;
    const templateBody = readTemplate(stackConfig.template);
    
    // Check if stack exists and get status
    let { exists, status } = await getStackStatus(stackName);
    
    if (exists) {
      console.log(`\nStack ${stackName} exists with status: ${status}`);
      
      // Handle problematic states (ROLLBACK_COMPLETE, etc.)
      const problematicStates = ['ROLLBACK_COMPLETE', 'CREATE_FAILED', 'ROLLBACK_FAILED', 'DELETE_FAILED', 'UPDATE_ROLLBACK_COMPLETE'];
      
      if (problematicStates.includes(status)) {
        console.log(`Stack is in ${status} state, which requires deletion before deployment.`);
        
        const deleteSuccessful = await deleteStack(stackName);
        if (!deleteSuccessful) {
          console.error('Failed to delete stack. Cannot proceed with deployment.');
          return false;
        }
        // Set exists to false since we deleted the stack
        exists = false;
      } else if (status.includes('IN_PROGRESS')) {
        console.error(`Stack operation already in progress: ${status}. Please wait for it to complete.`);
        return false;
      }
    } else {
      console.log(`\nStack ${stackName} does not exist. Will create a new stack.`);
    }
    
    // Get parameters from user
    const params = await getStackParameters(stackConfig.params, stackName, stackConfig);
    
    // Prepare the CloudFormation parameters
    const cfParams = {
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: params,
      Capabilities: ['CAPABILITY_NAMED_IAM'],
      Tags: [
        { Key: 'Application', Value: 'AlfredBrain' },
        { Key: 'Environment', Value: params.find(p => p.ParameterKey === 'EnvironmentName')?.ParameterValue || 'dev' }
      ]
    };
    
    // Create or update the stack
    if (exists) {
      console.log(`\nUpdating stack ${stackName}...`);
      await cloudformation.updateStack(cfParams).promise();
    } else {
      console.log(`\nCreating stack ${stackName}...`);
      await cloudformation.createStack(cfParams).promise();
    }
    
    console.log(`\nStack ${stackName} ${exists ? 'update' : 'creation'} initiated.`);
    console.log('Waiting for stack to complete...');
    
    // Wait for stack to complete
    await cloudformation.waitFor(
      exists ? 'stackUpdateComplete' : 'stackCreateComplete',
      { StackName: stackName }
    ).promise();
    
    // Get stack outputs
    const stackResult = await cloudformation.describeStacks({ StackName: stackName }).promise();
    const outputs = stackResult.Stacks[0].Outputs;
    
    console.log(`\nStack ${stackName} ${exists ? 'updated' : 'created'} successfully!`);
    
    if (outputs && outputs.length > 0) {
      console.log('\nStack Outputs:');
      outputs.forEach(output => {
        console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
        
        // If this is the S3 bucket name, save it to environment for IAM stack
        if (output.OutputKey === 'DataBucketName') {
          process.env.S3_BUCKET_NAME = output.OutputValue;
        }
      });
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
  console.log('==== Alfred Brain AWS Infrastructure Deployment ====');
  
  try {
    // Ask which stack to deploy
    console.log('\nAvailable stacks:');
    console.log('1. S3 Bucket');
    console.log('2. IAM Roles & Policies');
    console.log('3. Terra Scheduler');
    console.log('4. All Stacks (in order)');
    
    const choice = await askQuestion('\nWhich stack would you like to deploy? (1-4): ');
    
    if (choice === '1') {
      await deployStack(stacks.s3);
    } else if (choice === '2') {
      await deployStack(stacks.iam);
    } else if (choice === '3') {
      await deployStack(stacks.terra);
    } else if (choice === '4') {
      // Deploy stacks in order
      const s3Success = await deployStack(stacks.s3);
      if (s3Success) {
        const iamSuccess = await deployStack(stacks.iam);
        if (iamSuccess) {
          await deployStack(stacks.terra);
        }
      }
    } else {
      console.log('Invalid choice. Exiting.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
main();