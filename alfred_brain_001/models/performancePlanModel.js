/**
 * Performance Plan Model
 * 
 * Schema for storing personalized performance plans generated from wearable data.
 * These plans include athletic, nutritional, and mental performance recommendations.
 */

const mongoose = require('mongoose');

// Define a schema for workout exercises
const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  sets: Number,
  reps: Number,
  duration_seconds: Number,
  distance: Number,
  load: Number,
  load_unit: {
    type: String,
    enum: ['kg', 'lb', 'bodyweight', 'resistance_band', 'other'],
    default: 'kg'
  },
  rest_seconds: Number,
  intensity: {
    type: String,
    enum: ['light', 'moderate', 'high', 'max'],
    default: 'moderate'
  },
  heart_rate_zone: {
    type: String,
    enum: ['recovery', 'endurance', 'tempo', 'threshold', 'max'],
  },
  technique_cues: [String],
  alternatives: [String],
  notes: String
}, { _id: false });

// Define a schema for workouts
const workoutSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  duration_minutes: Number,
  calories_burned: Number,
  workout_type: {
    type: String,
    enum: ['strength', 'cardio', 'flexibility', 'recovery', 'sport', 'circuit', 'hiit', 'other'],
    required: true
  },
  target_heart_rate: {
    min: Number,
    max: Number
  },
  exercises: [exerciseSchema],
  warm_up: [exerciseSchema],
  cool_down: [exerciseSchema],
  equipment_needed: [String],
  location_type: {
    type: String,
    enum: ['home', 'gym', 'outdoor', 'any'],
    default: 'any'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'elite'],
    default: 'intermediate'
  },
  notes: String
}, { _id: false });

// Define a schema for weekly workout schedule
const weeklyScheduleSchema = new mongoose.Schema({
  monday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  tuesday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  wednesday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  thursday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  friday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  saturday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  },
  sunday: {
    am: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    pm: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }
  }
}, { _id: false });

// Define a schema for meals
const mealSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  meal_type: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'],
    required: true
  },
  calories: Number,
  protein_g: Number,
  carbs_g: Number,
  fat_g: Number,
  ingredients: [{
    name: String,
    amount: String,
    notes: String
  }],
  preparation_time_minutes: Number,
  preparation_instructions: String,
  alternatives: [String],
  notes: String
}, { _id: false });

// Define a schema for weekly meal plan
const mealPlanSchema = new mongoose.Schema({
  monday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  tuesday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  wednesday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  thursday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  friday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  saturday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  },
  sunday: {
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: [mealSchema]
  }
}, { _id: false });

// Define a schema for mental performance practices
const mentalPracticeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  practice_type: {
    type: String,
    enum: ['meditation', 'visualization', 'breathing', 'goal_setting', 'journaling', 'cognitive_reframing', 'other'],
    required: true
  },
  duration_minutes: Number,
  frequency: {
    type: String,
    enum: ['daily', 'morning', 'evening', 'pre_workout', 'post_workout', 'as_needed'],
    default: 'daily'
  },
  instructions: String,
  target_outcomes: [String],
  alternatives: [String],
  notes: String
}, { _id: false });

// Define a schema for recovery practices
const recoveryPracticeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  recovery_type: {
    type: String,
    enum: ['sleep', 'active_recovery', 'stretching', 'foam_rolling', 'massage', 'ice_bath', 'heat_therapy', 'nutrition', 'hydration', 'other'],
    required: true
  },
  duration_minutes: Number,
  frequency: {
    type: String,
    enum: ['daily', 'post_workout', 'weekly', 'as_needed'],
    default: 'as_needed'
  },
  instructions: String,
  equipment_needed: [String],
  alternatives: [String],
  notes: String
}, { _id: false });

// Define schema for special instructions based on wearable data
const dataBasedInstructionSchema = new mongoose.Schema({
  metric: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  notes: String
}, { _id: false });

// Define the main performance plan schema
const performancePlanSchema = new mongoose.Schema({
  // User identification
  user_id: {
    type: String,
    required: true,
    index: true
  },
  
  // Plan metadata
  plan_name: {
    type: String,
    required: true
  },
  plan_type: {
    type: String,
    enum: ['athletic', 'nutritional', 'mental', 'comprehensive'],
    required: true,
    index: true
  },
  
  // Time information
  start_date: {
    type: Date,
    required: true,
    index: true
  },
  end_date: Date,
  duration_days: {
    type: Number,
    default: 7
  },
  
  // Plan components
  athletic_plan: {
    goal: String,
    focus_areas: [String],
    workouts: [workoutSchema],
    weekly_schedule: weeklyScheduleSchema,
    metrics_to_track: [String],
    notes: String
  },
  
  nutritional_plan: {
    goal: String,
    daily_calorie_target: Number,
    macronutrient_split: {
      protein_percentage: Number,
      carbs_percentage: Number,
      fat_percentage: Number
    },
    meal_plan: mealPlanSchema,
    hydration_target_ml: Number,
    supplement_recommendations: [{
      name: String,
      dosage: String,
      timing: String,
      purpose: String
    }],
    notes: String
  },
  
  mental_performance_plan: {
    goal: String,
    practices: [mentalPracticeSchema],
    focus_areas: [String],
    notes: String
  },
  
  recovery_plan: {
    goal: String,
    practices: [recoveryPracticeSchema],
    sleep_recommendations: {
      target_hours: Number,
      bedtime: String,
      wake_time: String,
      sleep_hygiene_tips: [String]
    },
    notes: String
  },
  
  // Wearable data integration
  data_based_modifications: [dataBasedInstructionSchema],
  monitoring_instructions: String,
  
  // Plan status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
    default: 'draft',
    index: true
  },
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_required'],
    default: 'not_required',
    index: true
  },
  approval_notes: String,
  
  // Expert Advisor Review Fields
  review_status: {
    type: String,
    enum: ['pending_review', 'approved', 'revision_requested', 'rejected'],
    default: function() {
      return process.env.EXPERT_ADVISOR_ENABLED === 'true' ? 'pending_review' : 'approved';
    },
    index: true
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  review_notes: String,
  review_timestamp: Date,
  revision_count: {
    type: Number,
    default: 0
  },
  revision_history: [{
    version: Number,
    content: mongoose.Schema.Types.Mixed,
    created_at: Date,
    review_status: String,
    review_notes: String,
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Generated by
  generated_by: {
    type: String,
    enum: ['ai', 'coach', 'system', 'other'],
    default: 'ai'
  },
  coach_id: String,
  generation_method: {
    type: String,
    default: 'wearable_data_analysis'
  },
  
  // System metadata
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  // Enable strict mode
  strict: true,
  
  // Collection options
  collection: 'performance_plans',
  
  // Enable timestamps
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  
  // Add indexes for common queries
  indexes: [
    { user_id: 1, start_date: -1 },
    { user_id: 1, plan_type: 1, status: 1 },
    { approval_status: 1 },
    { created_at: 1 },
    { status: 1 }
  ]
});

// Method to create a basic athletic plan from wearable data
performancePlanSchema.statics.createAthleticPlanFromWearableData = async function(userId, wearableData, userProfile) {
  // Starter plan template
  const plan = new this({
    user_id: userId,
    plan_name: 'Athletic Performance Plan',
    plan_type: 'athletic',
    start_date: new Date(),
    duration_days: 7,
    status: 'draft'
  });
  
  // Placeholder for actual AI-based plan generation logic
  plan.athletic_plan = {
    goal: 'Improve overall fitness and performance',
    focus_areas: ['cardiovascular endurance', 'strength', 'recovery'],
    workouts: [
      {
        name: 'Cardio Session',
        description: 'Moderate intensity cardio workout',
        duration_minutes: 45,
        workout_type: 'cardio',
        exercises: [
          {
            name: 'Running',
            duration_seconds: 2700,
            intensity: 'moderate'
          }
        ]
      },
      {
        name: 'Strength Training',
        description: 'Full body strength workout',
        duration_minutes: 60,
        workout_type: 'strength',
        exercises: [
          {
            name: 'Squats',
            sets: 3,
            reps: 12,
            load: 0,
            load_unit: 'bodyweight'
          },
          {
            name: 'Push-ups',
            sets: 3,
            reps: 10,
            load: 0,
            load_unit: 'bodyweight'
          }
        ]
      }
    ],
    notes: 'This is an auto-generated plan based on your wearable data.'
  };
  
  // Add data-based modifications based on actual wearable data
  if (wearableData && wearableData.heart_rate && wearableData.heart_rate.avg_bpm > 70) {
    plan.data_based_modifications.push({
      metric: 'heart_rate',
      condition: 'elevated resting heart rate',
      action: 'Include more recovery sessions and monitor heart rate during workouts',
      priority: 'medium'
    });
  }
  
  if (wearableData && wearableData.sleep && wearableData.sleep.sleep_duration_ms < 7 * 3600000) {
    plan.data_based_modifications.push({
      metric: 'sleep',
      condition: 'insufficient sleep duration',
      action: 'Focus on sleep hygiene and consider reducing workout intensity',
      priority: 'high'
    });
  }
  
  return plan;
};

// Create the model
const PerformancePlan = mongoose.model('PerformancePlan', performancePlanSchema);

module.exports = PerformancePlan;