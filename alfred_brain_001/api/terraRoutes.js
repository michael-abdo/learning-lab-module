/**
 * TryTerra API Routes
 * 
 * Routes for TryTerra API integration.
 */

const express = require('express');
const router = express.Router();
const terraController = require('./terraController');
// Middleware for authentication
const auth = require('../middleware/authMiddleware'); // Assuming you have auth middleware

// Authentication routes
router.get('/auth/widget', auth, terraController.generateAuthWidget);
router.post('/auth/callback', terraController.handleAuthCallback);

// Data webhook
router.post('/webhook', terraController.handleWebhook);

// Data fetching routes
router.post('/users/:userId/fetch', auth, terraController.fetchUserData);
router.get('/users/:userId/data', auth, terraController.getUserData);
router.post('/users/:userId/settings', auth, terraController.updateFetchSettings);

// Admin routes for managing all users
router.post('/admin/fetch-all', auth, async (req, res) => {
  try {
    // Import scheduler here to avoid circular dependencies
    const terraScheduler = require('../services/terraSchedulerService');
    const result = await terraScheduler.fetchDataForAllUsers();
    res.status(200).json({
      success: true,
      message: 'Manual data fetch initiated for all users',
      users: result.totalUsers
    });
  } catch (error) {
    console.error('Error fetching data for all users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data for all users',
      error: error.message
    });
  }
});

// Data processing routes
router.post('/users/:userId/process', auth, terraController.processUserData);
router.post('/admin/process-all', auth, terraController.processAllPendingData);

// System status routes
router.get('/system/scheduler-status', auth, terraController.getSchedulerStatus);

module.exports = router;