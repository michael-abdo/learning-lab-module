/**
 * TryTerra Data Scheduler Service
 * 
 * This service manages periodic data fetching from TryTerra API.
 * It uses a scheduler to fetch data at regular intervals and stores it in MongoDB.
 * 
 * This is a native replacement for the AWS Lambda fetchTerraData.js function.
 */

const mongoose = require('mongoose');
const terraService = require('./tryterraService');
const WearableData = require('../models/wearableDataModel');
const User = require('../models/userModel');
const logger = require('../utils/logger');
require('dotenv').config();

// Import scheduler library
const cron = require('node-cron');

// Configuration from environment variables
const config = {
  // Scheduler configuration
  dateFetchInterval: process.env.DATA_FETCH_INTERVAL || '0 */6 * * *', // Every 6 hours by default
  userFetchLimit: parseInt(process.env.USER_FETCH_LIMIT) || 50, // Process users in batches
  userFetchDelay: parseInt(process.env.USER_FETCH_DELAY) || 200, // Delay between user fetches to avoid rate limits
  
  // Date range configuration
  defaultLookbackDays: parseInt(process.env.DEFAULT_LOOKBACK_DAYS) || 7, // Default days to look back
  
  // Retry configuration
  maxRetries: parseInt(process.env.MAX_FETCH_RETRIES) || 3, // Maximum retries on failure
  retryDelay: parseInt(process.env.RETRY_DELAY) || 1000, // Delay between retries in ms
  
  // Notification configuration (for future alerts)
  enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true',
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'admin@example.com'
};

// Active jobs registry
const activeJobs = new Map();

/**
 * Schedule data fetching for all users
 * @param {string} [customInterval] - Optional custom cron schedule
 * @returns {string} - Job ID
 */
exports.scheduleAllUsersFetch = (customInterval) => {
  const jobId = 'allUsers';
  const interval = customInterval || config.dateFetchInterval;
  
  // Cancel existing job if it exists
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId).stop();
    activeJobs.delete(jobId);
    logger.info(`Cancelled existing fetch job: ${jobId}`);
  }
  
  // Create a new scheduled job
  const job = cron.schedule(interval, async () => {
    logger.info('Starting scheduled TryTerra data fetch for all users');
    
    try {
      await this.fetchDataForAllUsers();
      logger.info('Completed scheduled TryTerra data fetch for all users');
    } catch (error) {
      logger.error('Error in scheduled TryTerra data fetch', { error: error.message, stack: error.stack });
      
      // Send notification about fetch failure if enabled
      if (config.enableNotifications) {
        // This would be replaced with actual notification logic
        logger.info(`Notification would be sent to ${config.notificationEmail}`);
      }
    }
  });
  
  // Store the job reference
  activeJobs.set(jobId, job);
  logger.info(`Scheduled TryTerra data fetch for all users`, { interval, jobId });
  
  return jobId;
};

/**
 * Schedule data fetching for a specific user
 * @param {string} userId - Database user ID
 * @param {string} terraUserId - TryTerra user ID
 * @param {string} [customInterval] - Custom cron schedule (optional)
 * @param {string} [referenceId] - Reference ID for the user (optional)
 * @returns {string} - Job ID
 */
exports.scheduleUserFetch = (userId, terraUserId, customInterval, referenceId) => {
  const jobId = `user_${userId}`;
  const interval = customInterval || config.dateFetchInterval;
  
  // Cancel existing job if it exists
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId).stop();
    activeJobs.delete(jobId);
    logger.debug(`Cancelled existing fetch job for user: ${userId}`);
  }
  
  // Create a new scheduled job
  const job = cron.schedule(interval, async () => {
    logger.info(`Starting scheduled TryTerra data fetch for user ${userId}`);
    
    try {
      await this.fetchDataForUser(userId, terraUserId, referenceId);
      logger.info(`Completed scheduled TryTerra data fetch for user ${userId}`);
    } catch (error) {
      logger.error(`Error in scheduled TryTerra data fetch for user ${userId}`, { 
        error: error.message, 
        stack: error.stack,
        userId,
        terraUserId
      });
      
      // Implement retry logic
      let retryCount = 0;
      const retry = async () => {
        if (retryCount < config.maxRetries) {
          retryCount++;
          logger.info(`Retrying TryTerra data fetch for user ${userId} (attempt ${retryCount}/${config.maxRetries})`);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
          
          try {
            await this.fetchDataForUser(userId, terraUserId, referenceId);
            logger.info(`Retry successful for user ${userId} on attempt ${retryCount}`);
          } catch (retryError) {
            logger.error(`Retry attempt ${retryCount} failed for user ${userId}`, { error: retryError.message });
            
            if (retryCount < config.maxRetries) {
              // Exponential backoff for retry delay
              const nextDelay = config.retryDelay * Math.pow(2, retryCount);
              setTimeout(() => retry(), nextDelay);
            } else {
              logger.error(`All ${config.maxRetries} retry attempts failed for user ${userId}`);
              
              // Send notification about failure if enabled
              if (config.enableNotifications) {
                // This would be replaced with actual notification logic
                logger.info(`Notification would be sent to ${config.notificationEmail} about failed fetch for user ${userId}`);
              }
            }
          }
        }
      };
      
      // Start retry process
      retry();
    }
  });
  
  // Store the job reference
  activeJobs.set(jobId, job);
  logger.info(`Scheduled TryTerra data fetch for user ${userId}`, { interval, jobId });
  
  return jobId;
};

/**
 * Stop a scheduled job
 * @param {string} jobId - ID of the job to stop
 * @returns {boolean} - Whether the job was stopped successfully
 */
exports.stopScheduledJob = (jobId) => {
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId).stop();
    activeJobs.delete(jobId);
    logger.info(`Stopped scheduled job: ${jobId}`);
    return true;
  }
  
  logger.warn(`Attempted to stop non-existent job: ${jobId}`);
  return false;
};

/**
 * Get all active scheduled jobs
 * @returns {Object} - Object with job IDs as keys and their status as values
 */
exports.getActiveJobs = () => {
  const jobs = {};
  
  activeJobs.forEach((job, jobId) => {
    jobs[jobId] = {
      status: 'active',
      scheduled: true
    };
  });
  
  return jobs;
};

/**
 * Fetch data for all users
 * @param {Object} [options] - Optional parameters
 * @param {number} [options.batchSize] - Size of each batch of users to process
 * @param {number} [options.skipUsers] - Number of users to skip (for pagination)
 * @param {boolean} [options.processData] - Whether to trigger data processing after fetching
 * @returns {Object} - Result of the fetch operation
 */
exports.fetchDataForAllUsers = async (options = {}) => {
  try {
    const batchSize = options.batchSize || config.userFetchLimit;
    const skipUsers = options.skipUsers || 0;
    const shouldProcessData = options.processData !== undefined ? options.processData : true;
    
    logger.info('Starting TryTerra data fetch for all users', { 
      batchSize, 
      skipUsers,
      processData: shouldProcessData
    });
    
    // Get count of users with TryTerra connection
    const totalUsers = await User.countDocuments({ 
      'terra_user_id': { $exists: true, $ne: null },
      'terra_connection.connected': true,
      'data_fetch_settings.enabled': { $ne: false }
    });
    
    logger.info(`Found ${totalUsers} users with active TryTerra connection`);
    
    if (totalUsers === 0) {
      logger.info('No users with TryTerra connection found, skipping fetch');
      return { success: true, totalUsers: 0, processedUsers: 0 };
    }
    
    // Process users in batches to avoid memory issues
    const batchCount = Math.ceil((totalUsers - skipUsers) / batchSize);
    const results = {
      success: true,
      totalUsers,
      processedUsers: 0,
      successCount: 0,
      failureCount: 0,
      errors: []
    };
    
    for (let batch = 0; batch < batchCount; batch++) {
      const skip = skipUsers + (batch * batchSize);
      logger.info(`Processing batch ${batch + 1}/${batchCount}, users ${skip + 1}-${Math.min(skip + batchSize, totalUsers)}`);
      
      // Get users for this batch
      const users = await User.find({ 
        'terra_user_id': { $exists: true, $ne: null },
        'terra_connection.connected': true,
        'data_fetch_settings.enabled': { $ne: false }
      })
        .skip(skip)
        .limit(batchSize)
        .select('_id terra_user_id reference_id terra_connection data_fetch_settings')
        .lean();
      
      results.processedUsers += users.length;
      
      // Process each user in parallel with rate limiting
      const fetchPromises = users.map((user, index) => 
        new Promise(resolve => {
          // Stagger requests slightly to avoid rate limits
          setTimeout(async () => {
            try {
              const result = await this.fetchDataForUser(user._id, user.terra_user_id, user.reference_id, {
                processData: shouldProcessData,
                dataTypes: user.data_fetch_settings?.data_types
              });
              
              results.successCount++;
              resolve({ success: true, userId: user._id, result });
            } catch (error) {
              logger.error(`Error fetching data for user ${user._id}`, { 
                error: error.message,
                userId: user._id,
                terraUserId: user.terra_user_id
              });
              
              results.failureCount++;
              results.errors.push({
                userId: user._id,
                terraUserId: user.terra_user_id,
                error: error.message
              });
              
              resolve({ success: false, userId: user._id, error: error.message });
            }
          }, index * config.userFetchDelay);
        })
      );
      
      await Promise.all(fetchPromises);
    }
    
    logger.info(`Completed TryTerra data fetch for all users`, {
      totalProcessed: results.processedUsers,
      successful: results.successCount,
      failed: results.failureCount
    });
    
    return results;
  } catch (error) {
    logger.error('Error in batch fetch operation for all users', { 
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
};

/**
 * Fetch data for a specific user
 * @param {string} userId - Database user ID
 * @param {string} terraUserId - TryTerra user ID
 * @param {string} referenceId - Reference ID for TryTerra
 * @param {Object} [options] - Optional parameters
 * @param {boolean} [options.processData] - Whether to trigger data processing after fetching
 * @param {string[]} [options.dataTypes] - Specific data types to fetch
 * @param {number} [options.lookbackDays] - Number of days to look back
 * @returns {Object} - Result of the fetch operation
 */
exports.fetchDataForUser = async (userId, terraUserId, referenceId, options = {}) => {
  try {
    // Set defaults
    const shouldProcessData = options.processData !== undefined ? options.processData : true;
    const lookbackDays = options.lookbackDays || config.defaultLookbackDays;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    logger.info(`Fetching TryTerra data for user ${userId}`, { 
      terraUserId,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      lookbackDays
    });
    
    // Fetch data from TryTerra
    const userData = await terraService.getAllUserData(terraUserId, formattedStartDate, formattedEndDate);
    
    // Process and save each data type
    const savedRecords = [];
    
    // Create "combined" record with all data
    const combinedRecord = new WearableData({
      user_id: terraUserId,
      reference_id: referenceId,
      data_type: 'combined',
      source: 'tryterra_scheduler',
      start_date: startDate,
      end_date: endDate,
      metadata: {
        device_type: userData.data.activity?.data?.[0]?.metadata?.device_type || 'unknown',
        device_model: userData.data.activity?.data?.[0]?.metadata?.device_model || 'unknown',
        provider: userData.data.activity?.data?.[0]?.metadata?.provider || 'unknown'
      },
      data: userData.data,
      processed: false,
      processing_status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });
    
    await combinedRecord.save();
    savedRecords.push(combinedRecord);
    
    // Save individual data types if requested
    const dataTypesToSave = options.dataTypes || ['activity', 'body', 'sleep', 'nutrition', 'daily'];
    
    // Only save data types that have data
    for (const dataType of dataTypesToSave) {
      if (userData.data[dataType] && 
          userData.data[dataType].data && 
          userData.data[dataType].data.length > 0) {
        
        const record = new WearableData({
          user_id: terraUserId,
          reference_id: referenceId,
          data_type: dataType,
          source: 'tryterra_scheduler',
          start_date: startDate,
          end_date: endDate,
          metadata: {
            device_type: userData.data[dataType].data[0]?.metadata?.device_type || 'unknown',
            device_model: userData.data[dataType].data[0]?.metadata?.device_model || 'unknown',
            provider: userData.data[dataType].data[0]?.metadata?.provider || 'unknown'
          },
          data: userData.data[dataType],
          processed: false,
          processing_status: 'pending',
          created_at: new Date(),
          updated_at: new Date()
        });
        
        await record.save();
        savedRecords.push(record);
      }
    }
    
    logger.info(`Successfully saved ${savedRecords.length} records for user ${userId}`);
    
    // Update user's last fetch time in the database
    await User.findByIdAndUpdate(userId, {
      'terra_connection.last_synced': new Date(),
      'data_fetch_settings.last_fetch': new Date(),
      'data_fetch_settings.next_fetch': new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 hours later by default
    });
    
    // Trigger processing of data if requested
    if (shouldProcessData && savedRecords.length > 0) {
      try {
        // Note: This will be implemented in the wearable data processor service
        // await wearableDataProcessor.processUserData(userId, terraUserId);
        logger.debug(`Data processing would be triggered for user ${userId}`);
      } catch (processingError) {
        logger.error(`Error processing data for user ${userId}`, { 
          error: processingError.message 
        });
        // We don't want to fail the whole operation if processing fails
      }
    }
    
    return { 
      success: true, 
      userId,
      terraUserId,
      recordCount: savedRecords.length, 
      recordIds: savedRecords.map(record => record._id)
    };
  } catch (error) {
    logger.error(`Error fetching data for user ${userId}`, { 
      error: error.message,
      stack: error.stack,
      terraUserId
    });
    
    throw error;
  }
};

/**
 * Manually trigger a data fetch for a specific user
 * @param {string} userId - Database user ID
 * @returns {Object} - Result of the fetch operation
 */
exports.manualFetchForUser = async (userId) => {
  try {
    logger.info(`Manual data fetch requested for user ${userId}`);
    
    // Find user
    const user = await User.findById(userId).select('_id terra_user_id reference_id terra_connection').lean();
    
    if (!user) {
      logger.error(`User not found: ${userId}`);
      throw new Error(`User not found: ${userId}`);
    }
    
    if (!user.terra_user_id) {
      logger.error(`User ${userId} does not have a TryTerra connection`);
      throw new Error(`User does not have a TryTerra connection`);
    }
    
    // Perform fetch
    return await this.fetchDataForUser(userId, user.terra_user_id, user.reference_id, {
      processData: true,
      lookbackDays: 7 // Default to last 7 days for manual fetch
    });
  } catch (error) {
    logger.error(`Error in manual fetch for user ${userId}`, { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Initialize the scheduler service
 * @param {Object} [options] - Initialization options
 * @param {boolean} [options.startScheduler=true] - Whether to start the scheduler immediately
 * @param {boolean} [options.initialFetch=false] - Whether to perform an initial fetch on startup
 * @returns {Object} - Initialization result
 */
exports.init = async (options = {}) => {
  try {
    const startScheduler = options.startScheduler !== undefined ? options.startScheduler : true;
    const initialFetch = options.initialFetch || false;
    
    logger.info('Initializing TryTerra Scheduler Service', { startScheduler, initialFetch });
    
    if (startScheduler) {
      // Schedule data fetching for all users
      this.scheduleAllUsersFetch();
    }
    
    if (initialFetch) {
      logger.info('Performing initial data fetch for all users');
      // Use a smaller batch size for initial fetch to avoid overwhelming the system
      await this.fetchDataForAllUsers({ batchSize: 10 });
    }
    
    logger.info('TryTerra Scheduler Service initialized successfully');
    
    return { 
      success: true, 
      activeJobs: this.getActiveJobs(),
      scheduler: startScheduler ? 'active' : 'disabled'
    };
  } catch (error) {
    logger.error('Error initializing TryTerra Scheduler Service', { 
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
};