/**
 * Wearable Data Processor Service Tests
 * 
 * Tests for the service that processes wearable data and generates alerts
 * based on thresholds.
 */

const mongoose = require('mongoose');
const wearableDataProcessor = require('../../backend/services/wearableDataProcessor');
const WearableData = require('../../backend/models/wearableDataModel');
const User = require('../../backend/models/userModel');
const logger = require('../../backend/utils/logger');

// Mock the models and dependencies
jest.mock('../../backend/models/wearableDataModel');
jest.mock('../../backend/models/userModel');
jest.mock('../../backend/utils/logger');
jest.mock('../../scripts/process-data', () => ({
  processData: jest.fn().mockResolvedValue(true)
}));

// Mock mongoose
jest.mock('mongoose', () => {
  const originalMongoose = jest.requireActual('mongoose');
  return {
    ...originalMongoose,
    models: {
      Alert: null
    },
    model: jest.fn().mockImplementation((modelName, schema) => {
      return {
        create: jest.fn().mockResolvedValue({ _id: 'alert_123' }),
        findOne: jest.fn().mockResolvedValue(null)
      };
    }),
    Schema: jest.fn().mockImplementation(() => ({}))
  };
});

describe('Wearable Data Processor Service', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up default mocks
    WearableData.findOne = jest.fn();
    WearableData.find = jest.fn();
    User.findOne = jest.fn();
    User.findById = jest.fn();
    
    // Mock save method
    const mockSave = jest.fn().mockResolvedValue({});
    WearableData.findOne.mockResolvedValue({
      _id: 'data_123',
      user_id: 'terra_user_123',
      data_type: 'combined',
      processed: false,
      data: {
        activity: {
          data: [{
            heart_rate: {
              avg: 70, // Normal heart rate
              resting: 60
            },
            steps: 7500 // Normal steps
          }]
        },
        sleep: {
          data: [{
            duration: 420 // 7 hours in minutes
          }]
        }
      },
      save: mockSave
    });
  });
  
  describe('processUserData', () => {
    test('should process user data with no alerts for normal values', async () => {
      // Call the function
      const result = await wearableDataProcessor.processUserData('user_123', 'terra_user_123');
      
      // Verify WearableData.findOne was called correctly
      expect(WearableData.findOne).toHaveBeenCalledWith({
        user_id: 'terra_user_123',
        data_type: 'combined',
        processed: false
      });
      
      // Verify the data was marked as processed
      const mockData = await WearableData.findOne();
      expect(mockData.save).toHaveBeenCalled();
      expect(mockData.processed).toBe(true);
      
      // Verify the result
      expect(result).toEqual({
        success: true,
        processed: true,
        dataId: 'data_123',
        results: {
          processed: ['heart_rate', 'resting_heart_rate', 'steps', 'sleep'],
          alerts: []
        }
      });
    });
    
    test('should generate an alert for high heart rate', async () => {
      // Mock data with high heart rate
      WearableData.findOne.mockResolvedValue({
        _id: 'data_123',
        user_id: 'terra_user_123',
        data_type: 'combined',
        processed: false,
        data: {
          activity: {
            data: [{
              heart_rate: {
                avg: 190, // High heart rate (above 180 threshold)
                resting: 60
              },
              steps: 7500
            }]
          }
        },
        save: jest.fn().mockResolvedValue({})
      });
      
      // Call the function
      const result = await wearableDataProcessor.processUserData('user_123', 'terra_user_123');
      
      // Verify an alert was generated
      expect(result.results.alerts.length).toBe(1);
      expect(result.results.alerts[0].type).toBe('high_heart_rate');
      
      // Verify mongoose.model was called to create an Alert
      expect(mongoose.model).toHaveBeenCalledWith('Alert', expect.any(Object));
    });
    
    test('should generate an alert for low steps', async () => {
      // Mock data with low steps
      WearableData.findOne.mockResolvedValue({
        _id: 'data_123',
        user_id: 'terra_user_123',
        data_type: 'combined',
        processed: false,
        data: {
          activity: {
            data: [{
              heart_rate: {
                avg: 70,
                resting: 60
              },
              steps: 1500 // Low steps (below 2000 threshold)
            }]
          }
        },
        save: jest.fn().mockResolvedValue({})
      });
      
      // Call the function
      const result = await wearableDataProcessor.processUserData('user_123', 'terra_user_123');
      
      // Verify an alert was generated
      expect(result.results.alerts.length).toBe(1);
      expect(result.results.alerts[0].type).toBe('low_steps');
    });
    
    test('should handle no unprocessed data for user', async () => {
      // Mock no data found
      WearableData.findOne.mockResolvedValue(null);
      
      // Call the function
      const result = await wearableDataProcessor.processUserData('user_123', 'terra_user_123');
      
      // Verify the result
      expect(result).toEqual({
        success: true,
        processed: false,
        noDataFound: true
      });
    });
  });
  
  describe('processAllPendingData', () => {
    test('should process all pending data', async () => {
      // Mock finding multiple records
      WearableData.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { _id: 'data_1', user_id: 'terra_1', processed: false, save: jest.fn().mockResolvedValue({}) },
          { _id: 'data_2', user_id: 'terra_2', processed: false, save: jest.fn().mockResolvedValue({}) }
        ])
      });
      
      // Mock finding users
      User.findOne.mockResolvedValueOnce({ _id: 'user_1', terra_user_id: 'terra_1' });
      User.findOne.mockResolvedValueOnce({ _id: 'user_2', terra_user_id: 'terra_2' });
      
      // Mock processUserData to return different results
      wearableDataProcessor.processUserData = jest.fn()
        .mockResolvedValueOnce({ success: true, results: { alerts: [{ type: 'high_heart_rate' }] } })
        .mockResolvedValueOnce({ success: true, results: { alerts: [] } });
      
      // Call the function
      const result = await wearableDataProcessor.processAllPendingData();
      
      // Verify the results
      expect(result.processed).toBe(2);
      expect(result.alerts).toBe(1);
      
      // Verify processUserData was called for each record
      expect(wearableDataProcessor.processUserData).toHaveBeenCalledTimes(2);
    });
    
    test('should handle no pending data', async () => {
      // Mock finding no records
      WearableData.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });
      
      // Call the function
      const result = await wearableDataProcessor.processAllPendingData();
      
      // Verify the results
      expect(result).toEqual({ success: true, processed: 0 });
    });
  });
  
  describe('init', () => {
    test('should initialize the service', async () => {
      // Call the function
      await wearableDataProcessor.init();
      
      // Verify logger was called
      expect(logger.info).toHaveBeenCalledWith('Initializing Wearable Data Processor Service');
      expect(logger.info).toHaveBeenCalledWith('Wearable Data Processor Service initialized successfully', expect.any(Object));
    });
  });
});