#!/usr/bin/env node

/**
 * Simplified Test for TryTerra Lambda Function
 * 
 * This script runs a simplified test of the TryTerra Lambda function with mocked dependencies.
 */

// Create a test file that doesn't require Jest
const path = require('path');
const fs = require('fs');

// Location of the Lambda function to test
const LAMBDA_PATH = path.join(__dirname, '../infrastructure/lambda/fetchTerraData.js');

console.log('Starting Terra Lambda test...');
console.log(`Lambda file: ${LAMBDA_PATH}`);

if (!fs.existsSync(LAMBDA_PATH)) {
  console.error('Lambda file not found at:', LAMBDA_PATH);
  process.exit(1);
}

// Load mock data
const mockActivityData = {
  status: 'success',
  type: 'activity',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      steps: 10000,
      calories: 2500,
      distance_meters: 8000
    }
  ]
};

const mockSleepData = {
  status: 'success',
  type: 'sleep',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      sleep_duration_seconds: 28800 // 8 hours
    }
  ]
};

// Setup mocks
console.log('Setting up mocks...');

// Mock users for testing
const mockUsers = [
  {
    _id: 'user1',
    name: 'Test User 1',
    email: 'test1@example.com',
    terra_user_id: 'mock-terra-user-1',
    reference_id: 'ref-1',
    terra_connection: {
      connected: true,
      provider: 'fitbit',
      last_synced: new Date(),
      status: 'connected'
    },
    data_fetch_settings: {
      enabled: true,
      frequency: 'daily',
      data_types: ['activity', 'body', 'sleep', 'nutrition', 'daily'],
      last_fetch: new Date()
    },
    save: () => Promise.resolve(true)
  },
  {
    _id: 'user2',
    name: 'Test User 2',
    email: 'test2@example.com',
    terra_user_id: 'mock-terra-user-2',
    reference_id: 'ref-2',
    terra_connection: {
      connected: true,
      provider: 'garmin',
      last_synced: new Date(),
      status: 'connected'
    },
    data_fetch_settings: {
      enabled: true,
      frequency: 'daily',
      data_types: ['activity', 'body', 'sleep', 'nutrition', 'daily'],
      last_fetch: new Date()
    },
    save: () => Promise.resolve(true)
  }
];

// Save original modules to restore them later
const originalRequire = require;
const originalModules = { ...require.cache };

// Mock AWS SDK
console.log('Mocking AWS SDK...');
require.cache[require.resolve('aws-sdk')] = {
  exports: {
    SecretsManager: function() {
      this.getSecretValue = () => ({
        promise: () => Promise.resolve({
          SecretString: JSON.stringify({
            MONGODB_URI: 'mongodb://localhost:27017/alfred-test'
          })
        })
      });
    }
  }
};

// Mock axios
console.log('Mocking axios...');
require.cache[require.resolve('axios')] = {
  exports: {
    create: () => ({
      get: (url, config) => {
        console.log(`Mock API call to: ${url}`);
        
        if (url.includes('/activity')) {
          return Promise.resolve({ data: mockActivityData });
        } else if (url.includes('/sleep')) {
          return Promise.resolve({ data: mockSleepData });
        } else {
          return Promise.resolve({ data: {
            status: 'success',
            type: url.split('/').pop(),
            user: { user_id: config?.params?.user_id || 'mock-user' },
            data: []
          }});
        }
      }
    })
  }
};

// Mock mongoose
console.log('Mocking mongoose...');
const mockSchemaFunction = function(obj) {
  return {
    pre: () => {}
  };
};

// Add Types property to the Schema constructor
mockSchemaFunction.Types = {
  Mixed: {},
  ObjectId: String
};

require.cache[require.resolve('mongoose')] = {
  exports: {
    connect: () => Promise.resolve(),
    connection: { readyState: 1 },
    Schema: mockSchemaFunction,
    model: (name, schema) => {
      console.log(`Creating mock model: ${name}`);
      
      if (name === 'User') {
        return {
          find: () => ({
            skip: () => ({
              limit: () => Promise.resolve(mockUsers)
            })
          })
        };
      } else if (name === 'WearableData') {
        return function WearableData(data) {
          this.save = () => {
            console.log('Saving wearable data:', 
              `user_id: ${data.user_id}, ` +
              `data_type: ${data.data_type}, ` + 
              `metadata: ${JSON.stringify(data.metadata || {})}`
            );
            return Promise.resolve({ ...data, _id: 'mock-wearable-id' });
          };
          Object.assign(this, data);
        };
      }
      
      return {};
    },
    models: {
      User: null,
      WearableData: null
    }
  }
};

// Now load and run the Lambda handler
console.log('\nLoading Lambda handler...');
const terraLambda = require(LAMBDA_PATH);

// Execute the Lambda handler
async function runTest() {
  console.log('Executing Lambda handler...');
  
  const mockEvent = {
    batchSize: 2,
    skipUsers: 0,
    environment: 'test'
  };
  
  const mockContext = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'test-terra-lambda',
    awsRequestId: 'test-123'
  };
  
  try {
    const result = await terraLambda.handler(mockEvent, mockContext);
    
    console.log('\n==== Test Results ====');
    console.log('Status code:', result.statusCode);
    console.log('Response:');
    console.log(JSON.stringify(JSON.parse(result.body), null, 2));
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    // Restore original modules
    require.cache = { ...originalModules };
    console.log('\nTest environment cleaned up.');
  }
}

// Run the test
runTest();