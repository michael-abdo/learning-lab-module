/**
 * Process Wearable Data
 * 
 * Script to process wearable data from MongoDB, normalize it, and save to S3
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const { format } = require('date-fns');
const {
  convertToUtc,
  normalizeHeartRate,
  normalizeActivity,
  normalizeSleep
} = require('./normalize-utils');

// MongoDB Model
const WearableData = require('../backend/models/wearableDataModel');

// Environment variables
const mongoUri = process.env.MONGODB_URI;
const s3BucketName = process.env.S3_BUCKET || 'learning-lab-demo--bucket';
const s3OutputPrefix = 'processed/wearable_data/';

// Configure AWS SDK
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

async function processData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Count documents
    const count = await WearableData.countDocuments();
    console.log(`Found ${count} wearable data documents`);
    
    // Process in batches
    const batchSize = 10;
    let processed = 0;
    let saved = 0;
    let skipped = 0;
    
    for (let i = 0; i < count; i += batchSize) {
      console.log(`Processing batch ${i} to ${Math.min(i + batchSize, count)}`);
      
      const documents = await WearableData.find()
        .skip(i)
        .limit(batchSize)
        .lean();
      
      for (const doc of documents) {
        try {
          // Normalize the document
          const normalized = {
            id: doc._id.toString(),
            user_id: doc.user_id,
            data_type: doc.data_type,
            
            // Convert timestamps to UTC
            start_date_utc: convertToUtc(doc.start_date),
            end_date_utc: convertToUtc(doc.end_date),
            date_utc: convertToUtc(doc.date),
            
            // Normalize measurements
            heart_rate: normalizeHeartRate(doc.heart_rate),
            activity: normalizeActivity(doc.activity),
            sleep: normalizeSleep(doc.sleep),
            
            // Extract key metrics
            metrics: {}
          };
          
          // Extract heart rate
          if (normalized.heart_rate && normalized.heart_rate.avg_bpm) {
            normalized.metrics.avg_heart_rate_bpm = normalized.heart_rate.avg_bpm;
          }
          
          // Extract activity metrics
          if (normalized.activity) {
            if (normalized.activity.distance_meters) {
              normalized.metrics.distance_meters = normalized.activity.distance_meters;
            }
            if (normalized.activity.steps) {
              normalized.metrics.steps = normalized.activity.steps;
            }
            if (normalized.activity.total_calories) {
              normalized.metrics.total_calories = normalized.activity.total_calories;
            }
          }
          
          // Extract sleep metrics
          if (normalized.sleep && normalized.sleep.sleep_duration_ms) {
            normalized.metrics.sleep_duration_ms = normalized.sleep.sleep_duration_ms;
            normalized.metrics.sleep_duration_hours = normalized.sleep.sleep_duration_ms / (1000 * 60 * 60);
          }
          
          // Create S3 key with date-based partitioning
          const dateString = normalized.date_utc 
            ? format(normalized.date_utc, 'yyyy/MM/dd')
            : (normalized.start_date_utc 
               ? format(normalized.start_date_utc, 'yyyy/MM/dd')
               : format(new Date(), 'yyyy/MM/dd'));
          
          const s3Key = `${s3OutputPrefix}${normalized.data_type}/${dateString}/${normalized.id}.json`;
          
          // Upload to S3
          await s3.putObject({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: JSON.stringify(normalized, null, 2),
            ContentType: 'application/json'
          }).promise();
          
          saved++;
          console.log(`Saved document ${normalized.id} to S3 at ${s3Key}`);
        } catch (error) {
          console.error(`Error processing document ${doc._id}: ${error.message}`);
          skipped++;
        }
        
        processed++;
      }
      
      console.log(`Progress: ${processed}/${count} (${Math.round((processed/count)*100)}%)`);
    }
    
    console.log(`Completed: Processed ${processed}, saved ${saved}, skipped ${skipped}`);
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
    return { processed, saved, skipped };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    
    // Ensure we disconnect
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (err) {
      // Ignore disconnect errors
    }
    
    throw error;
  }
}

// Run the function if directly invoked
if (require.main === module) {
  processData()
    .then(result => console.log('Done!', result))
    .catch(err => {
      console.error('Failed:', err);
      process.exit(1);
    });
}

module.exports = { processData };