/**
 * User Fitness Profile Model
 * 
 * Schema for storing user fitness profiles and preferences,
 * including information from wearable devices.
 */

const mongoose = require('mongoose');

// Define a schema for fitness goals
const fitnessGoalSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['weight_loss', 'muscle_gain', 'endurance', 'general_fitness', 'athletic_performance', 'recovery', 'sleep_improvement', 'stress_reduction'],
    required: true
  },
  target_value: Number,
  target_unit: String,
  target_date: Date,
  current_value: Number,
  start_value: Number,
  start_date: Date,
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'on_hold', 'abandoned'],
    default: 'active'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  notes: String
}, { _id: false });

// Define a schema for activity preferences
const activityPreferenceSchema = new mongoose.Schema({
  activity_type: {
    type: String,
    required: true
  },
  preference_level: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  frequency_per_week: Number,
  duration_minutes: Number,
  intensity_preference: {
    type: String,
    enum: ['low', 'moderate', 'high', 'variable'],
    default: 'moderate'
  },
  notes: String
}, { _id: false });

// Define a schema for dietary preferences
const dietaryPreferenceSchema = new mongoose.Schema({
  diet_type: {
    type: String,
    enum: ['omnivore', 'pescatarian', 'vegetarian', 'vegan', 'paleo', 'keto', 'mediterranean', 'gluten_free', 'dairy_free', 'other'],
    default: 'omnivore'
  },
  allergies: [String],
  restrictions: [String],
  preferred_foods: [String],
  disliked_foods: [String],
  meal_frequency: Number,
  calorie_target: Number,
  protein_target_g: Number,
  carbs_target_g: Number,
  fat_target_g: Number,
  notes: String
}, { _id: false });

// Define a schema for performance metrics (baselines and personal bests)
const performanceMetricSchema = new mongoose.Schema({
  metric_name: {
    type: String,
    required: true
  },
  metric_type: {
    type: String,
    enum: ['strength', 'endurance', 'speed', 'power', 'flexibility', 'balance', 'other'],
    required: true
  },
  current_value: Number,
  personal_best: Number,
  personal_best_date: Date,
  baseline_value: Number,
  baseline_date: Date,
  unit: String,
  notes: String
}, { _id: false });

// Define a schema for health conditions
const healthConditionSchema = new mongoose.Schema({
  condition_name: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['mild', 'moderate', 'severe'],
    default: 'moderate'
  },
  diagnosed_date: Date,
  medications: [String],
  limitations: [String],
  considerations: String
}, { _id: false });

// Define a schema for sleep preferences
const sleepPreferenceSchema = new mongoose.Schema({
  preferred_bedtime: String,
  preferred_wake_time: String,
  target_sleep_hours: Number,
  sleep_aids: [String],
  sleep_environment_preferences: [String],
  notes: String
}, { _id: false });

// Define the main user fitness profile schema
const userFitnessProfileSchema = new mongoose.Schema({
  // User identification
  user_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Personal information
  date_of_birth: Date,
  biological_sex: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  height_cm: Number,
  weight_kg: Number,
  
  // TryTerra connection
  terra_connection: {
    terra_user_id: String,
    reference_id: String,
    connected: {
      type: Boolean,
      default: false
    },
    provider: String,
    device_type: String,
    last_synced: Date,
    status: {
      type: String,
      enum: ['pending', 'connected', 'disconnected', 'error'],
      default: 'pending'
    }
  },
  
  // Fitness profile data
  fitness_level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'elite'],
    default: 'intermediate'
  },
  
  // Collections
  fitness_goals: [fitnessGoalSchema],
  activity_preferences: [activityPreferenceSchema],
  dietary_preferences: dietaryPreferenceSchema,
  performance_metrics: [performanceMetricSchema],
  health_conditions: [healthConditionSchema],
  sleep_preferences: sleepPreferenceSchema,
  
  // Fitness metadata
  last_assessment_date: Date,
  next_assessment_date: Date,
  recommendations: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Data access and privacy preferences
  data_sharing_preferences: {
    share_with_coaches: {
      type: Boolean,
      default: true
    },
    share_with_team: {
      type: Boolean,
      default: false
    },
    share_performance_metrics: {
      type: Boolean,
      default: true
    },
    share_health_data: {
      type: Boolean,
      default: false
    }
  },
  
  // System metadata
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  // Enable strict mode
  strict: true,
  
  // Collection options
  collection: 'user_fitness_profiles',
  
  // Enable timestamps
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Add methods for calculating fitness metrics
userFitnessProfileSchema.methods.calculateBMI = function() {
  if (!this.height_cm || !this.weight_kg) return null;
  
  const heightInMeters = this.height_cm / 100;
  const bmi = this.weight_kg / (heightInMeters * heightInMeters);
  return parseFloat(bmi.toFixed(1));
};

userFitnessProfileSchema.methods.calculateAge = function() {
  if (!this.date_of_birth) return null;
  
  const today = new Date();
  const birthDate = new Date(this.date_of_birth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Method to update user profile from TryTerra data
userFitnessProfileSchema.methods.updateFromTerraData = function(terraData) {
  // Update connection information
  if (terraData.user && terraData.user.user_id) {
    this.terra_connection.terra_user_id = terraData.user.user_id;
    this.terra_connection.connected = true;
    this.terra_connection.last_synced = new Date();
    this.terra_connection.status = 'connected';
    
    if (terraData.provider) {
      this.terra_connection.provider = terraData.provider;
    }
    
    if (terraData.metadata && terraData.metadata.device_type) {
      this.terra_connection.device_type = terraData.metadata.device_type;
    }
  }
  
  // Update body metrics if available
  if (terraData.body) {
    if (terraData.body.weight_kg) {
      this.weight_kg = terraData.body.weight_kg;
    }
    
    if (terraData.body.height_cm) {
      this.height_cm = terraData.body.height_cm;
    }
  }
  
  return this;
};

// Create the model
const UserFitnessProfile = mongoose.model('UserFitnessProfile', userFitnessProfileSchema);

module.exports = UserFitnessProfile;