/**
 * Basic Wearable Data Model
 * 
 * Simplified schema for storing wearable data with minimal fields.
 */

const mongoose = require('mongoose');

// Define the schema as specified in requirements
const wearableDataSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  heart_rate: {
    type: Number,
    min: 0,
    max: 300 // Maximum realistic heart rate
  },
  steps: {
    type: Number,
    min: 0
  },
  calories_burned: {
    type: Number,
    min: 0
  }
}, {
  // Add timestamps to automatically track creation and update times
  timestamps: true,
  
  // Collection name
  collection: 'basic_wearable_data'
});

// Add compound index for common query pattern
wearableDataSchema.index({ user_id: 1, timestamp: 1 });

// Static method to get all records for a specific user
wearableDataSchema.statics.findByUserId = function(userId) {
  return this.find({ user_id: userId }).sort({ timestamp: -1 });
};

// Static method to get records in a date range
wearableDataSchema.statics.findInDateRange = function(userId, startDate, endDate) {
  return this.find({
    user_id: userId,
    timestamp: { $gte: startDate, $lte: endDate }
  }).sort({ timestamp: 1 });
};

// Instance method to format data for display
wearableDataSchema.methods.formatData = function() {
  return {
    id: this._id,
    user_id: this.user_id,
    date: this.timestamp.toISOString().split('T')[0],
    time: this.timestamp.toISOString().split('T')[1].substring(0, 8),
    heart_rate: this.heart_rate || 'N/A',
    steps: this.steps || 'N/A',
    calories_burned: this.calories_burned || 'N/A'
  };
};

// Create the model
const WearableData = mongoose.model('BasicWearableData', wearableDataSchema);

module.exports = WearableData;