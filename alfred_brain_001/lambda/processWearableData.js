/**
 * AWS Lambda function for processing wearable data and making decisions
 * 
 * This Lambda processes data from TryTerra API and makes decisions based on
 * predefined thresholds for metrics such as heart rate and steps.
 */

const AWS = require('aws-sdk');
const sns = new AWS.SNS();
const mongoose = require('mongoose');
const { processData } = require('../../scripts/process-data');

// Get MongoDB connection string from AWS Secrets Manager
const getMongoDBUri = async () => {
  const secretsManager = new AWS.SecretsManager();
  const secretResponse = await secretsManager.getSecretValue({
    SecretId: 'MONGODB_CREDENTIALS'
  }).promise();
  
  const secret = JSON.parse(secretResponse.SecretString);
  return secret.MONGODB_URI;
};

// Connect to MongoDB if not already connected
const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 0) {
    const uri = await getMongoDBUri();
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  }
};

// Process heart rate data
const processHeartRate = (heartRate) => {
  if (heartRate > 180) {
    return {
      type: 'high_heart_rate',
      value: heartRate,
      message: 'High heart rate detected'
    };
  }
  return null;
};

// Process steps data
const processSteps = (steps) => {
  if (steps < 2000) {
    return {
      type: 'low_steps',
      value: steps,
      message: 'Low daily step count detected'
    };
  }
  return null;
};

// Publish alert to SNS
const publishAlert = async (userId, alert) => {
  const params = {
    TopicArn: process.env.ALERT_TOPIC_ARN,
    Message: JSON.stringify({
      userId,
      alert
    }),
    MessageAttributes: {
      'AlertType': {
        DataType: 'String',
        StringValue: alert.type
      }
    }
  };
  
  await sns.publish(params).promise();
};

// Save alert to database
const saveAlertToDatabase = async (userId, alert) => {
  await connectToDatabase();
  
  // Get alert model
  const AlertModel = mongoose.model('Alert', new mongoose.Schema({
    userId: String,
    type: String,
    value: Number,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }));
  
  // Create new alert record
  await AlertModel.create({
    userId,
    type: alert.type,
    value: alert.value,
    message: alert.message
  });
};

/**
 * Lambda handler function
 * 
 * @param {Object} event - Lambda event object
 * @param {Object} context - Lambda context
 * @returns {Object} - API Gateway response
 */
exports.handler = async (event, context) => {
  // Prevent Lambda from waiting for event loop to empty
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Starting wearable data processing...');
  console.log('Event:', JSON.stringify(event));
  
  try {
    // Run standard data processing first
    await processData();
    
    // Parse request body if it exists (direct invocation via API Gateway)
    let data = {};
    let userId = null;
    
    if (event.body) {
      data = JSON.parse(event.body);
      userId = data.userId;
    } else if (event.Records && event.Records.length > 0) {
      // Process SQS message if this was triggered by SQS
      const sqsMessage = JSON.parse(event.Records[0].body);
      data = sqsMessage.data;
      userId = sqsMessage.userId;
    }
    
    // Initialize results
    const results = {
      processed: [],
      alerts: []
    };
    
    // Process heart rate if provided
    if (data.heartRate) {
      const alert = processHeartRate(data.heartRate);
      if (alert) {
        results.alerts.push(alert);
        
        // If we have a user ID, send alert and save to database
        if (userId) {
          await publishAlert(userId, alert);
          await saveAlertToDatabase(userId, alert);
        }
      }
      results.processed.push('heart_rate');
    }
    
    // Process steps if provided
    if (data.steps !== undefined) {
      const alert = processSteps(data.steps);
      if (alert) {
        results.alerts.push(alert);
        
        // If we have a user ID, send alert and save to database
        if (userId) {
          await publishAlert(userId, alert);
          await saveAlertToDatabase(userId, alert);
        }
      }
      results.processed.push('steps');
    }
    
    console.log('Processing completed successfully:', results);
    
    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error('Error processing wearable data:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Error processing wearable data',
        error: error.message
      })
    };
  }
};