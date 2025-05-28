/**
 * Tests for Normalization Utilities
 */

const { 
  convertToUtc, 
  normalizeHeartRate, 
  normalizeActivity, 
  normalizeSleep 
} = require('../../scripts/normalize-utils');

describe('Normalization Utilities', () => {
  test('convertToUtc converts dates to UTC', () => {
    // Test with Date object
    const date = new Date('2023-01-01T12:00:00Z');
    const utcDate = convertToUtc(date);
    expect(utcDate).toBeInstanceOf(Date);
    expect(utcDate.toISOString()).toBe('2023-01-01T12:00:00.000Z');
    
    // Test with string
    const dateStr = '2023-01-01T12:00:00Z';
    const utcDateFromStr = convertToUtc(dateStr);
    expect(utcDateFromStr).toBeInstanceOf(Date);
    expect(utcDateFromStr.toISOString()).toBe('2023-01-01T12:00:00.000Z');
    
    // Test with null
    expect(convertToUtc(null)).toBeNull();
  });
  
  test('normalizeHeartRate normalizes heart rate data', () => {
    // Test with BPM unit
    const hrData1 = { avg_hr: 75, unit: 'BPM' };
    const normalized1 = normalizeHeartRate(hrData1);
    expect(normalized1.unit).toBe('bpm');
    expect(normalized1.avg_bpm).toBe(75);
    
    // Test with normalized value
    const hrData2 = { avg_normalized: 0.5, unit: 'normalized' };
    const normalized2 = normalizeHeartRate(hrData2);
    expect(normalized2.unit).toBe('bpm');
    expect(normalized2.avg_bpm).toBeGreaterThan(0);
    
    // Test with data points
    const hrData3 = {
      data_points: [
        { value: 70 },
        { value: 80 },
        { value: 90 }
      ]
    };
    const normalized3 = normalizeHeartRate(hrData3);
    expect(normalized3.avg_bpm).toBe(80);
    
    // Test with null
    expect(normalizeHeartRate(null)).toBeNull();
  });
  
  test('normalizeActivity normalizes activity data', () => {
    // Test with kilometers
    const activityData1 = { distance: 5, distance_unit: 'km' };
    const normalized1 = normalizeActivity(activityData1);
    expect(normalized1.distance_meters).toBe(5000);
    expect(normalized1.distance_unit).toBe('meters');
    
    // Test with miles
    const activityData2 = { distance: 3, distance_unit: 'mi' };
    const normalized2 = normalizeActivity(activityData2);
    expect(normalized2.distance_meters).toBeCloseTo(4828.02, 0);
    
    // Test with calories
    const activityData3 = { calories: 350 };
    const normalized3 = normalizeActivity(activityData3);
    expect(normalized3.total_calories).toBe(350);
    
    // Test with steps
    const activityData4 = { steps: '6500' };
    const normalized4 = normalizeActivity(activityData4);
    expect(normalized4.steps).toBe(6500);
    
    // Test with null
    expect(normalizeActivity(null)).toBeNull();
  });
  
  test('normalizeSleep normalizes sleep data', () => {
    // Test with duration in hours
    const sleepData1 = { sleep_duration: 8, duration_unit: 'hours' };
    const normalized1 = normalizeSleep(sleepData1);
    expect(normalized1.sleep_duration_ms).toBe(8 * 60 * 60 * 1000);
    expect(normalized1.duration_unit).toBe('ms');
    
    // Test with sleep stages
    const sleepData2 = {
      stages: {
        light_sleep: 240,
        deep_sleep: 90,
        rem_sleep: 120,
        wake: 30
      }
    };
    const normalized2 = normalizeSleep(sleepData2);
    expect(normalized2.normalized_stages).toBeDefined();
    expect(normalized2.normalized_stages.light).toBe(240);
    expect(normalized2.normalized_stages.deep).toBe(90);
    expect(normalized2.normalized_stages.rem).toBe(120);
    expect(normalized2.normalized_stages.awake).toBe(30);
    
    // Test with null
    expect(normalizeSleep(null)).toBeNull();
  });
});