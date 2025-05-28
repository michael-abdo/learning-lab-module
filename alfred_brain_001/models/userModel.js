/**
 * User Model
 * 
 * Schema for application users, including TryTerra integration information.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'expert_advisor', 'coach'],
    default: 'user'
  },
  expert_credentials: {
    title: String,
    specialization: [String],
    certifications: [String], 
    experience_years: Number,
    bio: String
  },
  terra_user_id: {
    type: String,
    sparse: true,
    index: true
  },
  reference_id: {
    type: String,
    sparse: true,
    index: true
  },
  terra_connection: {
    connected: {
      type: Boolean,
      default: false
    },
    provider: String,
    last_synced: Date,
    auth_payload: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['pending', 'connected', 'disconnected', 'error'],
      default: 'pending'
    }
  },
  data_fetch_settings: {
    enabled: {
      type: Boolean,
      default: true
    },
    frequency: {
      type: String,
      default: '0 */6 * * *' // Every 6 hours by default
    },
    data_types: {
      type: [String],
      default: ['activity', 'body', 'sleep', 'nutrition', 'daily']
    },
    last_fetch: Date,
    next_fetch: Date
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Add indexes for commonly queried fields
userSchema.index({ email: 1 });
userSchema.index({ 'terra_connection.connected': 1 });
userSchema.index({ 'terra_connection.provider': 1 });
userSchema.index({ 'data_fetch_settings.enabled': 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;