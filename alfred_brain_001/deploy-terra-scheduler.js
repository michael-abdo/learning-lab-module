#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const STACK_NAME = 'alfred-brain-terra';
const TEMPLATE_FILE = path.join(__dirname, '../infrastructure/cloudformation/terra-scheduler.yaml');

// Function to run AWS CLI commands safely
function runAwsCommand(args) {
  console.log(`Running: aws ${args.join(' ')}`);
  
  const result = spawnSync('aws', args, { 
    encoding: 'utf8',
    stdio: 'inherit'
  });
  
  return {
    success: result.status === 0,
    error: result.error,
    status: result.status
  };
}

// Function to check if stack exists and its status
function getStackStatus(stackName) {
  try {
    const tempFile = path.join(__dirname, '.stack-status-temp.json');
    
    // Use file output instead of stdout to avoid issues with parsing
    const result = spawnSync('aws', [
      'cloudformation',
      'describe-stacks',
      '--stack-name', stackName,
      '--query', 'Stacks[0].StackStatus',
      '--output', 'text'
    ], { encoding: 'utf8' });
    
    if (result.status !== 0) {
      // Check if the error is because the stack doesn't exist
      if (result.stderr && result.stderr.includes('does not exist')) {
        return { exists: false, status: null };
      }
      throw new Error(`AWS CLI Error: ${result.stderr}`);
    }
    
    return { exists: true, status: result.stdout.trim() };
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return { exists: false, status: null };
    }
    console.error('Error checking stack status:', error);
    throw error;
  }
}

// Function to delete a stack
function deleteStack(stackName) {
  console.log(`Deleting stack ${stackName}...`);
  
  const deleteResult = runAwsCommand([
    'cloudformation',
    'delete-stack',
    '--stack-name', stackName
  ]);
  
  if (!deleteResult.success) {
    console.error('Failed to delete stack');
    return false;
  }
  
  console.log('Stack deletion initiated. Waiting for completion...');
  
  const waitResult = runAwsCommand([
    'cloudformation',
    'wait',
    'stack-delete-complete',
    '--stack-name', stackName
  ]);
  
  if (!waitResult.success) {
    console.error('Failed to wait for stack deletion');
    return false;
  }
  
  console.log('Stack deletion completed successfully');
  return true;
}

// Function to deploy the stack
function deployStack(templateFile, stackName) {
  console.log(`Deploying stack ${stackName} using template ${templateFile}...`);
  
  // Write template to a temporary file to avoid path issues
  const tempTemplatePath = path.join(__dirname, '.template-temp.yaml');
  fs.copyFileSync(templateFile, tempTemplatePath);
  
  const deployResult = runAwsCommand([
    'cloudformation',
    'deploy',
    '--template-file', tempTemplatePath,
    '--stack-name', stackName,
    '--capabilities', 'CAPABILITY_NAMED_IAM'
  ]);
  
  // Clean up temp file
  try {
    fs.unlinkSync(tempTemplatePath);
  } catch (err) {
    console.log('Warning: Failed to clean up temporary template file');
  }
  
  if (!deployResult.success) {
    console.error('Stack deployment failed');
    return false;
  }
  
  console.log('Stack deployment completed successfully');
  return true;
}

// Main function
async function main() {
  try {
    console.log(`Checking if template file exists at: ${TEMPLATE_FILE}`);
    if (!fs.existsSync(TEMPLATE_FILE)) {
      console.error(`Template file not found: ${TEMPLATE_FILE}`);
      process.exit(1);
    }
    
    console.log('Checking stack status...');
    const { exists, status } = getStackStatus(STACK_NAME);
    
    if (exists) {
      console.log(`Stack ${STACK_NAME} exists with status: ${status}`);
      
      // Handle problematic states
      const problematicStates = ['ROLLBACK_COMPLETE', 'CREATE_FAILED', 'ROLLBACK_FAILED', 'DELETE_FAILED', 'UPDATE_ROLLBACK_COMPLETE'];
      
      if (problematicStates.includes(status)) {
        console.log(`Stack is in ${status} state, which requires deletion before deployment.`);
        
        const deleteSuccessful = deleteStack(STACK_NAME);
        if (!deleteSuccessful) {
          console.error('Failed to delete stack. Cannot proceed with deployment.');
          process.exit(1);
        }
      } else if (status.includes('IN_PROGRESS')) {
        console.error(`Stack operation already in progress: ${status}. Please wait for it to complete.`);
        process.exit(1);
      }
    } else {
      console.log(`Stack ${STACK_NAME} does not exist. Will create a new stack.`);
    }
    
    // Deploy the stack
    const deploySuccessful = deployStack(TEMPLATE_FILE, STACK_NAME);
    if (!deploySuccessful) {
      console.error('Stack deployment failed.');
      process.exit(1);
    }
    
    console.log(`Successfully deployed stack ${STACK_NAME}`);
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the main function
main();