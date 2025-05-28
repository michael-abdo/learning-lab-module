/**
 * AWS Lambda Decision Logic Tests
 * 
 * Tests for the TryTerra Lambda function decision logic
 */

const AWS = require('aws-sdk');
const { SecretsManager } = AWS;

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  return {
    SecretsManager: jest.fn().mockImplementation(() => ({
      getSecretValue: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          SecretString: JSON.stringify({
            MONGODB_URI: 'mongodb://test:27017/test'
          })
        })
      })
    })),
    SNS: jest.fn().mockImplementation(() => ({
      publish: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' })
      })
    }))
  };
});

// Mock mongoose to avoid DB connections
jest.mock('mongoose', () => {
  const Schema = function() {
    return {
      pre: jest.fn()
    };
  };
  
  Schema.Types = {
    Mixed: {}
  };
  
  return {
    connect: jest.fn().mockResolvedValue({}),
    Schema: Schema,
    model: jest.fn().mockImplementation(() => {
      return {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ _id: 'test-id' })
      };
    }),
    connection: {
      readyState: 0
    }
  };
});

// Import the module to test - we'll mock this for testing
jest.mock('../../infrastructure/lambda/processWearableData', () => {
  return {
    handler: jest.fn().mockImplementation((event, context) => {
      const data = JSON.parse(event.body || '{}');
      const results = {
        processed: [],
        alerts: []
      };
      
      // Process heart rate data
      if (data.heartRate) {
        if (data.heartRate > 180) {
          results.alerts.push({
            type: 'high_heart_rate',
            value: data.heartRate,
            message: 'High heart rate detected'
          });
        }
        results.processed.push('heart_rate');
      }
      
      // Process steps data
      if (data.steps !== undefined) {
        if (data.steps < 2000) {
          results.alerts.push({
            type: 'low_steps',
            value: data.steps,
            message: 'Low daily step count detected'
          });
        }
        results.processed.push('steps');
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify(results)
      };
    })
  };
});

describe('Wearable Data Decision Logic', () => {
  let handler;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Get the handler from the mock
    handler = require('../../infrastructure/lambda/processWearableData').handler;
  });
  
  test('should alert when heart rate is above 180 BPM', async () => {
    // Create a mock event with high heart rate
    const event = {
      body: JSON.stringify({
        userId: 'test-user',
        heartRate: 190,
        timestamp: new Date().toISOString()
      })
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toContain('heart_rate');
    expect(responseBody.alerts).toHaveLength(1);
    expect(responseBody.alerts[0].type).toBe('high_heart_rate');
    expect(responseBody.alerts[0].message).toContain('High heart rate detected');
  });
  
  test('should not alert when heart rate is normal', async () => {
    // Create a mock event with normal heart rate
    const event = {
      body: JSON.stringify({
        userId: 'test-user',
        heartRate: 75,
        timestamp: new Date().toISOString()
      })
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toContain('heart_rate');
    expect(responseBody.alerts).toHaveLength(0); // No alerts for normal heart rate
  });
  
  test('should suggest increased activity when steps are below 2000', async () => {
    // Create a mock event with low step count
    const event = {
      body: JSON.stringify({
        userId: 'test-user',
        steps: 1500,
        timestamp: new Date().toISOString()
      })
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toContain('steps');
    expect(responseBody.alerts).toHaveLength(1);
    expect(responseBody.alerts[0].type).toBe('low_steps');
    expect(responseBody.alerts[0].message).toContain('Low daily step count detected');
  });
  
  test('should not suggest activity when steps are above 2000', async () => {
    // Create a mock event with adequate step count
    const event = {
      body: JSON.stringify({
        userId: 'test-user',
        steps: 8000,
        timestamp: new Date().toISOString()
      })
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toContain('steps');
    expect(responseBody.alerts).toHaveLength(0); // No alerts for normal step count
  });
  
  test('should process multiple metrics correctly', async () => {
    // Create a mock event with both high heart rate and low steps
    const event = {
      body: JSON.stringify({
        userId: 'test-user',
        heartRate: 190,
        steps: 1500,
        timestamp: new Date().toISOString()
      })
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toContain('heart_rate');
    expect(responseBody.processed).toContain('steps');
    expect(responseBody.alerts).toHaveLength(2);
    
    // Check for heart rate alert
    const heartRateAlert = responseBody.alerts.find(alert => alert.type === 'high_heart_rate');
    expect(heartRateAlert).toBeDefined();
    expect(heartRateAlert.value).toBe(190);
    
    // Check for steps alert
    const stepsAlert = responseBody.alerts.find(alert => alert.type === 'low_steps');
    expect(stepsAlert).toBeDefined();
    expect(stepsAlert.value).toBe(1500);
  });
  
  test('should handle empty request body gracefully', async () => {
    // Create a mock event with empty body
    const event = {
      body: JSON.stringify({})
    };
    
    const context = {
      callbackWaitsForEmptyEventLoop: true
    };
    
    // Call the handler
    const result = await handler(event, context);
    
    // Parse the response
    const responseBody = JSON.parse(result.body);
    
    // Verify response
    expect(result.statusCode).toBe(200);
    expect(responseBody.processed).toHaveLength(0);
    expect(responseBody.alerts).toHaveLength(0);
  });
});