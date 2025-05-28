/**
 * Wearable Data Processor Service
 * 
 * This service processes wearable data from TryTerra and other sources,
 * applies decision logic, and generates alerts based on thresholds.
 * 
 * This is a native replacement for the AWS Lambda processWearableData.js function.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const WearableData = require('../models/wearableDataModel');
const User = require('../models/userModel');
const { processData } = require('../../scripts/process-data'); // Reusing existing utility
require('dotenv').config();

// Notification service (placeholder - would be implemented with actual notification system)
const notificationService = {
  sendNotification: async (userId, alert) => {
    logger.info(`[Notification] Alert for user ${userId}`, { alert });
    return { success: true, alert };
  }
};

// Threshold configuration from environment variables
const thresholds = {
  highHeartRate: parseInt(process.env.HIGH_HEART_RATE_THRESHOLD) || 180,
  lowDailySteps: parseInt(process.env.LOW_DAILY_STEPS_THRESHOLD) || 2000,
  highRestingHeartRate: parseInt(process.env.HIGH_RESTING_HEART_RATE_THRESHOLD) || 90,
  lowSleepDuration: parseInt(process.env.LOW_SLEEP_DURATION_THRESHOLD) || 6 * 60, // 6 hours in minutes
  enableAlerts: process.env.ENABLE_ALERTS !== 'false' // Default to true if not specified
};

/**
 * Process heart rate data and check for alerts
 * @param {number} heartRate - Heart rate value to process
 * @returns {Object|null} - Alert object or null if no alert
 */
const processHeartRate = (heartRate) => {
  if (heartRate > thresholds.highHeartRate) {
    return {
      type: 'high_heart_rate',
      severity: 'high',
      value: heartRate,
      threshold: thresholds.highHeartRate,
      message: `High heart rate detected: ${heartRate} BPM (threshold: ${thresholds.highHeartRate} BPM)`,
      recommendation: 'Consider resting or consulting a healthcare professional if this persists'
    };
  }
  return null;
};

/**
 * Process resting heart rate data and check for alerts
 * @param {number} restingHeartRate - Resting heart rate value to process
 * @returns {Object|null} - Alert object or null if no alert
 */
const processRestingHeartRate = (restingHeartRate) => {
  if (restingHeartRate > thresholds.highRestingHeartRate) {
    return {
      type: 'high_resting_heart_rate',
      severity: 'medium',
      value: restingHeartRate,
      threshold: thresholds.highRestingHeartRate,
      message: `High resting heart rate detected: ${restingHeartRate} BPM (threshold: ${thresholds.highRestingHeartRate} BPM)`,
      recommendation: 'Consider improving cardiovascular fitness and reducing stress'
    };
  }
  return null;
};

/**
 * Process steps data and check for alerts
 * @param {number} steps - Step count to process
 * @returns {Object|null} - Alert object or null if no alert
 */
const processSteps = (steps) => {
  if (steps < thresholds.lowDailySteps) {
    return {
      type: 'low_steps',
      severity: 'medium',
      value: steps,
      threshold: thresholds.lowDailySteps,
      message: `Low daily step count detected: ${steps} steps (threshold: ${thresholds.lowDailySteps} steps)`,
      recommendation: 'Consider taking regular breaks to walk or using the stairs instead of elevators'
    };
  }
  return null;
};

/**
 * Process sleep data and check for alerts
 * @param {Object} sleepData - Sleep data object from TryTerra
 * @returns {Object|null} - Alert object or null if no alert
 */
const processSleepData = (sleepData) => {
  if (!sleepData || !sleepData.duration) {
    return null;
  }
  
  const sleepDuration = sleepData.duration;
  
  if (sleepDuration < thresholds.lowSleepDuration) {
    const hours = Math.floor(sleepDuration / 60);
    const minutes = sleepDuration % 60;
    const formattedDuration = `${hours}h ${minutes}m`;
    const formattedThreshold = `${Math.floor(thresholds.lowSleepDuration / 60)}h ${thresholds.lowSleepDuration % 60}m`;
    
    return {
      type: 'low_sleep_duration',
      severity: 'medium',
      value: sleepDuration,
      threshold: thresholds.lowSleepDuration,
      message: `Low sleep duration detected: ${formattedDuration} (threshold: ${formattedThreshold})`,
      recommendation: 'Consider establishing a consistent sleep schedule and improving sleep hygiene'
    };
  }
  return null;
};

/**
 * Save alert to database
 * @param {string} userId - MongoDB user ID
 * @param {string} terraUserId - TryTerra user ID
 * @param {Object} alert - Alert object
 * @returns {Object} - Created alert document
 */
const saveAlertToDatabase = async (userId, terraUserId, alert) => {
  try {
    // Define Alert model if not already defined
    const AlertModel = mongoose.models.Alert || mongoose.model('Alert', new mongoose.Schema({
      userId: String,
      terraUserId: String,
      type: String,
      severity: String,
      value: Number,
      threshold: Number,
      message: String,
      recommendation: String,
      processed: { type: Boolean, default: false },
      acknowledged: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }));
    
    // Create alert record
    const alertRecord = new AlertModel({
      userId,
      terraUserId,
      type: alert.type,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
      message: alert.message,
      recommendation: alert.recommendation
    });
    
    await alertRecord.save();
    logger.info(`Alert saved to database for user ${userId}`, { alertId: alertRecord._id, type: alert.type });
    
    return alertRecord;
  } catch (error) {
    logger.error(`Error saving alert to database for user ${userId}`, {
      error: error.message,
      alert
    });
    throw error;
  }
};

/**
 * Process wearable data for a specific user
 * @param {string} userId - MongoDB user ID
 * @param {string} terraUserId - TryTerra user ID
 * @param {Object} [options] - Processing options
 * @returns {Object} - Processing results
 */
exports.processUserData = async (userId, terraUserId, options = {}) => {
  logger.info(`Processing wearable data for user ${userId}`, { terraUserId });
  
  try {
    // Find latest wearable data for the user
    const latestData = await WearableData.findOne({
      user_id: terraUserId,
      data_type: 'combined',
      processed: false
    }).sort({ created_at: -1 });
    
    if (!latestData) {
      logger.info(`No unprocessed data found for user ${userId}`);
      return { success: true, processed: false, noDataFound: true };
    }
    
    // Run standard data processing first (from existing scripts)
    await processData();
    
    // Extract relevant metrics for processing
    const results = {
      processed: [],
      alerts: []
    };
    
    // Process activity data (steps, heart rate)
    if (latestData.data.activity && latestData.data.activity.data && latestData.data.activity.data.length > 0) {
      const activityData = latestData.data.activity.data[0];
      
      // Process heart rate if available
      if (activityData.heart_rate && activityData.heart_rate.avg) {
        const heartRateAlert = processHeartRate(activityData.heart_rate.avg);
        if (heartRateAlert) {
          results.alerts.push(heartRateAlert);
          
          // Save alert to database
          await saveAlertToDatabase(userId, terraUserId, heartRateAlert);
          
          // Send notification
          if (thresholds.enableAlerts) {
            await notificationService.sendNotification(userId, heartRateAlert);
          }
        }
        results.processed.push('heart_rate');
      }
      
      // Process resting heart rate if available
      if (activityData.heart_rate && activityData.heart_rate.resting) {
        const restingHeartRateAlert = processRestingHeartRate(activityData.heart_rate.resting);
        if (restingHeartRateAlert) {
          results.alerts.push(restingHeartRateAlert);
          
          // Save alert to database
          await saveAlertToDatabase(userId, terraUserId, restingHeartRateAlert);
          
          // Send notification
          if (thresholds.enableAlerts) {
            await notificationService.sendNotification(userId, restingHeartRateAlert);
          }
        }
        results.processed.push('resting_heart_rate');
      }
      
      // Process steps if available
      if (activityData.steps !== undefined) {
        const stepsAlert = processSteps(activityData.steps);
        if (stepsAlert) {
          results.alerts.push(stepsAlert);
          
          // Save alert to database
          await saveAlertToDatabase(userId, terraUserId, stepsAlert);
          
          // Send notification
          if (thresholds.enableAlerts) {
            await notificationService.sendNotification(userId, stepsAlert);
          }
        }
        results.processed.push('steps');
      }
    }
    
    // Process sleep data
    if (latestData.data.sleep && latestData.data.sleep.data && latestData.data.sleep.data.length > 0) {
      const sleepData = latestData.data.sleep.data[0];
      
      // Process sleep duration if available
      if (sleepData.duration) {
        const sleepAlert = processSleepData(sleepData);
        if (sleepAlert) {
          results.alerts.push(sleepAlert);
          
          // Save alert to database
          await saveAlertToDatabase(userId, terraUserId, sleepAlert);
          
          // Send notification
          if (thresholds.enableAlerts) {
            await notificationService.sendNotification(userId, sleepAlert);
          }
        }
        results.processed.push('sleep');
      }
    }
    
    // Update processing status
    latestData.processed = true;
    latestData.processing_status = 'complete';
    latestData.last_processed = new Date();
    latestData.updated_at = new Date();
    await latestData.save();
    
    logger.info(`Successfully processed data for user ${userId}`, {
      dataId: latestData._id,
      processedMetrics: results.processed,
      alertCount: results.alerts.length
    });
    
    return {
      success: true,
      processed: true,
      dataId: latestData._id,
      results
    };
  } catch (error) {
    logger.error(`Error processing data for user ${userId}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process pending data for all users
 * @param {Object} [options] - Processing options
 * @param {number} [options.batchSize] - Number of records to process in a batch
 * @returns {Object} - Processing results
 */
exports.processAllPendingData = async (options = {}) => {
  const batchSize = options.batchSize || 50;
  
  logger.info(`Processing pending wearable data for all users`, { batchSize });
  
  try {
    // Find users with pending data
    const pendingData = await WearableData.find({
      processed: false,
      data_type: 'combined'
    })
    .sort({ created_at: -1 })
    .limit(batchSize);
    
    if (pendingData.length === 0) {
      logger.info('No pending data found for processing');
      return { success: true, processed: 0 };
    }
    
    logger.info(`Found ${pendingData.length} records with pending data`);
    
    // Process each record
    const results = {
      success: true,
      processed: 0,
      failed: 0,
      alerts: 0,
      errors: []
    };
    
    for (const data of pendingData) {
      try {
        // Find user associated with this data
        const user = await User.findOne({ 
          terra_user_id: data.user_id 
        }).select('_id terra_user_id').lean();
        
        if (!user) {
          logger.warn(`No user found for terra_user_id: ${data.user_id}`);
          
          // Mark as processed to avoid repeated processing attempts
          data.processed = true;
          data.processing_status = 'error';
          data.last_processed = new Date();
          data.updated_at = new Date();
          await data.save();
          
          results.failed++;
          results.errors.push({
            dataId: data._id,
            error: 'User not found'
          });
          continue;
        }
        
        // Process data for this user
        const processingResult = await this.processUserData(user._id, user.terra_user_id);
        
        results.processed++;
        results.alerts += processingResult.results?.alerts.length || 0;
      } catch (error) {
        logger.error(`Error processing data ${data._id}`, {
          error: error.message,
          terraUserId: data.user_id
        });
        
        results.failed++;
        results.errors.push({
          dataId: data._id,
          terraUserId: data.user_id,
          error: error.message
        });
      }
    }
    
    logger.info(`Completed batch processing of wearable data`, {
      processedCount: results.processed,
      failedCount: results.failed,
      alertCount: results.alerts
    });
    
    return results;
  } catch (error) {
    logger.error('Error in batch processing of wearable data', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Initialize the wearable data processor service
 * @param {Object} [options] - Initialization options
 * @param {boolean} [options.processOnStartup] - Whether to process pending data on startup
 * @returns {Object} - Initialization result
 */
exports.init = async (options = {}) => {
  try {
    logger.info('Initializing Wearable Data Processor Service');
    
    // Process pending data on startup if requested
    if (options.processOnStartup) {
      logger.info('Processing pending data on startup');
      setTimeout(async () => {
        try {
          await this.processAllPendingData({ batchSize: 10 });
        } catch (error) {
          logger.error('Error in startup data processing', { error: error.message });
        }
      }, 5000); // Wait 5 seconds to ensure database connection is ready
    }
    
    logger.info('Wearable Data Processor Service initialized successfully', {
      thresholds: {
        highHeartRate: thresholds.highHeartRate,
        lowDailySteps: thresholds.lowDailySteps,
        highRestingHeartRate: thresholds.highRestingHeartRate,
        lowSleepDuration: thresholds.lowSleepDuration
      },
      alertsEnabled: thresholds.enableAlerts
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error initializing Wearable Data Processor Service', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};