/**
 * Process Wearable Data
 * 
 * Script to fetch data from MongoDB, normalize it, and save to S3
 * This direct approach works around potential connectivity issues with AWS Glue
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { parse, format } = require('date-fns');
const { utcToZonedTime, zonedTimeToUtc } = require('date-fns-tz');

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-1';
AWS.config.update({
  region: region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
const s3BucketName = process.env.S3_BUCKET || 'learning-lab-demo--bucket';
const s3OutputPrefix = 'processed/wearable_data/';

// Load models
const WearableData = require('../backend/models/wearableDataModel');

// Function to convert timestamp to UTC
function convertToUtc(date) {
  if (!date) return null;
  
  // If already a Date object, simply ensure it's in UTC
  if (date instanceof Date) {
    return new Date(date.getTime());
  }
  
  // If string, parse and convert to UTC
  try {
    const parsedDate = new Date(date);
    return new Date(parsedDate.getTime());
  } catch (error) {
    console.error(`Error converting timestamp ${date}: ${error.message}`);
    return null;
  }
}

// Function to normalize heart rate (ensure it's in BPM)
function normalizeHeartRate(heartRateData) {
  if (!heartRateData) return null;
  
  try {
    // Convert string to object if needed
    let data = heartRateData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Convert from normalized values (0-1) to BPM
    if (normalized.avg_normalized !== undefined && normalized.unit === 'normalized') {
      if (normalized.avg_normalized > 0 && normalized.avg_normalized < 1) {
        const minHr = 40;
        const maxHr = 220;
        const rangeHr = maxHr - minHr;
        normalized.avg_bpm = minHr + (normalized.avg_normalized * rangeHr);
        normalized.unit = 'bpm';
      }
    }
    
    // Standardize the unit
    if (normalized.unit) {
      if (normalized.unit.toLowerCase() === 'bpm' || 
          normalized.unit.toLowerCase() === 'beats_per_minute' || 
          normalized.unit.toLowerCase() === 'beats per minute') {
        normalized.unit = 'bpm';
      }
    } else {
      normalized.unit = 'bpm';
    }
    
    // Copy avg_hr to avg_bpm if needed
    if (normalized.avg_hr && !normalized.avg_bpm) {
      normalized.avg_bpm = normalized.avg_hr;
    }
    
    // Calculate average from data points if needed
    if (!normalized.avg_bpm && normalized.data_points && normalized.data_points.length > 0) {
      const values = normalized.data_points
        .filter(dp => dp.value !== undefined)
        .map(dp => dp.value);
      
      if (values.length > 0) {
        normalized.avg_bpm = values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing heart rate: ${error.message}`);
    return heartRateData;
  }
}

// Function to normalize activity data
function normalizeActivity(activityData) {
  if (!activityData) return null;
  
  try {
    // Convert string to object if needed
    let data = activityData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Normalize distance to meters
    if (normalized.distance) {
      const distance = normalized.distance;
      const distanceUnit = normalized.distance_unit ? normalized.distance_unit.toLowerCase() : 'meters';
      
      // Convert to meters
      if (distanceUnit === 'km' || distanceUnit === 'kilometers') {
        normalized.distance_meters = distance * 1000;
      } else if (distanceUnit === 'mi' || distanceUnit === 'miles') {
        normalized.distance_meters = distance * 1609.34;
      } else if (distanceUnit === 'ft' || distanceUnit === 'feet') {
        normalized.distance_meters = distance * 0.3048;
      } else {
        normalized.distance_meters = distance;
      }
      
      normalized.distance_unit = 'meters';
    }
    
    // Normalize calories
    if (normalized.calories && !normalized.total_calories) {
      normalized.total_calories = normalized.calories;
    } else if (normalized.active_calories && !normalized.total_calories) {
      // Estimate total from active (assuming BMR is about 1800 calories per day)
      if (normalized.duration_ms) {
        const hours = normalized.duration_ms / (1000 * 60 * 60);
        const bmrCalories = (1800 / 24) * hours;
        normalized.total_calories = normalized.active_calories + bmrCalories;
      } else {
        normalized.total_calories = normalized.active_calories;
      }
    }
    
    // Normalize steps (ensure it's an integer)
    if (normalized.steps) {
      normalized.steps = Math.round(Number(normalized.steps));
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing activity data: ${error.message}`);
    return activityData;
  }
}

// Function to normalize sleep data
function normalizeSleep(sleepData) {
  if (!sleepData) return null;
  
  try {
    // Convert string to object if needed
    let data = sleepData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Normalize sleep duration to milliseconds
    if (normalized.sleep_duration && !normalized.sleep_duration_ms) {
      const duration = normalized.sleep_duration;
      const durationUnit = normalized.duration_unit ? normalized.duration_unit.toLowerCase() : 'seconds';
      
      // Convert to milliseconds
      if (durationUnit === 'seconds' || durationUnit === 's') {
        normalized.sleep_duration_ms = duration * 1000;
      } else if (durationUnit === 'minutes' || durationUnit === 'min') {
        normalized.sleep_duration_ms = duration * 60 * 1000;
      } else if (durationUnit === 'hours' || durationUnit === 'h') {
        normalized.sleep_duration_ms = duration * 60 * 60 * 1000;
      } else {
        normalized.sleep_duration_ms = duration;
      }
      
      normalized.duration_unit = 'ms';
    }
    
    // Normalize sleep stages
    if (normalized.stages) {
      const stages = normalized.stages;
      const normalizedStages = {};
      
      // Common stage mappings
      const stageMapping = {
        light: ['light', 'light_sleep'],
        deep: ['deep', 'deep_sleep', 'slow_wave'],
        rem: ['rem', 'rem_sleep', 'rapid_eye_movement'],
        awake: ['awake', 'wake', 'wakefulness']
      };
      
      // Convert stages to standard format
      for (const [standardStage, variations] of Object.entries(stageMapping)) {
        for (const variation of variations) {
          if (stages[variation] !== undefined) {
            normalizedStages[standardStage] = stages[variation];
          }
        }
      }
      
      normalized.normalized_stages = normalizedStages;
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing sleep data: ${error.message}`);
    return sleepData;
  }
}

// Function to process and normalize wearable data
async function processWearableData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Get wearable data
    console.log('Fetching wearable data...');
    const batchSize = 100;
    const totalDocs = await WearableData.countDocuments();
    console.log(`Total wearable data documents: ${totalDocs}`);
    
    // Process in batches
    let processed = 0;
    let skipped = 0;
    let saved = 0;
    
    for (let i = 0; i < totalDocs; i += batchSize) {
      const wearableData = await WearableData.find()
        .skip(i)
        .limit(batchSize)
        .lean();
      
      console.log(`Processing batch of ${wearableData.length} documents...`);
      
      for (const data of wearableData) {
        try {
          // Normalize and process data
          const normalized = {
            _id: data._id.toString(),
            user_id: data.user_id,
            data_type: data.data_type,
            source: data.source || 'tryterra',
            
            // Convert dates to UTC
            start_date_utc: convertToUtc(data.start_date),
            end_date_utc: convertToUtc(data.end_date),
            date_utc: convertToUtc(data.date),
            created_at_utc: convertToUtc(data.created_at),
            updated_at_utc: convertToUtc(data.updated_at),
            
            // Normalize data
            normalized_heart_rate: normalizeHeartRate(data.heart_rate),
            normalized_activity: normalizeActivity(data.activity),
            normalized_sleep: normalizeSleep(data.sleep),
            
            // Keep original data for reference
            original_data: {
              heart_rate: data.heart_rate,
              activity: data.activity,
              sleep: data.sleep,
              metadata: data.metadata
            }
          };
          
          // Extract key metrics for easier analysis
          if (normalized.normalized_heart_rate && normalized.normalized_heart_rate.avg_bpm) {
            normalized.avg_heart_rate_bpm = normalized.normalized_heart_rate.avg_bpm;
          }
          
          if (normalized.normalized_activity) {
            if (normalized.normalized_activity.distance_meters) {
              normalized.distance_meters = normalized.normalized_activity.distance_meters;
            }
            if (normalized.normalized_activity.steps) {
              normalized.steps = normalized.normalized_activity.steps;
            }
            if (normalized.normalized_activity.total_calories) {
              normalized.total_calories = normalized.normalized_activity.total_calories;
            }
          }
          
          if (normalized.normalized_sleep && normalized.normalized_sleep.sleep_duration_ms) {
            normalized.sleep_duration_ms = normalized.normalized_sleep.sleep_duration_ms;
          }
          
          // Add device information
          if (data.metadata) {
            normalized.device_type = data.metadata.device_type;
            normalized.device_model = data.metadata.device_model;
            normalized.provider = data.metadata.provider;
          } else {
            normalized.device_type = data.device_type;
            normalized.provider = data.provider;
          }
          
          // Create S3 key based on data type and date
          const dateString = normalized.date_utc 
            ? format(normalized.date_utc, 'yyyy/MM/dd') 
            : (normalized.start_date_utc 
                ? format(normalized.start_date_utc, 'yyyy/MM/dd')
                : format(new Date(), 'yyyy/MM/dd'));
          
          const s3Key = `${s3OutputPrefix}${data.data_type}/${dateString}/${data._id}.json`;
          
          // Upload normalized data to S3
          await s3.putObject({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: JSON.stringify(normalized, null, 2),
            ContentType: 'application/json'
          }).promise();
          
          processed++;
          saved++;
          if (processed % 10 === 0) {
            console.log(`Processed ${processed} documents, saved ${saved} to S3`);
          }
        } catch (error) {
          console.error(`Error processing document ${data._id}: ${error.message}`);
          skipped++;
        }
      }
    }
    
    console.log(`Processing complete. Processed ${processed} documents, saved ${saved} to S3, skipped ${skipped}`);
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
    return {
      processed,
      saved,
      skipped
    };
  } catch (error) {
    console.error(`Error processing wearable data: ${error.message}`);
    
    // Ensure we disconnect from MongoDB
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
      }
    } catch (disconnectError) {
      console.error(`Error disconnecting from MongoDB: ${disconnectError.message}`);
    }
    
    throw error;
  }
}

// Main function
async function main() {
  console.log('==== Alfred Brain Wearable Data Processing ====');
  
  try {
    // Process wearable data
    const result = await processWearableData();
    console.log('Processing result:', result);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function if script is run directly
if (require.main === module) {
  main();
}

module.exports = {
  processWearableData,
  normalizeHeartRate,
  normalizeActivity,
  normalizeSleep,
  convertToUtc
};