#!/usr/bin/env node

/**
 * Create Test Users for TryTerra Integration
 * 
 * This script creates test users with TryTerra connection in MongoDB.
 * It's used to verify that the Lambda function works correctly.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Check for MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

// Connect to MongoDB
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

// Define User model schema (same as in the Lambda function)
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

// Create test users
async function createTestUsers() {
  const User = mongoose.model('User', userSchema);
  
  // Check if test users already exist
  const existingUsers = await User.find({
    email: { $in: ['test1@example.com', 'test2@example.com'] }
  });
  
  if (existingUsers.length > 0) {
    console.log(`Found ${existingUsers.length} existing test users`);
    
    // Display existing users
    for (const user of existingUsers) {
      console.log(`- ${user.name} (${user.email}) - terra_user_id: ${user.terra_user_id}`);
    }
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      readline.question('Do you want to recreate these users? (y/n): ', (ans) => {
        readline.close();
        resolve(ans);
      });
    });
    
    if (answer.toLowerCase() !== 'y') {
      console.log('Skipping user creation.');
      return;
    }
    
    // Delete existing test users
    await User.deleteMany({
      email: { $in: ['test1@example.com', 'test2@example.com'] }
    });
    console.log('Deleted existing test users');
  }
  
  // Create new test users
  const testUsers = [
    {
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
      }
    },
    {
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
      }
    }
  ];
  
  // Insert test users
  const insertedUsers = await User.insertMany(testUsers);
  console.log(`Created ${insertedUsers.length} test users:`);
  
  for (const user of insertedUsers) {
    console.log(`- ${user.name} (${user.email}) - _id: ${user._id}, terra_user_id: ${user.terra_user_id}`);
  }
}

// Main function
async function main() {
  try {
    await connectToDatabase();
    await createTestUsers();
    
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main();