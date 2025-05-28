/**
 * Script to create a serverless OpenSearch collection and verify the setup
 * This script automates the creation of an AWS OpenSearch Serverless collection
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const { createInterface } = require('readline');

// Create readline interface for console input
const readline = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify the question method
const question = (query) => new Promise(resolve => readline.question(query, resolve));

// Constants
const COLLECTION_NAME = 'learning-lab-collection';
const INDEX_NAME = 'documents';
const DEFAULT_REGION = 'us-east-1';

/**
 * Creates a serverless OpenSearch collection
 */
async function createServerlessCollection(client, collectionName) {
  console.log(`\nCreating OpenSearch Serverless collection: ${collectionName}`);
  
  try {
    const createCollectionParams = {
      name: collectionName,
      type: 'SEARCH', // SEARCH or TIMESERIES
      description: 'Serverless collection for Learning Lab RAG application',
      standbyReplicas: 'DISABLED' // ENABLED or DISABLED
    };
    
    const response = await client.createCollection(createCollectionParams).promise();
    
    console.log('\n✅ Collection creation initiated!');
    console.log('Collection ID:', response.id);
    console.log('Collection Status:', response.status);
    
    return response.id;
  } catch (error) {
    if (error.name === 'ConflictException' && error.message.includes('already exists')) {
      console.log(`\n⚠️ Collection ${collectionName} already exists`);
      // Get the existing collection ID
      const response = await client.batchGetCollection({
        names: [collectionName]
      }).promise();
      
      if (response.collectionDetails.length > 0) {
        return response.collectionDetails[0].id;
      } else {
        throw new Error('Failed to retrieve existing collection ID');
      }
    } else {
      console.error('\n❌ Failed to create collection:', error);
      throw error;
    }
  }
}

/**
 * Creates a network policy to allow access to the OpenSearch collection
 */
async function createNetworkPolicy(client, collectionName) {
  console.log('\nCreating network policy for public access...');
  
  try {
    const policyName = `${collectionName}-network-policy`;
    
    const createNetworkPolicyParams = {
      name: policyName,
      type: 'network',
      description: 'Network policy allowing public access',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${collectionName}`]
          }
        ],
        AWSOwnedKey: true
      })
    };
    
    const response = await client.createSecurityPolicy(createNetworkPolicyParams).promise();
    
    console.log('✅ Network policy created!');
    return response;
  } catch (error) {
    if (error.name === 'ConflictException' && error.message.includes('already exists')) {
      console.log(`⚠️ Network policy for ${collectionName} already exists`);
      return { name: `${collectionName}-network-policy` };
    } else {
      console.error('❌ Failed to create network policy:', error);
      throw error;
    }
  }
}

/**
 * Creates a data access policy to allow full access to the OpenSearch collection
 */
async function createDataAccessPolicy(client, collectionName) {
  console.log('\nCreating data access policy...');
  
  try {
    const policyName = `${collectionName}-access-policy`;
    
    const createAccessPolicyParams = {
      name: policyName,
      type: 'data',
      description: 'Data access policy for learning lab collection',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'index',
              Resource: [`index/${collectionName}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument'
              ]
            },
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems'
              ]
            }
          ],
          Principal: ['*']
        }
      ])
    };
    
    const response = await client.createSecurityPolicy(createAccessPolicyParams).promise();
    
    console.log('✅ Data access policy created!');
    return response;
  } catch (error) {
    if (error.name === 'ConflictException' && error.message.includes('already exists')) {
      console.log(`⚠️ Data access policy for ${collectionName} already exists`);
      return { name: `${collectionName}-access-policy` };
    } else {
      console.error('❌ Failed to create data access policy:', error);
      throw error;
    }
  }
}

/**
 * Waits for the collection to be active
 */
async function waitForCollectionActive(client, collectionName) {
  console.log('\nWaiting for collection to become active...');
  
  let isActive = false;
  let attempt = 0;
  const maxAttempts = 60; // Maximum 30 minutes (60 * 30 seconds)
  
  while (!isActive && attempt < maxAttempts) {
    attempt++;
    
    try {
      const response = await client.batchGetCollection({
        names: [collectionName]
      }).promise();
      
      if (response.collectionDetails.length > 0) {
        const status = response.collectionDetails[0].status;
        const endpoint = response.collectionDetails[0].collectionEndpoint;
        
        console.log(`Attempt ${attempt}: Collection status: ${status}`);
        
        if (status === 'ACTIVE') {
          isActive = true;
          console.log('✅ Collection is now ACTIVE!');
          console.log(`Collection Endpoint: ${endpoint}`);
          return endpoint;
        }
      }
      
      // Wait 30 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      console.error(`Error checking collection status: ${error.message}`);
      // Still wait before retrying
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  if (!isActive) {
    throw new Error(`Collection did not become active after ${maxAttempts} attempts`);
  }
}

/**
 * Updates the .env file with OpenSearch configuration
 */
async function updateEnvFile(endpoint) {
  console.log('\nUpdating .env file with OpenSearch configuration...');
  
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  
  let envContent = '';
  
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Replace or add OPENSEARCH_URL
    if (envContent.includes('OPENSEARCH_URL=')) {
      envContent = envContent.replace(/OPENSEARCH_URL=.*(\r?\n|$)/g, `OPENSEARCH_URL=${endpoint}\n`);
    } else {
      envContent += `\nOPENSEARCH_URL=${endpoint}\n`;
    }
    
    // Check for AWS credentials and add them if not present
    if (!envContent.includes('AWS_ACCESS_KEY_ID=')) {
      const accessKeyId = await question('Enter your AWS Access Key ID: ');
      envContent += `AWS_ACCESS_KEY_ID=${accessKeyId}\n`;
    }
    
    if (!envContent.includes('AWS_SECRET_ACCESS_KEY=')) {
      const secretAccessKey = await question('Enter your AWS Secret Access Key: ');
      envContent += `AWS_SECRET_ACCESS_KEY=${secretAccessKey}\n`;
    }
    
    if (!envContent.includes('AWS_REGION=')) {
      const region = await question(`Enter your AWS Region (default: ${DEFAULT_REGION}): `) || DEFAULT_REGION;
      envContent += `AWS_REGION=${region}\n`;
    }
    
    // Write the updated content back to .env
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ .env file updated successfully!');
  } catch (error) {
    console.error('❌ Failed to update .env file:', error);
    throw error;
  }
}

/**
 * Main function to set up the serverless OpenSearch
 */
async function setupServerlessOpenSearch() {
  console.log('=== SETTING UP SERVERLESS OPENSEARCH ===\n');
  
  try {
    // Check for AWS credentials
    const region = process.env.AWS_REGION || DEFAULT_REGION;
    
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('AWS credentials not found in environment variables.');
      const accessKeyId = await question('Enter your AWS Access Key ID: ');
      const secretAccessKey = await question('Enter your AWS Secret Access Key: ');
      
      process.env.AWS_ACCESS_KEY_ID = accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
    }
    
    console.log(`Using AWS Region: ${region}`);
    
    // Initialize the AWS SDK
    AWS.config.update({
      region: region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
    
    // Initialize the OpenSearch Serverless client
    const client = new AWS.OpenSearchServerless();
    
    // Create the collection
    const collectionId = await createServerlessCollection(client, COLLECTION_NAME);
    
    // Create the network policy
    await createNetworkPolicy(client, COLLECTION_NAME);
    
    // Create the data access policy
    await createDataAccessPolicy(client, COLLECTION_NAME);
    
    // Wait for the collection to become active
    const endpoint = await waitForCollectionActive(client, COLLECTION_NAME);
    
    // Update the .env file
    await updateEnvFile(endpoint);
    
    console.log('\n=== SERVERLESS OPENSEARCH SETUP COMPLETE ===');
    console.log('✅ Collection created and configured successfully!');
    console.log(`Collection Name: ${COLLECTION_NAME}`);
    console.log(`Collection ID: ${collectionId}`);
    console.log(`Endpoint: ${endpoint}`);
    console.log('\nNext steps:');
    console.log('1. Run the test-opensearch-setup.js script to verify the connection');
    console.log('2. Run the test-opensearch-rag.js script to test the full RAG pipeline');
    
    readline.close();
    return {
      success: true,
      collectionName: COLLECTION_NAME,
      endpoint: endpoint
    };
  } catch (error) {
    console.error('\n❌ Serverless OpenSearch setup failed:');
    console.error(error);
    
    readline.close();
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupServerlessOpenSearch()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { setupServerlessOpenSearch };