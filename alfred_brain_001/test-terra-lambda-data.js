/**
 * Mock data for testing TryTerra Lambda function
 */

// Mock activity data response
exports.mockActivityResponse = {
  status: 'success',
  type: 'activity',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      steps: 10000,
      calories: 2500,
      distance_meters: 8000,
      heart_rate: {
        summary: {
          avg_bpm: 72,
          max_bpm: 150,
          min_bpm: 50
        },
        detailed: [
          { timestamp: new Date().toISOString(), bpm: 72 }
        ]
      }
    }
  ]
};

// Mock body data response
exports.mockBodyResponse = {
  status: 'success',
  type: 'body',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      weight_kg: 75,
      bmi: 24.5,
      body_fat_percentage: 18,
      height_cm: 175
    }
  ]
};

// Mock sleep data response
exports.mockSleepResponse = {
  status: 'success',
  type: 'sleep',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      sleep_duration_seconds: 28800, // 8 hours
      sleep_efficiency: 90,
      sleep_stages: {
        awake_duration_seconds: 1800, // 30 minutes
        light_duration_seconds: 14400, // 4 hours
        deep_duration_seconds: 7200, // 2 hours
        rem_duration_seconds: 5400 // 1.5 hours
      }
    }
  ]
};

// Mock nutrition data response
exports.mockNutritionResponse = {
  status: 'success',
  type: 'nutrition',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      calories: 2200,
      protein_g: 120,
      fat_g: 70,
      carbohydrates_g: 250,
      water_ml: 2500
    }
  ]
};

// Mock daily data response
exports.mockDailyResponse = {
  status: 'success',
  type: 'daily',
  user: { user_id: 'mock-terra-user' },
  data: [
    {
      metadata: {
        device_type: 'mock_device',
        device_model: 'Fitbit Charge 5',
        provider: 'fitbit',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      },
      resting_heart_rate: 65,
      steps: 10000,
      distance_meters: 8000,
      floors_climbed: 12,
      active_minutes: 120,
      calories_burned: 2500
    }
  ]
};