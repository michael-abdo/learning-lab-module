/**
 * TryTerra API Service
 * 
 * This service handles all communication with the TryTerra API
 * for retrieving wearable device data.
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// TryTerra API Configuration
const TRYTERRA_API_BASE_URL = 'https://api.tryterra.co/v2';
const TRYTERRA_API_KEY = process.env.TRYTERRA_API_KEY_1 || 'runtheons-testing-zbnGQ364kw';
const TRYTERRA_DEV_ID = process.env.TRYTERRA_DEV_ID || 'runtheons-testing';
const TRYTERRA_API_KEY_2 = process.env.TRYTERRA_API_KEY_2 || 'LUgN_p9G8krf97q5Et3UHxBXetnDGFpx';

// Create axios instance with default headers
const terraApi = axios.create({
  baseURL: TRYTERRA_API_BASE_URL,
  headers: {
    'dev-id': TRYTERRA_DEV_ID,
    'x-api-key': TRYTERRA_API_KEY,
    'Content-Type': 'application/json'
  }
});

/**
 * Authenticate a user with TryTerra
 * @param {string} reference_id - Unique identifier for the user
 * @returns {Promise<Object>} - Authentication response with widget URL
 */
exports.authenticateUser = async (reference_id) => {
  try {
    const response = await terraApi.post('/auth/generateWidgetSession', {
      reference_id,
      providers: ["FITBIT", "GARMIN", "WITHINGS", "GOOGLE", "OURA", "WAHOO", "PELOTON", "ZWIFT", "TRAININGPEAKS", "FREESTYLELIBRE", "DEXCOM", "COROS", "HUAWEI", "OMRON", "RENPHO", "POLAR", "SUUNTO", "EIGHT", "APPLE", "SAMSUNG", "WHOOP"],
      language: "en"
    });

    return response.data;
  } catch (error) {
    console.error('Error authenticating with TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get user's activity data for a specific date range
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Activity data
 */
exports.getActivityData = async (user_id, start_date, end_date) => {
  try {
    const response = await terraApi.get(`/activity`, {
      params: {
        user_id,
        start_date,
        end_date,
        to_webhook: false
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching activity data from TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get user's body data for a specific date range
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Body data
 */
exports.getBodyData = async (user_id, start_date, end_date) => {
  try {
    const response = await terraApi.get(`/body`, {
      params: {
        user_id,
        start_date,
        end_date,
        to_webhook: false
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching body data from TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get user's sleep data for a specific date range
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Sleep data
 */
exports.getSleepData = async (user_id, start_date, end_date) => {
  try {
    const response = await terraApi.get(`/sleep`, {
      params: {
        user_id,
        start_date,
        end_date,
        to_webhook: false
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching sleep data from TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get user's nutrition data for a specific date range
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Nutrition data
 */
exports.getNutritionData = async (user_id, start_date, end_date) => {
  try {
    const response = await terraApi.get(`/nutrition`, {
      params: {
        user_id,
        start_date,
        end_date,
        to_webhook: false
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching nutrition data from TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get user's daily data for a specific date range (combined stats)
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Daily data
 */
exports.getDailyData = async (user_id, start_date, end_date) => {
  try {
    const response = await terraApi.get(`/daily`, {
      params: {
        user_id,
        start_date,
        end_date,
        to_webhook: false
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching daily data from TryTerra:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get all available data for a user for a specific date range
 * @param {string} user_id - TryTerra user ID
 * @param {string} start_date - Start date in YYYY-MM-DD format
 * @param {string} end_date - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Complete user data
 */
exports.getAllUserData = async (user_id, start_date, end_date) => {
  try {
    // Fetch all types of data in parallel
    const [activity, body, sleep, nutrition, daily] = await Promise.all([
      this.getActivityData(user_id, start_date, end_date),
      this.getBodyData(user_id, start_date, end_date),
      this.getSleepData(user_id, start_date, end_date),
      this.getNutritionData(user_id, start_date, end_date),
      this.getDailyData(user_id, start_date, end_date)
    ]);

    // Combine all data
    return {
      user_id,
      date_range: { start_date, end_date },
      timestamp: new Date().toISOString(),
      data: {
        activity,
        body,
        sleep,
        nutrition,
        daily
      }
    };
  } catch (error) {
    console.error('Error fetching all user data from TryTerra:', error.message);
    throw error;
  }
};

/**
 * Handle webhook data received from TryTerra
 * @param {Object} webhookData - Data received from TryTerra webhook
 * @returns {Promise<Object>} - Processed webhook data
 */
exports.processWebhookData = async (webhookData) => {
  try {
    // Process webhook data and prepare for database storage
    const processedData = {
      user_id: webhookData.user.user_id,
      type: webhookData.type,
      data: webhookData.data,
      timestamp: new Date().toISOString()
    };

    return processedData;
  } catch (error) {
    console.error('Error processing webhook data from TryTerra:', error.message);
    throw error;
  }
};