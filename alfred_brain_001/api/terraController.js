/**
 * TryTerra API Controller
 * 
 * This controller handles all TryTerra API-related routes,
 * including authentication, data fetching, and webhook processing.
 */

const terraService = require('../services/tryterraService');
const terraScheduler = require('../services/terraSchedulerService');
const wearableDataProcessor = require('../services/wearableDataProcessor');
const User = require('../models/userModel');
const WearableData = require('../models/wearableDataModel');
const logger = require('../utils/logger');

/**
 * Generate TryTerra authentication widget for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.generateAuthWidget = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming user is authenticated
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Generate a reference ID if not exists
    const reference_id = user.reference_id || `user_${userId}_${Date.now()}`;
    
    // Update user with reference_id if needed
    if (!user.reference_id) {
      user.reference_id = reference_id;
      await user.save();
    }
    
    // Get authentication widget from TryTerra
    const authData = await terraService.authenticateUser(reference_id);
    
    // Update user with auth status
    user.terra_connection = {
      ...user.terra_connection,
      status: 'pending',
      auth_payload: authData
    };
    await user.save();
    
    return res.status(200).json({
      success: true,
      widget_url: authData.auth_url,
      resource: authData.resource,
      reference_id
    });
  } catch (error) {
    console.error('Error generating TryTerra auth widget:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate TryTerra authentication widget',
      error: error.message
    });
  }
};

/**
 * Handle TryTerra authentication callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleAuthCallback = async (req, res) => {
  try {
    const { reference_id, user_id, status, provider } = req.body;
    
    if (!reference_id) {
      return res.status(400).json({ success: false, message: 'Reference ID is required' });
    }
    
    // Find user by reference_id
    const user = await User.findOne({ reference_id });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with the provided reference ID' });
    }
    
    // Update user with TryTerra connection info
    user.terra_user_id = user_id;
    user.terra_connection = {
      connected: status === 'success',
      provider,
      status: status === 'success' ? 'connected' : 'error',
      last_synced: new Date()
    };
    
    await user.save();
    
    // Schedule data fetching for this user if connection successful
    if (status === 'success') {
      terraScheduler.scheduleUserFetch(user._id.toString(), user_id, user.data_fetch_settings?.frequency);
    }
    
    return res.status(200).json({
      success: true,
      message: `TryTerra authentication ${status}`,
      user_id
    });
  } catch (error) {
    console.error('Error handling TryTerra auth callback:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process TryTerra authentication callback',
      error: error.message
    });
  }
};

/**
 * Handle TryTerra data webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Verify webhook signature if needed
    // const signature = req.headers['x-terra-signature'];
    
    if (!webhookData || !webhookData.user || !webhookData.user.user_id) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
    }
    
    logger.info('Received webhook from TryTerra', {
      terraUserId: webhookData.user.user_id,
      type: webhookData.type
    });
    
    // Process webhook data
    const processedData = await terraService.processWebhookData(webhookData);
    
    // Find user by terra_user_id
    const user = await User.findOne({ terra_user_id: webhookData.user.user_id });
    
    if (!user) {
      logger.warn(`Webhook received for unknown user: ${webhookData.user.user_id}`);
      // Still acknowledge receipt to TryTerra
      return res.status(200).json({ success: true, message: 'Webhook received, but user not found' });
    }
    
    // Update user's last_synced timestamp
    user.terra_connection.last_synced = new Date();
    await user.save();
    
    // Determine data type
    const dataType = webhookData.type.toLowerCase();
    
    // Create wearable data record
    const wearableData = new WearableData({
      user_id: webhookData.user.user_id,
      reference_id: user.reference_id,
      data_type: dataType,
      source: 'tryterra_webhook',
      start_date: new Date(webhookData.data.metadata?.start_time || Date.now()),
      end_date: new Date(webhookData.data.metadata?.end_time || Date.now()),
      metadata: {
        device_type: webhookData.data.metadata?.device_type || 'unknown',
        device_model: webhookData.data.metadata?.device_model || 'unknown',
        provider: webhookData.data.metadata?.provider || 'unknown'
      },
      data: webhookData.data,
      processed: false,
      processing_status: 'pending'
    });
    
    await wearableData.save();
    
    // Trigger data processing in the background
    if (dataType === 'activity' || dataType === 'body' || dataType === 'sleep' || dataType === 'daily' || dataType === 'nutrition') {
      // Process in background to avoid blocking the webhook response
      setImmediate(async () => {
        try {
          logger.info(`Processing webhook data for user ${user._id}`, { dataType });
          await wearableDataProcessor.processUserData(user._id.toString(), user.terra_user_id);
        } catch (error) {
          logger.error(`Error processing webhook data for user ${user._id}`, { error: error.message });
        }
      });
    }
    
    // Acknowledge receipt to TryTerra
    return res.status(200).json({
      success: true,
      message: `Webhook processed successfully for user ${user._id}`,
      data_type: dataType
    });
  } catch (error) {
    logger.error('Error processing TryTerra webhook:', { error: error.message, stack: error.stack });
    // Still return 200 so TryTerra doesn't retry
    return res.status(200).json({
      success: false,
      message: 'Error processing webhook, but receipt acknowledged',
      error: error.message
    });
  }
};

/**
 * Manually fetch data for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.fetchUserData = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id; // Use provided ID or authenticated user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.terra_user_id) {
      return res.status(400).json({ success: false, message: 'User not connected to TryTerra' });
    }
    
    // Get date range from request or use defaults
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (req.query.days ? parseInt(req.query.days) : 7));
    
    // Fetch data from scheduler service
    const result = await terraScheduler.fetchDataForUser(
      user._id.toString(), 
      user.terra_user_id,
      user.reference_id
    );
    
    // Update user's last_fetch timestamp
    user.data_fetch_settings = {
      ...user.data_fetch_settings,
      last_fetch: new Date()
    };
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: `Successfully fetched TryTerra data for user ${userId}`,
      records: result.recordCount,
      next_scheduled: user.data_fetch_settings.next_fetch
    });
  } catch (error) {
    console.error('Error fetching user data from TryTerra:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user data from TryTerra',
      error: error.message
    });
  }
};

/**
 * Get user's wearable data from database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getUserData = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id; // Use provided ID or authenticated user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.terra_user_id) {
      return res.status(400).json({ success: false, message: 'User not connected to TryTerra' });
    }
    
    // Get query parameters
    const dataType = req.query.type || 'combined';
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    // Query for wearable data
    const data = await WearableData.find({
      user_id: user.terra_user_id,
      data_type: dataType
    })
    .sort({ start_date: -1 })
    .skip(skip)
    .limit(limit);
    
    // Get total count for pagination
    const total = await WearableData.countDocuments({
      user_id: user.terra_user_id,
      data_type: dataType
    });
    
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error retrieving user wearable data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user wearable data',
      error: error.message
    });
  }
};

/**
 * Update user's data fetch settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateFetchSettings = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id; // Use provided ID or authenticated user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const { enabled, frequency, data_types } = req.body;
    
    // Update user's data fetch settings
    user.data_fetch_settings = {
      ...user.data_fetch_settings,
      enabled: enabled !== undefined ? enabled : user.data_fetch_settings?.enabled,
      frequency: frequency || user.data_fetch_settings?.frequency,
      data_types: data_types || user.data_fetch_settings?.data_types
    };
    
    await user.save();
    
    // Update scheduler if user has TryTerra connection
    if (user.terra_user_id && user.data_fetch_settings.enabled) {
      terraScheduler.scheduleUserFetch(
        user._id.toString(),
        user.terra_user_id,
        user.data_fetch_settings.frequency
      );
    } else if (user.terra_user_id && !user.data_fetch_settings.enabled) {
      terraScheduler.stopScheduledJob(`user_${user._id}`);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Data fetch settings updated successfully',
      settings: user.data_fetch_settings
    });
  } catch (error) {
    logger.error('Error updating data fetch settings:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Failed to update data fetch settings',
      error: error.message
    });
  }
};

/**
 * Process wearable data for a specific user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.processUserData = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id; // Use provided ID or authenticated user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.terra_user_id) {
      return res.status(400).json({ success: false, message: 'User not connected to TryTerra' });
    }
    
    logger.info(`Manual processing requested for user ${userId}`);
    
    // Process data using wearableDataProcessor
    const result = await wearableDataProcessor.processUserData(userId, user.terra_user_id);
    
    return res.status(200).json({
      success: true,
      message: result.processed 
        ? `Successfully processed wearable data for user ${userId}` 
        : `No unprocessed data found for user ${userId}`,
      alerts: result.results?.alerts || [],
      processed: result.processed
    });
  } catch (error) {
    logger.error('Error processing wearable data:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Failed to process wearable data',
      error: error.message
    });
  }
};

/**
 * Process all pending wearable data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.processAllPendingData = async (req, res) => {
  try {
    const batchSize = req.query.batchSize ? parseInt(req.query.batchSize) : 50;
    
    logger.info(`Manual batch processing requested`, { batchSize });
    
    // Process all pending data
    const result = await wearableDataProcessor.processAllPendingData({ batchSize });
    
    return res.status(200).json({
      success: true,
      message: `Processed ${result.processed} records with ${result.alerts} alerts`,
      failed: result.failed,
      processed: result.processed,
      alerts: result.alerts
    });
  } catch (error) {
    logger.error('Error processing pending wearable data:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Failed to process pending wearable data',
      error: error.message
    });
  }
};

/**
 * Get scheduler status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getSchedulerStatus = async (req, res) => {
  try {
    const activeJobs = terraScheduler.getActiveJobs();
    
    return res.status(200).json({
      success: true,
      activeJobs,
      jobCount: Object.keys(activeJobs).length
    });
  } catch (error) {
    logger.error('Error getting scheduler status:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: 'Failed to get scheduler status',
      error: error.message
    });
  }
};