/**
 * TryTerra Controller Tests
 * 
 * Tests for the TryTerra API controller
 */

const terraController = require('../../backend/api/terraController');
const terraService = require('../../backend/services/tryterraService');
const terraScheduler = require('../../backend/services/terraSchedulerService');
const User = require('../../backend/models/userModel');
const WearableData = require('../../backend/models/wearableDataModel');

// Mock dependencies
jest.mock('../../backend/services/tryterraService');
jest.mock('../../backend/services/terraSchedulerService');
jest.mock('../../backend/models/userModel');
jest.mock('../../backend/models/wearableDataModel');

describe('TryTerra Controller', () => {
  let req, res;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup request and response objects
    req = {
      body: {},
      params: {},
      query: {},
      user: { _id: 'user_123' }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  describe('generateAuthWidget', () => {
    test('should generate authentication widget for a user', async () => {
      // Mock User.findById
      const mockUser = {
        _id: 'user_123',
        save: jest.fn().mockResolvedValue({})
      };
      User.findById = jest.fn().mockResolvedValue(mockUser);
      
      // Mock terraService.authenticateUser
      const mockAuthData = {
        auth_url: 'https://widget.tryterra.co/auth/123',
        resource: { user_id: 'terra_123' }
      };
      terraService.authenticateUser.mockResolvedValue(mockAuthData);
      
      // Call the controller
      await terraController.generateAuthWidget(req, res);
      
      // Verify User.findById was called
      expect(User.findById).toHaveBeenCalledWith('user_123');
      
      // Verify terraService.authenticateUser was called
      expect(terraService.authenticateUser).toHaveBeenCalled();
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        widget_url: 'https://widget.tryterra.co/auth/123',
        resource: { user_id: 'terra_123' },
        reference_id: expect.any(String)
      });
    });
    
    test('should handle user not found', async () => {
      // Mock User.findById to return null
      User.findById = jest.fn().mockResolvedValue(null);
      
      // Call the controller
      await terraController.generateAuthWidget(req, res);
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });
  });
  
  describe('handleAuthCallback', () => {
    test('should handle successful authentication callback', async () => {
      // Set up request body
      req.body = {
        reference_id: 'ref_123',
        user_id: 'terra_123',
        status: 'success',
        provider: 'FITBIT'
      };
      
      // Mock User.findOne
      const mockUser = {
        _id: 'user_123',
        save: jest.fn().mockResolvedValue({})
      };
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      
      // Call the controller
      await terraController.handleAuthCallback(req, res);
      
      // Verify User.findOne was called
      expect(User.findOne).toHaveBeenCalledWith({ reference_id: 'ref_123' });
      
      // Verify terraScheduler.scheduleUserFetch was called
      expect(terraScheduler.scheduleUserFetch).toHaveBeenCalled();
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'TryTerra authentication success',
        user_id: 'terra_123'
      });
    });
    
    test('should handle reference_id not provided', async () => {
      // Empty request body
      req.body = {};
      
      // Call the controller
      await terraController.handleAuthCallback(req, res);
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Reference ID is required'
      });
    });
  });
  
  describe('handleWebhook', () => {
    test('should process webhook data', async () => {
      // Set up request body
      req.body = {
        type: 'activity',
        user: { user_id: 'terra_123' },
        data: {
          metadata: {
            start_time: '2023-01-01T00:00:00Z',
            end_time: '2023-01-01T01:00:00Z',
            device_type: 'watch'
          }
        }
      };
      
      // Mock terraService.processWebhookData
      const mockProcessedData = {
        user_id: 'terra_123',
        type: 'activity',
        data: req.body.data,
        timestamp: new Date().toISOString()
      };
      terraService.processWebhookData.mockResolvedValue(mockProcessedData);
      
      // Mock User.findOne
      const mockUser = {
        _id: 'user_123',
        reference_id: 'ref_123',
        terra_connection: {},
        save: jest.fn().mockResolvedValue({})
      };
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      
      // Mock WearableData
      WearableData.prototype.save = jest.fn().mockResolvedValue({});
      
      // Call the controller
      await terraController.handleWebhook(req, res);
      
      // Verify terraService.processWebhookData was called
      expect(terraService.processWebhookData).toHaveBeenCalledWith(req.body);
      
      // Verify User.findOne was called
      expect(User.findOne).toHaveBeenCalledWith({ terra_user_id: 'terra_123' });
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Webhook processed successfully'),
        data_type: 'activity'
      });
    });
  });
  
  describe('fetchUserData', () => {
    test('should manually fetch data for a user', async () => {
      // Set up request
      req.params.userId = 'user_123';
      
      // Mock User.findById
      const mockUser = {
        _id: 'user_123',
        terra_user_id: 'terra_123',
        reference_id: 'ref_123',
        data_fetch_settings: {},
        save: jest.fn().mockResolvedValue({})
      };
      User.findById = jest.fn().mockResolvedValue(mockUser);
      
      // Mock terraScheduler.fetchDataForUser
      const mockResult = {
        success: true,
        recordCount: 5,
        terraUserId: 'terra_123'
      };
      terraScheduler.fetchDataForUser.mockResolvedValue(mockResult);
      
      // Call the controller
      await terraController.fetchUserData(req, res);
      
      // Verify User.findById was called
      expect(User.findById).toHaveBeenCalledWith('user_123');
      
      // Verify terraScheduler.fetchDataForUser was called
      expect(terraScheduler.fetchDataForUser).toHaveBeenCalledWith(
        'user_123',
        'terra_123',
        'ref_123'
      );
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Successfully fetched TryTerra data'),
        records: 5,
        next_scheduled: expect.any(Object)
      });
    });
  });
});