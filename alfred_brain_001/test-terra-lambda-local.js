#!/usr/bin/env node

/**
 * Test TryTerra Lambda Function Locally
 * 
 * This script simulates the AWS Lambda environment to test the TryTerra data fetching function
 * without deploying it to AWS.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../backend/models/userModel');
const WearableData = require('../backend/models/wearableDataModel');
const terraLambda = require('../infrastructure/lambda/fetchTerraData');

// Mock AWS Secrets Manager
const AWS = require('aws-sdk');
AWS.SecretsManager = class MockSecretsManager {
  getSecretValue(params) {
    console.log('Mock getSecretValue called with:', params);
    
    // Return a mock promise that resolves with a mock secret
    return {
      promise: () => Promise.resolve({
        SecretString: JSON.stringify({
          MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/alfred-brain-test'
        })
      })
    };
  }
};

// Create a mock user with TryTerra connection
const createMockUsers = async (count = 3) => {
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push({
      name: `Test User ${i}`,
      email: `testuser${i}@example.com`,
      terra_user_id: `mock-terra-user-${i}`,
      reference_id: `mock-reference-${i}`,
      terra_connection: {
        connected: true,
        provider: 'fitbit',
        last_synced: new Date(),
        status: 'connected'
      },
      data_fetch_settings: {
        enabled: true,
        frequency: '0 */6 * * *',
        data_types: ['activity', 'body', 'sleep', 'nutrition', 'daily'],
        last_fetch: new Date(Date.now() - 86400000) // 1 day ago
      }
    });
  }
  
  return User.insertMany(users);
};

// Mock the TryTerra API responses
const mockTerraApiResponses = () => {
  // Mock axios to return test data
  const axios = require('axios');
  jest.mock('axios');
  
  // Standard response template
  const createMockResponse = (dataType) => ({
    data: {
      status: 'success',
      type: dataType,
      user: {
        user_id: 'mock-terra-user'
      },
      data: [
        {
          metadata: {
            device_type: 'mock_device',
            device_model: 'Mock Model X',
            provider: 'fitbit',
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString()
          }
        }
      ]
    }
  });
  
  // Mock activity data with steps and calories
  const activityResponse = createMockResponse('activity');
  activityResponse.data.data[0].steps = 10000;
  activityResponse.data.data[0].calories = 2500;
  activityResponse.data.data[0].distance_meters = 8000;
  
  // Mock body data with weight and BMI
  const bodyResponse = createMockResponse('body');
  bodyResponse.data.data[0].weight_kg = 75;
  bodyResponse.data.data[0].bmi = 24.5;
  
  // Mock sleep data with duration
  const sleepResponse = createMockResponse('sleep');
  sleepResponse.data.data[0].sleep_duration_seconds = 28800; // 8 hours
  
  // Mock nutrition data
  const nutritionResponse = createMockResponse('nutrition');
  nutritionResponse.data.data[0].calories = 2200;
  nutritionResponse.data.data[0].protein_g = 120;
  
  // Mock daily data 
  const dailyResponse = createMockResponse('daily');
  dailyResponse.data.data[0].resting_heart_rate = 65;
  
  // Override the axios.create method
  axios.create = jest.fn().mockReturnValue({
    get: jest.fn((url, config) => {
      if (url.includes('activity')) return Promise.resolve(activityResponse);
      if (url.includes('body')) return Promise.resolve(bodyResponse);
      if (url.includes('sleep')) return Promise.resolve(sleepResponse);
      if (url.includes('nutrition')) return Promise.resolve(nutritionResponse);
      if (url.includes('daily')) return Promise.resolve(dailyResponse);
      return Promise.resolve({ data: {} });
    })
  });
};

// Main function to run the test
const runTest = async () => {
  let mongoServer;
  
  try {
    console.log('Starting Terra Lambda local test...');
    
    // Use actual MongoDB connection if environment variable is set, otherwise use in-memory server
    if (!process.env.MONGODB_URI) {
      console.log('No MONGODB_URI found, using in-memory MongoDB server');
      mongoServer = await MongoMemoryServer.create();
      process.env.MONGODB_URI = mongoServer.getUri();
    }
    
    // Connect to the database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB at', process.env.MONGODB_URI);
    
    // Mock Terra API responses
    //mockTerraApiResponses();
    
    // Create mock users
    console.log('Creating mock users...');
    const mockUsers = await createMockUsers(3);
    console.log(`Created ${mockUsers.length} mock users`);
    
    // Define a mock event for the Lambda function
    const mockEvent = {
      batchSize: 3,
      skipUsers: 0,
      environment: 'test'
    };
    
    // Define a mock context
    const mockContext = {
      callbackWaitsForEmptyEventLoop: true,
      functionName: 'local-test-terra-lambda',
      awsRequestId: 'local-test-id-' + Date.now()
    };
    
    // Execute the Lambda function
    console.log('Executing Terra Lambda function...');
    const result = await terraLambda.handler(mockEvent, mockContext);
    
    // Print results
    console.log('\n==== Terra Lambda Execution Result ====');
    console.log('Status code:', result.statusCode);
    console.log('Response:', JSON.parse(result.body));
    
    // Check for stored wearable data
    const savedData = await WearableData.find({}).lean();
    console.log(`\nSaved ${savedData.length} wearable data records`);
    
    if (savedData.length > 0) {
      console.log('\nSample saved data:');
      console.log('User ID:', savedData[0].user_id);
      console.log('Data type:', savedData[0].data_type);
      console.log('Start date:', savedData[0].start_date);
      console.log('End date:', savedData[0].end_date);
      console.log('Metadata:', savedData[0].metadata);
    }
    
    // Update the users
    const updatedUsers = await User.find({}).lean();
    console.log('\nUpdated users:');
    for (const user of updatedUsers) {
      console.log(`- ${user.name} (${user.email})`);
      console.log(`  Last synced: ${user.terra_connection.last_synced}`);
      console.log(`  Last fetch: ${user.data_fetch_settings.last_fetch}`);
    }
    
  } catch (error) {
    console.error('Error running Terra Lambda test:', error);
  } finally {
    // Clean up
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('\nTest completed and connections closed');
  }
};

// Execute the test
runTest().catch(console.error);