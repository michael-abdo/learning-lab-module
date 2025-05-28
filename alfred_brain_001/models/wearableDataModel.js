/**
 * Wearable Data Model
 * 
 * Schema for storing wearable data from TryTerra API.
 */

const mongoose = require('mongoose');

// Schema for storing user's wearable data
const wearableDataSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    reference_id: {
      type: String,
      index: true
    },
    data_type: {
      type: String,
      enum: ['activity', 'body', 'sleep', 'nutrition', 'daily', 'combined'],
      required: true
    },
    source: {
      type: String,
      required: true,
      default: 'tryterra'
    },
    // Support both date format (for tests) and start_date/end_date format
    date: {
      type: Date
    },
    start_date: {
      type: Date,
      required: function() { return !this.date; }
    },
    end_date: {
      type: Date,
      required: function() { return !this.date; }
    },
    metadata: {
      device_type: String,
      device_model: String,
      provider: String
    },
    // Allow direct fields for tests
    heart_rate: mongoose.Schema.Types.Mixed,
    activity: mongoose.Schema.Types.Mixed,
    sleep: mongoose.Schema.Types.Mixed,
    stress: mongoose.Schema.Types.Mixed,
    body_metrics: mongoose.Schema.Types.Mixed,
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: function() { 
        // Only required if no direct fields are provided
        return !this.heart_rate && !this.activity && !this.sleep && !this.stress && !this.body_metrics; 
      }
    },
    processed: {
      type: Boolean,
      default: false
    },
    processing_status: {
      type: String,
      enum: ['pending', 'in_progress', 'processed', 'failed'],
      default: 'pending'
    },
    last_processed: Date,
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    },
    // For test compatibility
    device_type: String,
    provider: String
  },
  {
    // Enable timeseries features for efficient time-based queries
    timeseries: {
      timeField: 'start_date',
      metaField: 'user_id',
      granularity: 'hours'
    },
    // Add indexes for commonly queried fields
    indexes: [
      { user_id: 1, data_type: 1 },
      { source: 1, data_type: 1 },
      { start_date: 1 },
      { date: 1 },
      { processing_status: 1 },
      { processed: 1 }
    ]
  }
);

// Add a pre-save hook to update the updated_at field
wearableDataSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // If date is provided but start_date/end_date are not, use date for both
  if (this.date && (!this.start_date || !this.end_date)) {
    this.start_date = this.date;
    this.end_date = this.date;
  }
  
  next();
});

// Static method to create a document from TryTerra data
wearableDataSchema.statics.fromTerraData = function(terraData, userId, referenceId) {
  const startDate = terraData.metadata?.start_time ? new Date(terraData.metadata.start_time) : new Date();
  const endDate = terraData.metadata?.end_time ? new Date(terraData.metadata.end_time) : new Date();
  
  return new this({
    user_id: userId,
    reference_id: referenceId,
    data_type: 'activity',
    source: 'tryterra',
    start_date: startDate,
    end_date: endDate,
    date: startDate,
    device_type: terraData.metadata?.device_type,
    provider: terraData.metadata?.provider,
    metadata: {
      device_type: terraData.metadata?.device_type,
      device_model: terraData.metadata?.device_model,
      provider: terraData.metadata?.provider
    },
    data: terraData,
    raw_data: terraData,
    heart_rate: terraData.heart_rate,
    activity: terraData.activity
  });
};

// Static method to get daily summary for a user
wearableDataSchema.statics.getDailySummary = async function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const records = await this.find({
    user_id: userId,
    $or: [
      { date: { $gte: startOfDay, $lte: endOfDay } },
      { start_date: { $gte: startOfDay, $lte: endOfDay } }
    ]
  });
  
  // Process records to create summary
  let steps = 0;
  let calories = 0;
  let distance = 0;
  let sleepDuration = 0;
  const dataSources = new Set();
  
  records.forEach(record => {
    // Add data source
    if (record.provider) {
      dataSources.add(record.provider);
    } else if (record.metadata?.provider) {
      dataSources.add(record.metadata.provider);
    }
    
    // Add activity data
    if (record.activity) {
      steps += record.activity.steps || 0;
      calories += record.activity.total_calories || record.activity.calories || record.activity.active_calories || 0;
      distance += record.activity.distance_meters || record.activity.distance || 0;
    }
    
    // Add sleep data
    if (record.sleep && record.sleep.sleep_duration_ms) {
      sleepDuration = Math.max(sleepDuration, record.sleep.sleep_duration_ms);
    }
  });
  
  return {
    user_id: userId,
    date: startOfDay,
    metrics: {
      steps,
      calories,
      distance_meters: distance,
      sleep_duration_hours: sleepDuration > 0 ? +(sleepDuration / 3600000).toFixed(1) : 0
    },
    data_sources: Array.from(dataSources),
    record_count: records.length
  };
};

// Create model from schema
const WearableData = mongoose.model('WearableData', wearableDataSchema);

module.exports = WearableData;