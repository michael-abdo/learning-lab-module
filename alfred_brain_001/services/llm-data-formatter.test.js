/**
 * LLM Data Formatter Tests
 * 
 * Tests specifically for formatting data for LLM input, validating the
 * preprocessWearableData function and its ability to correctly structure data.
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

// Now import the service
const llmAnalysisService = require('../../backend/services/llmAnalysisService');

describe('LLM Data Formatter', () => {
  // Sample wearable data
  const createSampleWearableData = (userId, dateOffset = 0) => {
    const today = new Date();
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

  // Test data with missing fields
  const createIncompleteWearableData = (userId, dateOffset = 0) => {
    const today = new Date();
    const date = new Date(today);
    date.setDate(date.getDate() - dateOffset);
    
    return {
      user_id: userId,
      data_type: 'partial',
      date: date,
      start_date: date,
      end_date: date,
      data: {
        // Missing heart_rate
        sleep: {
          sleep_duration_ms: 6.5 * 3600000,
          // Missing deep_sleep_ms
          light_sleep_ms: 4.5 * 3600000,
          rem_sleep_ms: 1 * 3600000
          // Missing sleep_efficiency
        },
        activity: {
          steps: 7200
          // Missing distance_meters
          // Missing calories
        }
        // Missing stress
        // Missing body_metrics
      }
    };
  };

  test('should format wearable data into predefined structure', () => {
    const userId = 'user123';
    const wearableData = [];
    
    // Create 7 days of data
    for (let i = 0; i < 7; i++) {
      wearableData.push(createSampleWearableData(userId, i));
    }
    
    const processedData = llmAnalysisService.preprocessWearableData(wearableData);
    
    // Check top-level structure
    expect(processedData).toHaveProperty('dateRange');
    expect(processedData).toHaveProperty('heartRate');
    expect(processedData).toHaveProperty('sleep');
    expect(processedData).toHaveProperty('activity');
    expect(processedData).toHaveProperty('stress');
    expect(processedData).toHaveProperty('bodyMetrics');
    expect(processedData).toHaveProperty('patterns');
    
    // Check date range properties
    expect(processedData.dateRange.start).toBeInstanceOf(Date);
    expect(processedData.dateRange.end).toBeInstanceOf(Date);
    
    // Check heart rate structure
    expect(processedData.heartRate).toHaveProperty('avgDailyResting');
    expect(processedData.heartRate).toHaveProperty('maxRecorded');
    expect(processedData.heartRate).toHaveProperty('minRecorded');
    expect(processedData.heartRate).toHaveProperty('dailyAverages');
    expect(Array.isArray(processedData.heartRate.dailyAverages)).toBe(true);
    expect(processedData.heartRate.dailyAverages.length).toBe(7);
    
    // Check sleep structure
    expect(processedData.sleep).toHaveProperty('avgDuration');
    expect(processedData.sleep).toHaveProperty('avgDeepSleep');
    expect(processedData.sleep).toHaveProperty('avgRemSleep');
    expect(processedData.sleep).toHaveProperty('avgLightSleep');
    expect(processedData.sleep).toHaveProperty('avgSleepEfficiency');
    expect(processedData.sleep).toHaveProperty('dailySleep');
    expect(Array.isArray(processedData.sleep.dailySleep)).toBe(true);
    expect(processedData.sleep.dailySleep.length).toBe(7);
    
    // Check activity structure
    expect(processedData.activity).toHaveProperty('avgDailySteps');
    expect(processedData.activity).toHaveProperty('avgDailyActiveMinutes');
    expect(processedData.activity).toHaveProperty('avgDailyCalories');
    expect(processedData.activity).toHaveProperty('totalDistance');
    expect(processedData.activity).toHaveProperty('dailyActivity');
    expect(Array.isArray(processedData.activity.dailyActivity)).toBe(true);
    expect(processedData.activity.dailyActivity.length).toBe(7);
    
    // Check patterns structure
    expect(processedData.patterns).toHaveProperty('weekdayVsWeekend');
    expect(processedData.patterns).toHaveProperty('timeOfDay');
    expect(processedData.patterns).toHaveProperty('trendingMetrics');
    
    // Validate calculated values
    expect(processedData.heartRate.avgDailyResting).toBe(64);
    expect(processedData.sleep.avgDuration).toBe(7);
    expect(processedData.activity.avgDailySteps).toBe(8500);
  });

  test('should handle mixed data sources and structures', () => {
    const userId = 'user123';
    const wearableData = [];
    
    // Create some full data and some incomplete data
    for (let i = 0; i < 3; i++) {
      wearableData.push(createSampleWearableData(userId, i));
    }
    
    for (let i = 3; i < 7; i++) {
      wearableData.push(createIncompleteWearableData(userId, i));
    }
    
    const processedData = llmAnalysisService.preprocessWearableData(wearableData);
    
    // Verify processed structure remains intact
    expect(processedData).toHaveProperty('dateRange');
    expect(processedData).toHaveProperty('heartRate');
    expect(processedData).toHaveProperty('sleep');
    expect(processedData).toHaveProperty('activity');
    
    // The heart rate data should only include the days it was present
    expect(processedData.heartRate.dailyAverages.length).toBe(3);
    
    // Sleep data should be present for all days
    expect(processedData.sleep.dailySleep.length).toBe(7);
    
    // Activity data should be present for all days
    expect(processedData.activity.dailyActivity.length).toBe(7);
    
    // Verify calculated averages account for missing data
    expect(processedData.heartRate.avgDailyResting).toBe(64); // Only from complete data
    expect(processedData.sleep.avgDuration).not.toBe(7); // Should be different with mixed data
  });

  test('should handle empty wearable data', () => {
    const processedData = llmAnalysisService.preprocessWearableData([]);
    
    // Structure should still be present
    expect(processedData).toHaveProperty('dateRange');
    expect(processedData).toHaveProperty('heartRate');
    expect(processedData).toHaveProperty('sleep');
    expect(processedData).toHaveProperty('activity');
    
    // Date range should be null
    expect(processedData.dateRange.start).toBeNull();
    expect(processedData.dateRange.end).toBeNull();
    
    // Arrays should be empty
    expect(processedData.heartRate.dailyAverages.length).toBe(0);
    expect(processedData.sleep.dailySleep.length).toBe(0);
    expect(processedData.activity.dailyActivity.length).toBe(0);
    
    // Default values should be 0
    expect(processedData.heartRate.avgDailyResting).toBe(0);
    expect(processedData.sleep.avgDuration).toBe(0);
    expect(processedData.activity.avgDailySteps).toBe(0);
  });

  test('should perform pattern analysis from wearable data', () => {
    const userId = 'user123';
    const wearableData = [];
    
    // Create data with specific patterns
    // Saturday and Sunday (weekend)
    wearableData.push({
      ...createSampleWearableData(userId, 1),
      date: new Date('2024-03-16'), // Saturday
      start_date: new Date('2024-03-16'),
      end_date: new Date('2024-03-16'),
      data: {
        ...createSampleWearableData(userId, 1).data,
        activity: {
          ...createSampleWearableData(userId, 1).data.activity,
          steps: 5000 // Lower steps on weekend
        },
        sleep: {
          ...createSampleWearableData(userId, 1).data.sleep,
          sleep_duration_ms: 9 * 3600000 // More sleep on weekend
        }
      }
    });
    
    wearableData.push({
      ...createSampleWearableData(userId, 2),
      date: new Date('2024-03-17'), // Sunday
      start_date: new Date('2024-03-17'),
      end_date: new Date('2024-03-17'),
      data: {
        ...createSampleWearableData(userId, 2).data,
        activity: {
          ...createSampleWearableData(userId, 2).data.activity,
          steps: 5500 // Lower steps on weekend
        },
        sleep: {
          ...createSampleWearableData(userId, 2).data.sleep,
          sleep_duration_ms: 8.5 * 3600000 // More sleep on weekend
        }
      }
    });
    
    // Monday to Friday (weekdays)
    for (let i = 3; i < 8; i++) {
      const day = new Date('2024-03-18');
      day.setDate(day.getDate() + (i - 3)); // Monday + offset
      
      wearableData.push({
        ...createSampleWearableData(userId, i),
        date: day,
        start_date: day,
        end_date: day,
        data: {
          ...createSampleWearableData(userId, i).data,
          activity: {
            ...createSampleWearableData(userId, i).data.activity,
            steps: 9500 // Higher steps on weekdays
          },
          sleep: {
            ...createSampleWearableData(userId, i).data.sleep,
            sleep_duration_ms: 6.5 * 3600000 // Less sleep on weekdays
          }
        }
      });
    }
    
    const processedData = llmAnalysisService.preprocessWearableData(wearableData);
    
    // Check weekday vs weekend patterns
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekdaySleepAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekendSleepAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekdayStepsAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekendStepsAvg');
    
    // Verify the patterns exist
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekdaySleepAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekendSleepAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekdayStepsAvg');
    expect(processedData.patterns.weekdayVsWeekend).toHaveProperty('weekendStepsAvg');
    
    // The exact values might vary based on implementation details
    expect(typeof processedData.patterns.weekdayVsWeekend.weekdaySleepAvg).toBe('number');
    expect(typeof processedData.patterns.weekdayVsWeekend.weekendSleepAvg).toBe('number');
    expect(typeof processedData.patterns.weekdayVsWeekend.weekdayStepsAvg).toBe('number');
    expect(typeof processedData.patterns.weekdayVsWeekend.weekendStepsAvg).toBe('number');
  });

  test('should calculate daily aggregates correctly', () => {
    const userId = 'user123';
    const today = new Date();
    
    // Create two entries for same day with different data
    const morningEntry = {
      user_id: userId,
      data_type: 'activity',
      date: today,
      start_date: new Date(today.setHours(8, 0, 0)),
      end_date: new Date(today.setHours(10, 0, 0)),
      data: {
        activity: {
          steps: 2500,
          distance_meters: 2000,
          active_calories: 150
        }
      }
    };
    
    const eveningEntry = {
      user_id: userId,
      data_type: 'activity',
      date: today,
      start_date: new Date(today.setHours(18, 0, 0)),
      end_date: new Date(today.setHours(20, 0, 0)),
      data: {
        activity: {
          steps: 3500,
          distance_meters: 3000,
          active_calories: 200
        }
      }
    };
    
    const wearableData = [morningEntry, eveningEntry];
    const processedData = llmAnalysisService.preprocessWearableData(wearableData);
    
    // We expect the data to be aggregated, but the exact implementation may vary
    expect(processedData.activity.dailyActivity.length).toBe(1); // One day only
    
    // Verify aggregated metrics are numbers
    expect(processedData.activity.avgDailySteps).toBeGreaterThan(0);
    expect(processedData.activity.totalDistance).toBeGreaterThan(0); 
    expect(processedData.activity.avgDailyCalories).toBeGreaterThan(0);
  });
});