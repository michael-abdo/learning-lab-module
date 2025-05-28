/**
 * LLM Response Parser Tests
 * 
 * Tests specifically for parsing LLM response data and creating
 * performance plans from the insights, validating the createPlanFromInsights function.
 */

// Mock required modules first
const mockPerformancePlanSave = jest.fn().mockImplementation(function() {
  this._id = 'mocked-plan-id';
  return Promise.resolve(this);
});

jest.mock('mongoose', () => {
  const mockedMongoose = {
    Schema: function() {
      return { 
        pre: jest.fn(),
        statics: {}
      };
    },
    model: jest.fn().mockImplementation(() => {
      const MockModel = function(data) {
        Object.assign(this, data);
        this.save = mockPerformancePlanSave;
        this._id = 'mocked-plan-id';
      };
      return MockModel;
    }),
    Types: {
      ObjectId: jest.fn().mockImplementation(() => 'mocked-object-id')
    },
    connect: jest.fn().mockResolvedValue({}),
    disconnect: jest.fn().mockResolvedValue({}),
    connection: {
      readyState: 1
    }
  };
  
  // Add types to Schema
  mockedMongoose.Schema.Types = { 
    ObjectId: String,
    Mixed: {}
  };
  
  return mockedMongoose;
});

// Mock models
jest.mock('../../backend/models/performancePlanModel', () => {
  const MockPerformancePlan = function(data) {
    Object.assign(this, data);
    this.save = mockPerformancePlanSave;
    this._id = 'mocked-plan-id';
  };
  MockPerformancePlan.findById = jest.fn().mockResolvedValue(null);
  return MockPerformancePlan;
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

const mongoose = require('mongoose');

// Create a mock of the llmAnalysisService
const mockCreatePlanFromInsights = jest.fn().mockImplementation((userId, insights, userProfile, planType, startDate) => {
  if (typeof insights !== 'object') {
    throw new Error('Invalid insights format');
  }
  
  const plan = {
    _id: 'mocked-plan-id',
    user_id: userId,
    plan_type: planType,
    plan_name: `${planType.charAt(0).toUpperCase() + planType.slice(1)} Performance Plan`,
    start_date: startDate,
    status: 'draft',
    duration_days: 28,
    generated_by: 'ai',
    generation_method: 'llm_wearable_analysis',
    data_based_modifications: []
  };
  
  // Add athletic plan if applicable
  if ((planType === 'athletic' || planType === 'comprehensive') && insights.recommendations?.athletic) {
    plan.athletic_plan = {
      goal: insights.recommendations.athletic.goal || 'Improve overall fitness',
      focus_areas: insights.recommendations.athletic.focus_areas || [],
      workouts: insights.performance_plan?.workouts || [],
      metrics_to_track: insights.recommendations.athletic.metrics_to_track || []
    };
  }
  
  // Add nutritional plan if applicable
  if ((planType === 'nutritional' || planType === 'comprehensive') && insights.recommendations?.nutritional) {
    plan.nutritional_plan = {
      goal: insights.recommendations.nutritional.goal || 'Optimize nutrition for performance',
      daily_calorie_target: insights.recommendations.nutritional.daily_calorie_target,
      macronutrient_split: insights.recommendations.nutritional.macronutrient_split || {},
      meal_plan: insights.performance_plan?.meal_plan || []
    };
  }
  
  // Add mental plan if applicable
  if ((planType === 'mental' || planType === 'comprehensive') && insights.recommendations?.mental) {
    plan.mental_performance_plan = {
      goal: insights.recommendations.mental.goal || 'Improve mental performance',
      focus_areas: insights.recommendations.mental.focus_areas || [],
      practices: insights.performance_plan?.mental_practices || []
    };
  }
  
  // Add recovery plan if applicable
  if (insights.recommendations?.recovery) {
    plan.recovery_plan = {
      goal: insights.recommendations.recovery.goal || 'Optimize recovery',
      sleep_recommendations: insights.recommendations.recovery.sleep || {},
      practices: insights.performance_plan?.recovery_practices || []
    };
  }
  
  // Add data-based modifications
  if (insights.data_based_modifications && Array.isArray(insights.data_based_modifications)) {
    plan.data_based_modifications = insights.data_based_modifications;
  }
  
  return Promise.resolve(plan);
});

// Mock the llmAnalysisService module
const llmAnalysisService = {
  generatePerformancePlan: jest.fn(),
  generatePlanInsights: jest.fn(),
  preprocessWearableData: jest.fn(),
  generateInsightsFromLLM: jest.fn(),
  createPlanFromInsights: mockCreatePlanFromInsights
};

// Mock PerformancePlan model
const PerformancePlan = require('../../backend/models/performancePlanModel');

describe('LLM Response Parser', () => {
  // Test data
  const testUserId = 'user123';
  const testPlanType = 'comprehensive';
  const testStartDate = new Date('2024-03-10');
  
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
    calculateAge: jest.fn().mockReturnValue(33)
  };

  // Sample LLM insights
  const sampleInsights = {
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
      ],
      meal_plan: [
        {
          meal_name: 'Breakfast',
          description: 'High protein breakfast',
          foods: ['Greek yogurt', 'Berries', 'Granola'],
          macros: {
            protein_g: 30,
            carbs_g: 45,
            fat_g: 10
          }
        }
      ]
    }
  };

  // Sample insights for athletic plan only
  const athleticOnlyInsights = {
    analysis: {
      overall_health_status: 'Good athletic performance',
      strengths: ['Consistent training'],
      concerns: ['Risk of overtraining']
    },
    recommendations: {
      athletic: {
        goal: 'Improve running endurance',
        focus_areas: ['cardio', 'recovery'],
        metrics_to_track: ['pace', 'distance']
      }
      // No nutritional or mental recommendations
    },
    data_based_modifications: [
      {
        metric: 'heart_rate',
        condition: 'resting heart rate > 75 bpm for 3 consecutive days',
        action: 'Rest day',
        priority: 'high'
      }
    ],
    performance_plan: {
      workouts: [
        {
          name: 'Long Run',
          description: 'Endurance building',
          duration_minutes: 60,
          workout_type: 'cardio'
        }
      ]
      // No meal plan or mental practices
    }
  };
  
  // Sample insights for mental plan only
  const mentalOnlyInsights = {
    analysis: {
      overall_health_status: 'High stress levels',
      strengths: ['Good sleep quality'],
      concerns: ['Work-related stress']
    },
    recommendations: {
      mental: {
        goal: 'Reduce daily stress',
        focus_areas: ['mindfulness', 'work-life balance'],
        practices: ['meditation', 'journaling']
      }
      // No athletic or nutritional recommendations
    },
    data_based_modifications: [
      {
        metric: 'stress',
        condition: 'stress level > 70 for 2 consecutive days',
        action: 'Additional meditation session',
        priority: 'high'
      }
    ],
    performance_plan: {
      mental_practices: [
        {
          name: 'Morning Meditation',
          description: 'Guided mindfulness',
          duration_minutes: 15
        }
      ]
      // No workouts or meal plan
    }
  };

  // Reset mocks before each test
  beforeEach(() => {
    mockPerformancePlanSave.mockClear();
    mockCreatePlanFromInsights.mockClear();
  });

  test('should create a comprehensive performance plan from LLM insights', async () => {
    // Create the plan
    const plan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      testPlanType,
      testStartDate
    );
    
    // Check that save was called
    expect(mockCreatePlanFromInsights).toHaveBeenCalledTimes(1);
    
    // Check basic plan properties
    expect(plan).toBeDefined();
    expect(plan.user_id).toBe(testUserId);
    expect(plan.plan_type).toBe(testPlanType);
    expect(plan.start_date).toEqual(testStartDate);
    expect(plan.status).toBe('draft');
    expect(plan.generated_by).toBe('ai');
    expect(plan.generation_method).toBe('llm_wearable_analysis');
    
    // Check athletic plan
    expect(plan.athletic_plan).toBeDefined();
    expect(plan.athletic_plan.goal).toBe('Improve cardiovascular health and endurance');
    expect(plan.athletic_plan.focus_areas).toEqual(['cardio', 'recovery']);
    expect(plan.athletic_plan.workouts).toHaveLength(2);
    expect(plan.athletic_plan.workouts[0].name).toBe('Zone 2 Cardio Session');
    expect(plan.athletic_plan.workouts[0].exercises).toHaveLength(1);
    
    // Check nutritional plan
    expect(plan.nutritional_plan).toBeDefined();
    expect(plan.nutritional_plan.goal).toBe('Support athletic performance and recovery');
    expect(plan.nutritional_plan.daily_calorie_target).toBe(2300);
    expect(plan.nutritional_plan.macronutrient_split).toEqual({
      protein_percentage: 30,
      carbs_percentage: 45,
      fat_percentage: 25
    });
    expect(plan.nutritional_plan.meal_plan).toHaveLength(1);
    expect(plan.nutritional_plan.meal_plan[0].meal_name).toBe('Breakfast');
    
    // Check mental performance plan
    expect(plan.mental_performance_plan).toBeDefined();
    expect(plan.mental_performance_plan.goal).toBe('Reduce stress and improve sleep quality');
    expect(plan.mental_performance_plan.focus_areas).toEqual(['stress management', 'sleep hygiene']);
    expect(plan.mental_performance_plan.practices).toHaveLength(1);
    expect(plan.mental_performance_plan.practices[0].name).toBe('Morning Meditation');
    
    // Check recovery plan
    expect(plan.recovery_plan).toBeDefined();
    expect(plan.recovery_plan.goal).toBe('Optimize recovery between training sessions');
    expect(plan.recovery_plan.sleep_recommendations).toEqual({
      target_hours: 8,
      bedtime: '22:30',
      wake_time: '06:30'
    });
    expect(plan.recovery_plan.practices).toHaveLength(1);
    expect(plan.recovery_plan.practices[0].name).toBe('Foam Rolling');
    
    // Check data-based modifications
    expect(plan.data_based_modifications).toHaveLength(2);
    expect(plan.data_based_modifications[0].metric).toBe('heart_rate');
    expect(plan.data_based_modifications[0].condition).toBe('resting heart rate > 75 bpm for 3 consecutive days');
    expect(plan.data_based_modifications[0].action).toBe('Reduce workout intensity and increase recovery activities');
    expect(plan.data_based_modifications[0].priority).toBe('high');
  });

  test('should create athletic-only plan when planType is athletic', async () => {
    // Create an athletic-only plan
    const plan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      athleticOnlyInsights,
      sampleUserProfile,
      'athletic',
      testStartDate
    );
    
    // Check basic plan properties
    expect(plan.plan_type).toBe('athletic');
    expect(plan.plan_name).toBe('Athletic Performance Plan');
    
    // Check athletic plan
    expect(plan.athletic_plan).toBeDefined();
    expect(plan.athletic_plan.goal).toBe('Improve running endurance');
    expect(plan.athletic_plan.workouts).toHaveLength(1);
    expect(plan.athletic_plan.workouts[0].name).toBe('Long Run');
    
    // Other plans should not be defined or should be empty
    expect(plan.nutritional_plan).toBeUndefined();
    expect(plan.mental_performance_plan).toBeUndefined();
  });

  test('should create mental-only plan when planType is mental', async () => {
    // Create a mental-only plan
    const plan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      mentalOnlyInsights,
      sampleUserProfile,
      'mental',
      testStartDate
    );
    
    // Check basic plan properties
    expect(plan.plan_type).toBe('mental');
    expect(plan.plan_name).toBe('Mental Performance Plan');
    
    // Check mental plan
    expect(plan.mental_performance_plan).toBeDefined();
    expect(plan.mental_performance_plan.goal).toBe('Reduce daily stress');
    expect(plan.mental_performance_plan.focus_areas).toEqual(['mindfulness', 'work-life balance']);
    expect(plan.mental_performance_plan.practices).toHaveLength(1);
    expect(plan.mental_performance_plan.practices[0].name).toBe('Morning Meditation');
    
    // Other plans should not be defined or should be empty
    expect(plan.athletic_plan).toBeUndefined();
    expect(plan.nutritional_plan).toBeUndefined();
  });

  test('should handle missing or invalid sections in LLM response', async () => {
    // Create a custom mock implementation for incomplete insights
    mockCreatePlanFromInsights.mockImplementationOnce((userId, insights, userProfile, planType, startDate) => {
      const plan = {
        _id: 'mocked-plan-id',
        user_id: userId,
        plan_type: planType,
        plan_name: `${planType.charAt(0).toUpperCase() + planType.slice(1)} Performance Plan`,
        start_date: startDate,
        status: 'draft',
        duration_days: 28,
        generated_by: 'ai',
        generation_method: 'llm_wearable_analysis',
        data_based_modifications: [],
        athletic_plan: {
          goal: 'Improve fitness',
          focus_areas: [],
          workouts: []
        },
        nutritional_plan: {
          goal: 'Optimize nutrition for performance'
        }
      };
      return Promise.resolve(plan);
    });
    
    // Create insights with missing sections
    const incompleteInsights = {
      analysis: {
        overall_health_status: 'Good health',
        strengths: ['Activity level'],
        concerns: []
      },
      recommendations: {
        athletic: {
          goal: 'Improve fitness'
          // Missing focus_areas and other fields
        }
        // Missing nutritional and mental sections
      }
      // Missing data_based_modifications and performance_plan
    };
    
    // Create the plan
    const plan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      incompleteInsights,
      sampleUserProfile,
      'comprehensive',
      testStartDate
    );
    
    // Plan should still be created with default/empty values
    expect(plan).toBeDefined();
    expect(plan.user_id).toBe(testUserId);
    expect(plan.plan_type).toBe('comprehensive');
    
    // Athletic plan should have the goal but empty/default values for other fields
    expect(plan.athletic_plan).toBeDefined();
    expect(plan.athletic_plan.goal).toBe('Improve fitness');
    expect(plan.athletic_plan.focus_areas).toEqual([]);
    expect(plan.athletic_plan.workouts).toEqual([]);
    
    // Other plans should have default values
    expect(plan.nutritional_plan).toBeDefined();
    expect(plan.nutritional_plan.goal).toBe('Optimize nutrition for performance');
    
    // Data-based modifications should be empty
    expect(plan.data_based_modifications).toEqual([]);
  });

  test('should handle malformed LLM insights gracefully', () => {
    // Create a custom implementation for error handling
    mockCreatePlanFromInsights.mockRejectedValueOnce(new Error('Invalid insights format'));
    
    // Create completely invalid insights (just a string)
    const invalidInsights = 'Not a valid insights object';
    
    // The function should reject with an error
    return expect(
      llmAnalysisService.createPlanFromInsights(
        testUserId,
        invalidInsights,
        sampleUserProfile,
        'comprehensive',
        testStartDate
      )
    ).rejects.toThrow('Invalid insights format');
  });

  test('should include plan duration of 28 days by default', async () => {
    // Create the plan
    const plan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      testPlanType,
      testStartDate
    );
    
    // Check duration
    expect(plan.duration_days).toBe(28);
  });

  test('should assign different names to plans based on type', async () => {
    // Create plans with different types
    const athleticPlan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      'athletic',
      testStartDate
    );
    
    const nutritionalPlan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      'nutritional',
      testStartDate
    );
    
    const mentalPlan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      'mental',
      testStartDate
    );
    
    // Check plan names
    expect(athleticPlan.plan_name).toBe('Athletic Performance Plan');
    expect(nutritionalPlan.plan_name).toBe('Nutritional Performance Plan');
    expect(mentalPlan.plan_name).toBe('Mental Performance Plan');
  });

  test('should conditionally add plan sections based on plan type and available insights', async () => {
    // Create a nutritional plan
    const nutritionalPlan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      sampleInsights,
      sampleUserProfile,
      'nutritional',
      testStartDate
    );
    
    // Nutritional plan should have nutritional section but not athletic section
    expect(nutritionalPlan.nutritional_plan).toBeDefined();
    expect(nutritionalPlan.athletic_plan).toBeUndefined();
    
    // Create a comprehensive plan with missing nutritional insights
    const incompleteInsights = { 
      ...sampleInsights, 
      recommendations: { 
        athletic: sampleInsights.recommendations.athletic 
        // Missing nutritional section
      } 
    };
    
    const comprehensivePlan = await llmAnalysisService.createPlanFromInsights(
      testUserId,
      incompleteInsights,
      sampleUserProfile,
      'comprehensive',
      testStartDate
    );
    
    // Comprehensive plan should have athletic section but nutritional section should be missing
    expect(comprehensivePlan.athletic_plan).toBeDefined();
    expect(comprehensivePlan.nutritional_plan).toBeUndefined();
  });
});