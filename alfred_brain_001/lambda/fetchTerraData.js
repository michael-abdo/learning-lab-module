/**
 * AWS Lambda Function for TryTerra Data Fetching
 * 
 * This Lambda function is designed to be scheduled with CloudWatch Events/EventBridge
 * to periodically fetch data from TryTerra API and store it in MongoDB.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { SecretsManager } = require('aws-sdk');

// Initialize AWS Secrets Manager
const secretsManager = new SecretsManager({
  region: process.env.AWS_REGION || 'us-east-1'
});

// TryTerra API Configuration
const TRYTERRA_API_BASE_URL = 'https://api.tryterra.co/v2';
const TRYTERRA_API_KEY = process.env.TRYTERRA_API_KEY_1 || 'runtheons-testing-zbnGQ364kw';
const TRYTERRA_DEV_ID = process.env.TRYTERRA_API_KEY_2 || 'LUgN_p9G8krf97q5Et3UHxBXetnDGFpx';

// Create axios instance with default headers
const terraApi = axios.create({
  baseURL: TRYTERRA_API_BASE_URL,
  headers: {
    'dev-id': TRYTERRA_DEV_ID,
    'x-api-key': TRYTERRA_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Connect to MongoDB
const connectToDatabase = async () => {
  try {
    // Get MongoDB connection string from Secrets Manager
    const { SecretString } = await secretsManager.getSecretValue({
      SecretId: process.env.MONGODB_SECRET_NAME || 'alfred-brain/mongodb'
    }).promise();
    
    const secret = JSON.parse(SecretString);
    const MONGODB_URI = secret.MONGODB_URI || process.env.MONGODB_URI;
    
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
};

// Define User model schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  terra_user_id: String,
  reference_id: String,
  terra_connection: {
    connected: Boolean,
    provider: String,
    last_synced: Date,
    status: String
  },
  data_fetch_settings: {
    enabled: Boolean,
    frequency: String,
    data_types: [String],
    last_fetch: Date,
    next_fetch: Date
  }
});

// Define WearableData model schema
const wearableDataSchema = new mongoose.Schema({
  user_id: String,
  reference_id: String,
  data_type: String,
  source: String,
  start_date: Date,
  end_date: Date,
  metadata: {
    device_type: String,
    device_model: String,
    provider: String
  },
  data: mongoose.Schema.Types.Mixed,
  processed: Boolean,
  processing_status: String,
  last_processed: Date,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Get user data from TryTerra API
const getUserData = async (terraUserId, startDate, endDate) => {
  try {
    // Get all data types in parallel
    const [activity, body, sleep, nutrition, daily] = await Promise.all([
      terraApi.get(`/activity`, {
        params: { user_id: terraUserId, start_date: startDate, end_date: endDate, to_webhook: false }
      }),
      terraApi.get(`/body`, {
        params: { user_id: terraUserId, start_date: startDate, end_date: endDate, to_webhook: false }
      }),
      terraApi.get(`/sleep`, {
        params: { user_id: terraUserId, start_date: startDate, end_date: endDate, to_webhook: false }
      }),
      terraApi.get(`/nutrition`, {
        params: { user_id: terraUserId, start_date: startDate, end_date: endDate, to_webhook: false }
      }),
      terraApi.get(`/daily`, {
        params: { user_id: terraUserId, start_date: startDate, end_date: endDate, to_webhook: false }
      })
    ]);

    // Combine all data
    return {
      user_id: terraUserId,
      date_range: { start_date: startDate, end_date: endDate },
      timestamp: new Date().toISOString(),
      data: {
        activity: activity.data,
        body: body.data,
        sleep: sleep.data,
        nutrition: nutrition.data,
        daily: daily.data
      }
    };
  } catch (error) {
    console.error(`Error fetching data for user ${terraUserId}:`, error.response?.data || error.message);
    throw error;
  }
};

// Main Lambda handler
exports.handler = async (event, context) => {
  // Keep the MongoDB connection alive
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    // Connect to MongoDB
    await connectToDatabase();
    
    // Initialize models
    const User = mongoose.models.User || mongoose.model('User', userSchema);
    const WearableData = mongoose.models.WearableData || mongoose.model('WearableData', wearableDataSchema);
    
    // Process event
    const batchSize = event.batchSize || 50;
    const skipUsers = event.skipUsers || 0;
    
    // Find users with TryTerra connection
    const users = await User.find({ 
      'terra_user_id': { $exists: true, $ne: null },
      'terra_connection.connected': true,
      'data_fetch_settings.enabled': { $ne: false }
    })
    .skip(skipUsers)
    .limit(batchSize);
    
    console.log(`Found ${users.length} users to process`);
    
    // Calculate date range (last 7 days by default)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    // Process each user
    const results = [];
    for (const user of users) {
      try {
        console.log(`Processing user ${user._id}, terra_user_id: ${user.terra_user_id}`);
        
        // Fetch data from TryTerra
        const userData = await getUserData(user.terra_user_id, formattedStartDate, formattedEndDate);
        
        // Save combined record
        const combinedRecord = new WearableData({
          user_id: user.terra_user_id,
          reference_id: user.reference_id,
          data_type: 'combined',
          source: 'tryterra_lambda',
          start_date: startDate,
          end_date: endDate,
          metadata: {
            device_type: userData.data.activity?.data?.[0]?.metadata?.device_type || 'unknown',
            device_model: userData.data.activity?.data?.[0]?.metadata?.device_model || 'unknown',
            provider: userData.data.activity?.data?.[0]?.metadata?.provider || 'unknown'
          },
          data: userData.data
        });
        
        await combinedRecord.save();
        
        // Update user's last fetch time
        user.terra_connection.last_synced = new Date();
        user.data_fetch_settings.last_fetch = new Date();
        await user.save();
        
        results.push({ userId: user._id, terraUserId: user.terra_user_id, success: true });
      } catch (error) {
        console.error(`Error processing user ${user._id}:`, error);
        results.push({ userId: user._id, terraUserId: user.terra_user_id, success: false, error: error.message });
      }
    }
    
    // Return results
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'TryTerra data fetch completed',
        processed: users.length,
        results
      })
    };
  } catch (error) {
    console.error('Lambda execution error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error executing Lambda function',
        error: error.message
      })
    };
  }
};