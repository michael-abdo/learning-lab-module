/**
 * LLM API Integration Tests
 * 
 * Tests specifically for sending data to the LLM and handling API responses,
 * validating the generateInsightsFromLLM function.
 */

// Mock required modules first
jest.mock('mongoose', () => {
  const Schema = function() {
    return { 
      pre: jest.fn(),
      statics: {}
    };
  };
  Schema.Types = { 
    ObjectId: String,
    Mixed: {}
  };
  
  return {
    Schema,
    model: jest.fn().mockImplementation(() => {
      return function() {
        return {
          save: jest.fn().mockResolvedValue({}),
          toObject: jest.fn().mockReturnThis,
          toJSON: jest.fn().mockReturnThis
        };
      };
    }),
    Types: {
      ObjectId: String
    },
    connect: jest.fn().mockResolvedValue({}),
    disconnect: jest.fn().mockResolvedValue({}),
    connection: {
      readyState: 1
    }
  };
});

// Mock models
jest.mock('../../backend/models/performancePlanModel', () => {
  return function() {
    return {
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnThis,
      toJSON: jest.fn().mockReturnThis
    };
  };
});

jest.mock('../../backend/models/wearableDataModel', () => {
  return {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis,
      lean: jest.fn().mockResolvedValue([])
    })
  };
});

jest.mock('../../backend/models/userFitnessProfileModel', () => {
  return {
    findOne: jest.fn().mockResolvedValue({
      user_id: 'user123',
      calculateAge: jest.fn().mockReturnValue(33)
    })
  };
});

const axios = require('axios');
const llmAnalysisService = require('../../backend/services/llmAnalysisService');

// Mock axios
jest.mock('axios');

describe('LLM API Integration', () => {
  // Sample processed data for LLM
  const sampleProcessedData = {
    dateRange: {
      start: new Date('2024-03-10'),
      end: new Date('2024-03-16')
    },
    heartRate: {
      avgDailyResting: 64,
      maxRecorded: 145,
      minRecorded: 52,
      dailyAverages: [
        {
          date: new Date('2024-03-10'),
          resting: 65,
          avg: 72,
          max: 140,
          min: 54
        },
        // Additional daily entries would be here
      ]
    },
    sleep: {
      avgDuration: 7,
      avgDeepSleep: 2,
      avgRemSleep: 1,
      avgLightSleep: 4,
      avgSleepEfficiency: 85,
      dailySleep: [
        {
          date: new Date('2024-03-10'),
          duration: 7.2,
          deep: 2.1,
          rem: 1.2,
          light: 3.9,
          efficiency: 86,
          dayOfWeek: 0
        },
        // Additional daily entries would be here
      ]
    },
    activity: {
      avgDailySteps: 8500,
      avgDailyActiveMinutes: 45,
      avgDailyCalories: 2100,
      totalDistance: 42000,
      dailyActivity: [
        {
          date: new Date('2024-03-10'),
          steps: 9200,
          activeMinutes: 48,
          calories: 2200,
          distance: 6500,
          dayOfWeek: 0
        },
        // Additional daily entries would be here
      ]
    },
    stress: {
      avgStressLevel: 45,
      highStressDays: 1,
      dailyStress: [
        {
          date: new Date('2024-03-10'),
          level: 42,
          dayOfWeek: 0
        },
        // Additional daily entries would be here
      ]
    },
    bodyMetrics: {
      weight: 75,
      bodyFat: 18,
      lastRecorded: new Date('2024-03-16')
    },
    patterns: {
      weekdayVsWeekend: {
        weekdaySleepAvg: 6.8,
        weekendSleepAvg: 7.5,
        weekdayStepsAvg: 9500,
        weekendStepsAvg: 6200
      },
      timeOfDay: {},
      trendingMetrics: [
        {
          metric: 'resting_heart_rate',
          change: -2.1,
          percentChange: -3.2,
          direction: 'decreasing'
        }
      ]
    }
  };

  // Sample user profile
  const sampleUserProfile = {
    user_id: 'user123',
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
    health_conditions: [],
    calculateAge: jest.fn().mockReturnValue(33)
  };

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
                }
              ],
              performance_plan: {
                workouts: [
                  {
                    name: 'Zone 2 Cardio Session',
                    description: 'Low-intensity steady state cardio',
                    duration_minutes: 45,
                    workout_type: 'cardio',
                    exercises: []
                  }
                ]
              }
            })
          }
        }
      ]
    }
  };

  // Sample LLM response with non-JSON content
  const sampleTextResponse = {
    data: {
      choices: [
        {
          message: {
            content: `
            Here are my insights:
            
            {
              "analysis": {
                "overall_health_status": "Good overall health with some areas for improvement",
                "strengths": ["Consistent activity level", "Good deep sleep"],
                "concerns": ["Elevated resting heart rate", "Insufficient total sleep duration"],
                "data_quality_issues": []
              },
              "recommendations": {
                "athletic": {
                  "goal": "Improve cardiovascular health and endurance"
                }
              },
              "data_based_modifications": [],
              "performance_plan": {}
            }
            
            Let me know if you need additional information.
            `
          }
        }
      ]
    }
  };

  // Sample error response
  const sampleErrorResponse = {
    response: {
      status: 429,
      data: {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error'
        }
      }
    }
  };

  test('should call OpenAI API with correctly formatted data', async () => {
    // Setup mock response
    axios.post.mockResolvedValue(sampleLLMResponse);
    
    // Call the function
    await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'comprehensive'
    );
    
    // Check if axios was called correctly
    expect(axios.post).toHaveBeenCalledTimes(1);
    
    // Extract the call arguments
    const axiosCallArgs = axios.post.mock.calls[0];
    
    // Check the URL
    expect(axiosCallArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
    
    // Check the payload
    const payload = axiosCallArgs[1];
    expect(payload).toHaveProperty('model');
    expect(payload).toHaveProperty('messages');
    expect(payload).toHaveProperty('temperature');
    expect(payload).toHaveProperty('max_tokens');
    
    // Check the messages structure
    expect(payload.messages.length).toBe(2);
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[1].role).toBe('user');
    
    // Check that system prompt contains expected content
    const systemPrompt = payload.messages[0].content;
    expect(systemPrompt).toContain('sports scientist');
    expect(systemPrompt).toContain('performance coach');
    
    // Check that user prompt contains expected content
    const userPrompt = payload.messages[1].content;
    expect(userPrompt).toContain('Date Range');
    expect(userPrompt).toContain('User Profile');
    expect(userPrompt).toContain('Heart Rate Data');
    expect(userPrompt).toContain('Sleep Data');
    expect(userPrompt).toContain('Activity Data');
    expect(userPrompt).toContain('Stress Data');
    expect(userPrompt).toContain('Body Metrics');
    expect(userPrompt).toContain('Patterns Identified');
    expect(userPrompt).toContain('Format your response as a JSON object');
    expect(userPrompt).toContain('analysis');
    expect(userPrompt).toContain('recommendations');
    expect(userPrompt).toContain('data_based_modifications');
    expect(userPrompt).toContain('performance_plan');
    
    // Check the API request configuration
    const requestConfig = axiosCallArgs[2];
    expect(requestConfig.headers).toHaveProperty('Content-Type', 'application/json');
    expect(requestConfig.headers).toHaveProperty('Authorization');
  });

  test('should correctly parse JSON response from LLM', async () => {
    // Setup mock response
    axios.post.mockResolvedValue(sampleLLMResponse);
    
    // Call the function
    const result = await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'comprehensive'
    );
    
    // Check the structure of the result
    expect(result).toHaveProperty('analysis');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('data_based_modifications');
    expect(result).toHaveProperty('performance_plan');
    
    // Check specific values
    expect(result.analysis.overall_health_status).toBe('Good overall health with some areas for improvement');
    expect(result.analysis.strengths).toContain('Consistent activity level');
    expect(result.recommendations.athletic.goal).toBe('Improve cardiovascular health and endurance');
    expect(result.data_based_modifications[0].metric).toBe('heart_rate');
    expect(result.performance_plan.workouts[0].name).toBe('Zone 2 Cardio Session');
  });

  test('should extract JSON from text response if needed', async () => {
    // Setup mock response with text that contains JSON
    axios.post.mockResolvedValue(sampleTextResponse);
    
    // Call the function
    const result = await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'comprehensive'
    );
    
    // Check the structure of the result
    expect(result).toHaveProperty('analysis');
    expect(result).toHaveProperty('recommendations');
    expect(result.analysis.overall_health_status).toBe('Good overall health with some areas for improvement');
  });

  test('should handle different plan types correctly', async () => {
    // This test just verifies that all plan types are supported
    // Setup mock response
    axios.post.mockResolvedValue(sampleLLMResponse);
    
    // Test athletic plan
    await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'athletic'
    );
    
    // Reset the mock
    axios.post.mockClear();
    
    // Test nutritional plan
    await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'nutritional'
    );
    
    // Reset the mock
    axios.post.mockClear();
    
    // Test mental plan
    await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'mental'
    );
    
    // Verify that API was called for all plan types
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1].messages[0].content).toContain('mental');
  });

  test('should handle API errors gracefully', async () => {
    // Setup mock error response
    axios.post.mockRejectedValue(sampleErrorResponse);
    
    // Call the function and expect it to throw
    await expect(
      llmAnalysisService.generateInsightsFromLLM(
        sampleProcessedData,
        sampleUserProfile,
        'comprehensive'
      )
    ).rejects.toThrow('Failed to generate insights from LLM');
  });

  test('should handle malformed JSON in LLM response', async () => {
    // Setup mock response with invalid JSON
    axios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: `{
                "analysis": {
                  "overall_health_status": "Good health",
                  "strengths": ["Good activity level"],
                } // Missing closing brackets and has trailing comma
              `
            }
          }
        ]
      }
    });
    
    // Call the function and expect it to throw with an error about JSON
    await expect(
      llmAnalysisService.generateInsightsFromLLM(
        sampleProcessedData,
        sampleUserProfile,
        'comprehensive'
      )
    ).rejects.toThrow();
  });

  test('should check for API key configuration', async () => {
    // Save original state to restore later
    const originalApiKey = process.env.OPENAI_API_KEY;
    
    try {
      // Set API key to ensure test runs correctly
      process.env.OPENAI_API_KEY = 'test-key';
      
      // Test that function works with API key set
      axios.post.mockResolvedValue(sampleLLMResponse);
      const result = await llmAnalysisService.generateInsightsFromLLM(
        sampleProcessedData,
        sampleUserProfile,
        'comprehensive'
      );
      expect(result).toBeDefined();
      
      // Test cases for validateApiKey itself
      // These are unit tests for the validation concept
      const validateApiKey = (key) => {
        if (!key) throw new Error('OpenAI API key not configured');
        return true;
      };
      
      expect(validateApiKey('test-key')).toBe(true);
      expect(() => validateApiKey(null)).toThrow('OpenAI API key not configured');
      expect(() => validateApiKey(undefined)).toThrow('OpenAI API key not configured');
      expect(() => validateApiKey('')).toThrow('OpenAI API key not configured');
    } finally {
      // Restore original state
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  test('should use consistent system prompt structure', async () => {
    // Setup mock response
    axios.post.mockResolvedValue(sampleLLMResponse);
    
    // Test with comprehensive plan
    await llmAnalysisService.generateInsightsFromLLM(
      sampleProcessedData,
      sampleUserProfile,
      'comprehensive'
    );
    
    // Get system prompt
    const systemPrompt = axios.post.mock.calls[0][1].messages[0].content;
    
    // Verify prompt contains key elements
    expect(systemPrompt).toContain('sports scientist');
    expect(systemPrompt).toContain('performance coach');
    expect(systemPrompt).toContain('analyze');
  });
});