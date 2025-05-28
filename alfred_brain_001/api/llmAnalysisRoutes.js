/**
 * LLM Analysis Routes
 * 
 * API routes for generating performance plans and insights
 * using LLM-based analysis of wearable data.
 */

const express = require('express');
const router = express.Router();
const llmAnalysisController = require('./llmAnalysisController');

/**
 * Generate a performance plan
 * 
 * @route POST /api/analysis/generate-plan
 * @param {string} userId - User ID to generate plan for
 * @param {string} startDate - Start date for data analysis (YYYY-MM-DD)
 * @param {string} endDate - End date for data analysis (YYYY-MM-DD)
 * @param {string} planType - Type of plan to generate (athletic, nutritional, mental, comprehensive)
 * @returns {Object} Performance plan
 */
router.post('/generate-plan', llmAnalysisController.generatePerformancePlan);

/**
 * Generate insights for an existing performance plan
 * 
 * @route GET /api/analysis/plan-insights/:planId
 * @param {string} planId - Performance plan ID
 * @returns {Object} Plan insights
 */
router.get('/plan-insights/:planId', llmAnalysisController.generatePlanInsights);

/**
 * Analyze wearable data directly (without creating a plan)
 * 
 * @route POST /api/analysis/analyze-data
 * @param {string} userId - User ID to analyze data for
 * @param {string} startDate - Start date for data analysis (YYYY-MM-DD)
 * @param {string} endDate - End date for data analysis (YYYY-MM-DD)
 * @returns {Object} Analysis results
 */
router.post('/analyze-data', llmAnalysisController.analyzeWearableData);

module.exports = router;