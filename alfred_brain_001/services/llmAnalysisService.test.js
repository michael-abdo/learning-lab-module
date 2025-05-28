/**
 * LLM Analysis Service Tests
 * 
 * Tests for the LLM Analysis Service, including:
 * - Data preprocessing
 * - Performance plan generation
 * - LLM integration
 */

const mongoose = require('mongoose');
const axios = require('axios');
const llmAnalysisService = require('../../backend/services/llmAnalysisService');
const PerformancePlan = require('../../backend/models/performancePlanModel');
const WearableData = require('../../backend/models/wearableDataModel');
const UserFitnessProfile = require('../../backend/models/userFitnessProfileModel');

// Mock axios
jest.mock('axios');

describe('LLM Analysis Service', () => {
  // Test data
  const testUserId = 'user123';
  const today = new Date();
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);

  // Sample LLM response
  const sampleLLMResponse = {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              analysis: {
                overall_health_status: 'Good overall health with some areas for improvement',
                strengths: ['Consistent activity level', 'Good deep sleep'],
                concerns: ['Elevated resting heart rate', 'Insufficient total sleep duration'],
                data_quality_issues: []
              },
              recommendations: {
                athletic: {
                  goal: 'Improve cardiovascular health and endurance',
                  focus_areas: ['cardio', 'recovery'],
                  metrics_to_track: ['resting heart rate', 'VO2 max', 'recovery time'],
                  notes: 'Focus on zone 2 training to improve aerobic capacity'
                },
                nutritional: {
                  goal: 'Support athletic performance and recovery',
                  daily_calorie_target: 2300,
                  macronutrient_split: {
                    protein_percentage: 30,
                    carbs_percentage: 45,
                    fat_percentage: 25
                  },
                  hydration_target_ml: 3000,
                  supplements: [
                    { name: 'Magnesium', dosage: '300mg', timing: 'before bed', purpose: 'Sleep quality' }
                  ],
                  notes: 'Prioritize post-workout protein intake'
                },
                mental: {
                  goal: 'Reduce stress and improve sleep quality',
                  focus_areas: ['stress management', 'sleep hygiene'],
                  notes: 'Implement a regular mindfulness practice'
                },
                recovery: {
                  goal: 'Optimize recovery between training sessions',
                  sleep: {
                    target_hours: 8,
                    bedtime: '22:30',
                    wake_time: '06:30'
                  },
                  notes: 'Include active recovery days'
                }
              },
              data_based_modifications: [
                {
                  metric: 'heart_rate',
                  condition: 'resting heart rate > 75 bpm for 3 consecutive days',
                  action: 'Reduce workout intensity and increase recovery activities',
                  priority: 'high'
                },
                {
                  metric: 'sleep',
                  condition: 'sleep duration < 6 hours',
                  action: 'Skip high-intensity workouts the following day',
                  priority: 'high'
                }
              ],
              performance_plan: {
                workouts: [
                  {
                    name: 'Zone 2 Cardio Session',
                    description: 'Low-intensity steady state cardio',
                    duration_minutes: 45,
                    workout_type: 'cardio',
                    exercises: [
                      {
                        name: 'Cycling',
                        duration_seconds: 2700,
                        intensity: 'moderate',
                        heart_rate_zone: 'endurance'
                      }
                    ]
                  },
                  {
                    name: 'Recovery Yoga',
                    description: 'Gentle yoga flow',
                    duration_minutes: 30,
                    workout_type: 'recovery',
                    exercises: [
                      {
                        name: 'Yoga Flow',
                        duration_seconds: 1800,
                        intensity: 'light'
                      }
                    ]
                  }
                ],
                mental_practices: [
                  {
                    name: 'Morning Meditation',
                    description: 'Guided breathing meditation',
                    practice_type: 'meditation',
                    duration_minutes: 10,
                    frequency: 'morning'
                  }
                ],
                recovery_practices: [
                  {
                    name: 'Foam Rolling',
                    description: 'Self-myofascial release',
                    recovery_type: 'foam_rolling',
                    duration_minutes: 15,
                    frequency: 'daily'
                  }
                ]
              }
            })
          }
        }
      ]
    }
  };

  // Sample wearable data
  const createSampleWearableData = (userId, dateOffset = 0) => {
    const date = new Date(today);
    date.setDate(date.getDate() - dateOffset);
    
    return {
      user_id: userId,
      data_type: 'combined',
      date: date,
      start_date: date,
      end_date: date,
      data: {
        heart_rate: {
          avg_bpm: 72,
          max_bpm: 145,
          min_bpm: 52,
          resting_bpm: 64
        },
        sleep: {
          sleep_duration_ms: 7 * 3600000, // 7 hours
          deep_sleep_ms: 2 * 3600000,    // 2 hours
          light_sleep_ms: 4 * 3600000,    // 4 hours
          rem_sleep_ms: 1 * 3600000,      // 1 hour
          sleep_efficiency: 85
        },
        activity: {
          steps: 8500,
          distance_meters: 6000,
          active_calories: 450,
          total_calories: 2100,
          active_duration_ms: 45 * 60000 // 45 minutes
        },
        stress: {
          avg_stress_level: 45,
          max_stress_level: 72
        },
        body_metrics: {
          weight_kg: 75,
          body_fat_percentage: 18
        }
      }
    };
  };

  // Sample user profile
  const sampleUserProfile = {
    user_id: testUserId,
    date_of_birth: new Date('1990-01-01'),
    biological_sex: 'male',
    height_cm: 178,
    weight_kg: 75,
    fitness_level: 'intermediate',
    fitness_goals: [
      {
        type: 'endurance',
        priority: 4
      },
      {
        type: 'weight_loss',
        priority: 3
      }
    ],
    activity_preferences: [
      {
        activity_type: 'running',
        preference_level: 4
      },
      {
        activity_type: 'cycling',
        preference_level: 5
      }
    ],
    dietary_preferences: {
      diet_type: 'omnivore',
      allergies: ['lactose'],
      preferred_foods: ['chicken', 'rice', 'vegetables']
    }
  };

  // Helper function to seed the database with test data
  const seedTestData = async () => {
    // Create user profile
    await UserFitnessProfile.create(sampleUserProfile);
    
    // Create wearable data entries for the past 7 days
    const wearableDataEntries = [];
    for (let i = 0; i < 7; i++) {
      wearableDataEntries.push(createSampleWearableData(testUserId, i));
    }
    await WearableData.insertMany(wearableDataEntries);
  };

  describe('Data Preprocessing', () => {
    test('should preprocess wearable data correctly', () => {
      // Create sample wearable data without using database
      const wearableData = [];
      for (let i = 0; i < 7; i++) {
        wearableData.push(createSampleWearableData(testUserId, i));
      }
      
      // Preprocess the data
      const processedData = llmAnalysisService.preprocessWearableData(wearableData);
      
      // Check basic properties
      expect(processedData).toBeDefined();
      expect(processedData.dateRange.start).toBeDefined();
      expect(processedData.dateRange.end).toBeDefined();
      
      // Check heart rate data
      expect(processedData.heartRate.avgDailyResting).toBe(64);
      expect(processedData.heartRate.maxRecorded).toBe(145);
      expect(processedData.heartRate.minRecorded).toBe(52);
      
      // Check sleep data
      expect(processedData.sleep.avgDuration).toBe(7);
      expect(processedData.sleep.avgDeepSleep).toBe(2);
      expect(processedData.sleep.avgSleepEfficiency).toBe(85);
      
      // Check activity data
      expect(processedData.activity.avgDailySteps).toBe(8500);
      expect(processedData.activity.avgDailyActiveMinutes).toBe(45);
      
      // Check patterns
      expect(processedData.heartRate.dailyAverages.length).toBe(7);
      expect(processedData.sleep.dailySleep.length).toBe(7);
      expect(processedData.activity.dailyActivity.length).toBe(7);
    });

    test('should handle empty wearable data', () => {
      const processedData = llmAnalysisService.preprocessWearableData([]);
      
      expect(processedData).toBeDefined();
      expect(processedData.dateRange.start).toBeNull();
      expect(processedData.heartRate.avgDailyResting).toBe(0);
      expect(processedData.sleep.avgDuration).toBe(0);
      expect(processedData.activity.avgDailySteps).toBe(0);
    });
  });

  describe('LLM Integration', () => {
    test('should call OpenAI API with correct payload', async () => {
      // Setup mock response
      axios.post.mockResolvedValue(sampleLLMResponse);
      
      // Create sample data without using database
      const wearableData = [];
      for (let i = 0; i < 7; i++) {
        wearableData.push(createSampleWearableData(testUserId, i));
      }
      
      // Create a mock user profile without using database
      const userProfile = {
        ...sampleUserProfile,
        calculateAge: () => 33, // Mock the age calculation method
        toObject: () => ({ ...sampleUserProfile }) // Add toObject method for mongoose compatibility
      };
      
      // Preprocess the data
      const processedData = llmAnalysisService.preprocessWearableData(wearableData);
      
      // Call the function
      await llmAnalysisService.generateInsightsFromLLM(processedData, userProfile, 'comprehensive');
      
      // Check if axios was called correctly
      expect(axios.post).toHaveBeenCalledTimes(1);
      
      // Extract the call arguments
      const axiosCallArgs = axios.post.mock.calls[0];
      
      // The first argument should be the OpenAI API URL
      expect(axiosCallArgs[0]).toContain('api.openai.com');
      
      // The second argument should be the request payload
      const payload = axiosCallArgs[1];
      expect(payload.model).toBeDefined();
      expect(payload.messages.length).toBe(2);
      expect(payload.messages[0].role).toBe('system');
      expect(payload.messages[1].role).toBe('user');
      
      // The user message should contain the data
      const userMessage = payload.messages[1].content;
      expect(userMessage).toContain('Heart Rate Data');
      expect(userMessage).toContain('Sleep Data');
      expect(userMessage).toContain('Activity Data');
      expect(userMessage).toContain('User Profile');
    });

    test('should parse LLM response correctly', async () => {
      // Setup mock response
      axios.post.mockResolvedValue(sampleLLMResponse);
      
      // Create sample data without using database
      const wearableData = [];
      for (let i = 0; i < 7; i++) {
        wearableData.push(createSampleWearableData(testUserId, i));
      }
      
      // Create a mock user profile without using database
      const userProfile = {
        ...sampleUserProfile,
        calculateAge: () => 33, // Mock the age calculation method
        toObject: () => ({ ...sampleUserProfile }) // Add toObject method for mongoose compatibility
      };
      
      // Preprocess the data
      const processedData = llmAnalysisService.preprocessWearableData(wearableData);
      
      // Call the function
      const insights = await llmAnalysisService.generateInsightsFromLLM(processedData, userProfile, 'comprehensive');
      
      // Check insights structure
      expect(insights).toBeDefined();
      expect(insights.analysis).toBeDefined();
      expect(insights.recommendations).toBeDefined();
      expect(insights.data_based_modifications).toBeDefined();
      expect(insights.performance_plan).toBeDefined();
      
      // Check specific values
      expect(insights.analysis.strengths).toContain('Consistent activity level');
      expect(insights.recommendations.athletic.goal).toBe('Improve cardiovascular health and endurance');
      expect(insights.data_based_modifications.length).toBe(2);
      expect(insights.performance_plan.workouts.length).toBe(2);
    });

    test('should handle LLM API errors', async () => {
      // Setup mock error response
      axios.post.mockRejectedValue(new Error('API Error'));
      
      // Create sample data without using database
      const wearableData = [];
      for (let i = 0; i < 7; i++) {
        wearableData.push(createSampleWearableData(testUserId, i));
      }
      
      // Create a mock user profile without using database
      const userProfile = {
        ...sampleUserProfile,
        calculateAge: () => 33, // Mock the age calculation method
        toObject: () => ({ ...sampleUserProfile }) // Add toObject method for mongoose compatibility
      };
      
      // Preprocess the data
      const processedData = llmAnalysisService.preprocessWearableData(wearableData);
      
      // Call the function and expect it to throw
      await expect(
        llmAnalysisService.generateInsightsFromLLM(processedData, userProfile, 'comprehensive')
      ).rejects.toThrow('Failed to generate insights from LLM');
    });
  });

  describe('Performance Plan Generation', () => {
    // Increase timeout for these tests
    jest.setTimeout(30000);

    test('should generate a performance plan from insights', async () => {
      // Setup mock response
      axios.post.mockResolvedValue(sampleLLMResponse);
      
      // Seed the database
      await seedTestData();
      
      // Generate a performance plan
      const plan = await llmAnalysisService.generatePerformancePlan(
        testUserId,
        oneWeekAgo,
        today,
        'comprehensive'
      );
      
      // Check plan properties
      expect(plan).toBeDefined();
      expect(plan.user_id).toBe(testUserId);
      expect(plan.plan_type).toBe('comprehensive');
      expect(plan.start_date).toEqual(oneWeekAgo);
      expect(plan.status).toBe('draft');
      expect(plan.generated_by).toBe('ai');
      
      // Check plan components
      expect(plan.athletic_plan).toBeDefined();
      expect(plan.athletic_plan.goal).toBe('Improve cardiovascular health and endurance');
      expect(plan.athletic_plan.workouts.length).toBe(2);
      
      expect(plan.nutritional_plan).toBeDefined();
      expect(plan.nutritional_plan.daily_calorie_target).toBe(2300);
      
      expect(plan.mental_performance_plan).toBeDefined();
      expect(plan.mental_performance_plan.goal).toBe('Reduce stress and improve sleep quality');
      
      expect(plan.recovery_plan).toBeDefined();
      expect(plan.recovery_plan.goal).toBe('Optimize recovery between training sessions');
      
      expect(plan.data_based_modifications.length).toBe(2);
      
      // Check that the plan has been saved to the database
      const savedPlan = await PerformancePlan.findById(plan._id);
      expect(savedPlan).toBeDefined();
    }, 30000); // Set test timeout to 30 seconds

    test('should throw an error if user profile not found', async () => {
      // Clear existing user profiles to ensure test reliability
      await UserFitnessProfile.deleteMany({});

      await expect(
        llmAnalysisService.generatePerformancePlan(
          'nonexistent_user',
          oneWeekAgo,
          today,
          'comprehensive'
        )
      ).rejects.toThrow('User fitness profile not found');
    }, 30000); // Set test timeout to 30 seconds

    test('should throw an error if no wearable data found', async () => {
      // Clear existing wearable data to ensure test reliability
      await WearableData.deleteMany({});
      
      // Create user profile without wearable data
      await UserFitnessProfile.create(sampleUserProfile);
      
      await expect(
        llmAnalysisService.generatePerformancePlan(
          testUserId,
          oneWeekAgo,
          today,
          'comprehensive'
        )
      ).rejects.toThrow('No wearable data found');
    }, 30000); // Set test timeout to 30 seconds
  });

  describe('Plan Insights', () => {
    // Increase timeout for these tests
    jest.setTimeout(30000);

    test('should generate insights for an existing plan', async () => {
      // Setup mock response
      axios.post.mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  adherence_analysis: {
                    overall_adherence: 'Good',
                    strengths: ['Consistent sleep schedule'],
                    areas_for_improvement: ['Increase daily steps']
                  },
                  plan_adjustments: [
                    'Adjust daily step target to be more achievable'
                  ],
                  recommendations: [
                    'Focus on consistency rather than intensity'
                  ],
                  concerns: []
                })
              }
            }
          ]
        }
      });
      
      // Seed the database
      await seedTestData();
      
      // Create a performance plan
      const plan = new PerformancePlan({
        user_id: testUserId,
        plan_name: 'Test Plan',
        plan_type: 'comprehensive',
        start_date: oneWeekAgo,
        status: 'active',
        athletic_plan: {
          goal: 'Improve overall fitness',
          workouts: [
            {
              name: 'Test Workout',
              workout_type: 'cardio',
              duration_minutes: 30
            }
          ]
        }
      });
      await plan.save();
      
      // Generate insights for the plan
      const insights = await llmAnalysisService.generatePlanInsights(plan._id);
      
      // Check insights structure
      expect(insights).toBeDefined();
      expect(insights.adherence_analysis).toBeDefined();
      expect(insights.plan_adjustments).toBeDefined();
      expect(insights.recommendations).toBeDefined();
      
      // Check specific values
      expect(insights.adherence_analysis.overall_adherence).toBe('Good');
      expect(insights.adherence_analysis.strengths).toContain('Consistent sleep schedule');
      expect(insights.plan_adjustments[0]).toContain('daily step target');
    }, 30000); // Set test timeout to 30 seconds

    test('should throw an error if plan not found', async () => {
      // Clear any existing plans to ensure test reliability
      await PerformancePlan.deleteMany({});
      
      const nonExistentId = new mongoose.Types.ObjectId();
      
      await expect(
        llmAnalysisService.generatePlanInsights(nonExistentId)
      ).rejects.toThrow('Performance plan not found');
    }, 30000); // Set test timeout to 30 seconds
  });
});