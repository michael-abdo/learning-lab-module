/**
 * TryTerra Routes Tests
 * 
 * Tests for the TryTerra API routes
 */

const request = require('supertest');
const express = require('express');
const terraRoutes = require('../../backend/api/terraRoutes');
const terraController = require('../../backend/api/terraController');
const authMiddleware = require('../../backend/middleware/authMiddleware');

// Mock dependencies
jest.mock('../../backend/api/terraController');
jest.mock('../../backend/middleware/authMiddleware', () => 
  jest.fn((req, res, next) => {
    // Mock authenticated user
    req.user = { _id: 'user_123' };
    next();
  })
);

// Create an Express app for testing
const app = express();
app.use(express.json());
app.use('/api/terra', terraRoutes);

describe('TryTerra API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup controller mocks to return successful responses
    terraController.generateAuthWidget.mockImplementation((req, res) => {
      res.status(200).json({ success: true, widget_url: 'https://widget.url' });
    });
    
    terraController.handleAuthCallback.mockImplementation((req, res) => {
      res.status(200).json({ success: true, message: 'Callback handled' });
    });
    
    terraController.handleWebhook.mockImplementation((req, res) => {
      res.status(200).json({ success: true, message: 'Webhook processed' });
    });
    
    terraController.fetchUserData.mockImplementation((req, res) => {
      res.status(200).json({ success: true, message: 'Data fetched' });
    });
    
    terraController.getUserData.mockImplementation((req, res) => {
      res.status(200).json({ success: true, data: [] });
    });
    
    terraController.updateFetchSettings.mockImplementation((req, res) => {
      res.status(200).json({ success: true, message: 'Settings updated' });
    });
  });
  
  describe('Authentication Routes', () => {
    test('GET /auth/widget should generate an authentication widget', async () => {
      const response = await request(app).get('/api/terra/auth/widget');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        widget_url: 'https://widget.url'
      });
      
      expect(terraController.generateAuthWidget).toHaveBeenCalled();
      expect(authMiddleware).toHaveBeenCalled();
    });
    
    test('POST /auth/callback should handle authentication callback', async () => {
      const callbackData = {
        reference_id: 'ref_123',
        user_id: 'terra_123',
        status: 'success'
      };
      
      const response = await request(app)
        .post('/api/terra/auth/callback')
        .send(callbackData);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Callback handled'
      });
      
      expect(terraController.handleAuthCallback).toHaveBeenCalled();
    });
  });
  
  describe('Webhook Route', () => {
    test('POST /webhook should process webhook data', async () => {
      const webhookData = {
        type: 'activity',
        user: { user_id: 'terra_123' },
        data: {}
      };
      
      const response = await request(app)
        .post('/api/terra/webhook')
        .send(webhookData);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Webhook processed'
      });
      
      expect(terraController.handleWebhook).toHaveBeenCalled();
    });
  });
  
  describe('User Data Routes', () => {
    test('POST /users/:userId/fetch should fetch user data', async () => {
      const response = await request(app)
        .post('/api/terra/users/user_123/fetch');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Data fetched'
      });
      
      expect(terraController.fetchUserData).toHaveBeenCalled();
      expect(authMiddleware).toHaveBeenCalled();
    });
    
    test('GET /users/:userId/data should get user data', async () => {
      const response = await request(app)
        .get('/api/terra/users/user_123/data');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: []
      });
      
      expect(terraController.getUserData).toHaveBeenCalled();
      expect(authMiddleware).toHaveBeenCalled();
    });
    
    test('POST /users/:userId/settings should update fetch settings', async () => {
      const settings = {
        enabled: true,
        frequency: '0 */12 * * *'
      };
      
      const response = await request(app)
        .post('/api/terra/users/user_123/settings')
        .send(settings);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Settings updated'
      });
      
      expect(terraController.updateFetchSettings).toHaveBeenCalled();
      expect(authMiddleware).toHaveBeenCalled();
    });
  });
});