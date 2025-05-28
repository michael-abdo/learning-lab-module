/**
 * Deploy AWS Glue Base Infrastructure
 * 
 * Script to deploy CloudFormation stack for AWS Glue database and IAM role
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
const glueStack = {
  name: 'alfred-brain-glue-base',
  template: 'infrastructure/cloudformation/glue-setup.yaml',
  description: 'Alfred Brain AWS Glue base setup',
  params: [
    { ParameterKey: 'EnvironmentName', UsePreviousValue: false },
    { ParameterKey: 'GlueDatabaseName', UsePreviousValue: false },
    { ParameterKey: 'S3BucketName', UsePreviousValue: false },
    { ParameterKey: 'GlueIAMRoleName', UsePreviousValue: false }
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
  console.log(`\nConfiguring parameters for AWS Glue base stack:`);
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const paramName = param.ParameterKey;
    
    let defaultValue = '';
    if (paramName === 'EnvironmentName') {
      defaultValue = 'dev';
    } else if (paramName === 'GlueDatabaseName') {
      defaultValue = 'alfred_brain_data';
    } else if (paramName === 'S3BucketName') {
      defaultValue = process.env.S3_BUCKET || 'learning-lab-demo--bucket';
    } else if (paramName === 'GlueIAMRoleName') {
      defaultValue = 'AlfredBrainGlueRole';
    }
    
    const answer = await askQuestion(`${paramName} (${defaultValue}): `);
    param.ParameterValue = answer || defaultValue;
    delete param.UsePreviousValue;
  }
  
  return params;
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
  console.log('==== Alfred Brain AWS Glue Base Infrastructure Deployment ====');
  
  try {
    // Deploy Glue stack
    await deployStack(glueStack);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the main function
main();