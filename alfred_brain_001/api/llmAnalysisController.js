/**
 * LLM Analysis Controller
 * 
 * Handles API requests for generating performance plans
 * and insights using LLM-based analysis of wearable data.
 */

const llmAnalysisService = require('../services/llmAnalysisService');

/**
 * Generate a performance plan
 * 
 * @route POST /api/analysis/generate-plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Performance plan
 */
async function generatePerformancePlan(req, res) {
  try {
    const { userId, startDate, endDate, planType } = req.body;
    
    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO format (YYYY-MM-DD)' });
    }
    
    // Generate the plan
    const plan = await llmAnalysisService.generatePerformancePlan(
      userId,
      startDateObj,
      endDateObj,
      planType || 'comprehensive'
    );
    
    return res.status(201).json(plan);
  } catch (error) {
    console.error(`Error generating performance plan: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Generate insights for an existing plan
 * 
 * @route POST /api/analysis/plan-insights/:planId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Plan insights
 */
async function generatePlanInsights(req, res) {
  try {
    const { planId } = req.params;
    
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }
    
    const insights = await llmAnalysisService.generatePlanInsights(planId);
    
    return res.status(200).json(insights);
  } catch (error) {
    console.error(`Error generating plan insights: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Analyze wearable data directly (without creating a plan)
 * 
 * @route POST /api/analysis/analyze-data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Analysis results
 */
async function analyzeWearableData(req, res) {
  try {
    const { userId, startDate, endDate } = req.body;
    
    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO format (YYYY-MM-DD)' });
    }
    
    // Get user profile
    const UserFitnessProfile = require('../models/userFitnessProfileModel');
    const userProfile = await UserFitnessProfile.findOne({ user_id: userId });
    
    if (!userProfile) {
      return res.status(404).json({ error: `User fitness profile not found for user ID: ${userId}` });
    }
    
    // Get wearable data
    const WearableData = require('../models/wearableDataModel');
    const wearableData = await WearableData.find({
      user_id: userId,
      date: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    }).sort({ date: 1 });
    
    if (wearableData.length === 0) {
      return res.status(404).json({ error: `No wearable data found for user ID: ${userId} in the specified date range` });
    }
    
    // Preprocess the data
    const processedData = llmAnalysisService.preprocessWearableData(wearableData);
    
    // Generate insights
    const insights = await llmAnalysisService.generateInsightsFromLLM(
      processedData,
      userProfile,
      'analysis' // Use a specific mode for direct analysis
    );
    
    return res.status(200).json({
      analysis: insights.analysis,
      recommendations: insights.recommendations,
      data_based_modifications: insights.data_based_modifications,
      processed_data_summary: {
        dateRange: processedData.dateRange,
        heartRate: {
          avgDailyResting: processedData.heartRate.avgDailyResting,
          maxRecorded: processedData.heartRate.maxRecorded,
          minRecorded: processedData.heartRate.minRecorded
        },
        sleep: {
          avgDuration: processedData.sleep.avgDuration,
          avgDeepSleep: processedData.sleep.avgDeepSleep,
          avgRemSleep: processedData.sleep.avgRemSleep,
          avgSleepEfficiency: processedData.sleep.avgSleepEfficiency
        },
        activity: {
          avgDailySteps: processedData.activity.avgDailySteps,
          avgDailyActiveMinutes: processedData.activity.avgDailyActiveMinutes,
          avgDailyCalories: processedData.activity.avgDailyCalories
        },
        patterns: processedData.patterns
      }
    });
  } catch (error) {
    console.error(`Error analyzing wearable data: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  generatePerformancePlan,
  generatePlanInsights,
  analyzeWearableData
};