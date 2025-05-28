/**
 * System Settings Model
 * 
 * Schema for storing application-wide settings, including feature flags.
 */

const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  setting_name: {
    type: String,
    required: true,
    unique: true
  },
  setting_value: mongoose.Schema.Types.Mixed,
  description: String,
  category: {
    type: String,
    enum: ['feature_flag', 'system', 'notification', 'integration', 'other'],
    default: 'other'
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

// Add indexes for efficient lookups
systemSettingsSchema.index({ setting_name: 1 }, { unique: true });
systemSettingsSchema.index({ category: 1 });

// Static method to get a setting value with a default fallback
systemSettingsSchema.statics.getSetting = async function(settingName, defaultValue = null) {
  const setting = await this.findOne({ setting_name: settingName });
  return setting ? setting.setting_value : defaultValue;
};

// Static method to update or create a setting
systemSettingsSchema.statics.updateSetting = async function(settingName, settingValue, details = {}) {
  return this.findOneAndUpdate(
    { setting_name: settingName },
    {
      setting_value: settingValue,
      ...(details.description && { description: details.description }),
      ...(details.category && { category: details.category }),
      updated_at: new Date()
    },
    { upsert: true, new: true }
  );
};

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

module.exports = SystemSettings;