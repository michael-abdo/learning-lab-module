/**
 * TryTerra Scheduler Service Tests
 * 
 * Tests for the scheduler service that periodically fetches data from TryTerra
 */

const mongoose = require('mongoose');
const terraSchedulerService = require('../../backend/services/terraSchedulerService');
const terraService = require('../../backend/services/tryterraService');
const WearableData = require('../../backend/models/wearableDataModel');
const User = require('../../backend/models/userModel');

// Mock dependencies
jest.mock('../../backend/services/tryterraService');
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    stop: jest.fn()
  })
}));

describe('TryTerra Scheduler Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('fetchDataForUser', () => {
    test('should fetch and store TryTerra data for a user', async () => {
      // Mock the getAllUserData response from terraService
      const mockUserData = {
        user_id: 'terra_user_123',
        date_range: { start_date: '2023-01-01', end_date: '2023-01-02' },
        timestamp: new Date().toISOString(),
        data: {
          activity: {
            data: [{
              metadata: {
                device_type: 'watch',
                device_model: 'apple_watch',
                provider: 'APPLE'
              }
            }]
          },
          body: { data: [] },
          sleep: { data: [] },
          nutrition: { data: [] },
          daily: { data: [] }
        }
      };
      
      terraService.getAllUserData.mockResolvedValue(mockUserData);
      
      // Mock the WearableData.save method
      const saveSpy = jest.spyOn(mongoose.Model.prototype, 'save').mockResolvedValue({});
      
      // Call the fetchDataForUser function
      const result = await terraSchedulerService.fetchDataForUser(
        'user_123',
        'terra_user_123',
        'ref_123'
      );
      
      // Verify the result
      expect(result).toEqual({
        success: true,
        recordCount: expect.any(Number),
        terraUserId: 'terra_user_123'
      });
      
      // Verify terraService.getAllUserData was called correctly
      expect(terraService.getAllUserData).toHaveBeenCalledWith(
        'terra_user_123',
        expect.any(String), // start date
        expect.any(String)  // end date
      );
      
      // Verify data was saved to MongoDB
      expect(saveSpy).toHaveBeenCalled();
    });

    test('should handle errors when fetching data', async () => {
      // Mock an error from terraService
      const errorMessage = 'API connection failed';
      terraService.getAllUserData.mockRejectedValue(new Error(errorMessage));
      
      // Call the fetchDataForUser function and expect it to throw
      await expect(terraSchedulerService.fetchDataForUser(
        'user_123',
        'terra_user_123',
        'ref_123'
      )).rejects.toThrow(errorMessage);
      
      // Verify terraService.getAllUserData was called
      expect(terraService.getAllUserData).toHaveBeenCalled();
    });
  });

  describe('fetchDataForAllUsers', () => {
    test('should fetch data for all users with TryTerra connection', async () => {
      // Mock User.countDocuments and User.find
      const mockUsers = [
        { _id: 'user_1', terra_user_id: 'terra_1', reference_id: 'ref_1' },
        { _id: 'user_2', terra_user_id: 'terra_2', reference_id: 'ref_2' }
      ];
      
      User.countDocuments = jest.fn().mockResolvedValue(2);
      User.find = jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockUsers)
      });
      
      // Mock fetchDataForUser to succeed for all users
      terraSchedulerService.fetchDataForUser = jest.fn().mockResolvedValue({
        success: true,
        recordCount: 2,
        terraUserId: 'terra_1'
      });
      
      // Call fetchDataForAllUsers
      const result = await terraSchedulerService.fetchDataForAllUsers();
      
      // Verify the result
      expect(result).toEqual({
        success: true,
        totalUsers: 2
      });
      
      // Verify User.countDocuments and User.find were called
      expect(User.countDocuments).toHaveBeenCalled();
      expect(User.find).toHaveBeenCalled();
      
      // Verify fetchDataForUser was called for each user
      expect(terraSchedulerService.fetchDataForUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleUserFetch', () => {
    test('should create a scheduled job for a user', () => {
      // Call scheduleUserFetch
      const jobId = terraSchedulerService.scheduleUserFetch('user_123', 'terra_123');
      
      // Verify a job was created and returned
      expect(jobId).toBe('user_user_123');
      
      // Verify cron.schedule was called
      const cronSchedule = require('node-cron').schedule;
      expect(cronSchedule).toHaveBeenCalledWith(
        expect.any(String),  // cron schedule
        expect.any(Function) // callback function
      );
    });
  });
});