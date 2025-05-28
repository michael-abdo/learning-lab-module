/**
 * Expert Advisor Controller
 * 
 * Controller for handling expert advisor actions on performance plans.
 */

const expertAdvisorService = require('../services/expertAdvisorService');
const llmAnalysisService = require('../services/llmAnalysisService');
const notificationService = require('../services/notificationService');
const PerformancePlan = require('../models/performancePlanModel');
const logger = require('../utils/logger');

/**
 * Get all plans in the review queue
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getReviewQueue = async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 20,
      sortBy: req.query.sortBy || 'created_at',
      sortDir: req.query.sortDir === 'asc' ? 1 : -1
    };
    
    const pendingPlans = await expertAdvisorService.getPendingReviews(options);
    
    res.json({
      success: true,
      data: pendingPlans
    });
  } catch (error) {
    logger.error('Error getting review queue', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve review queue',
      error: error.message
    });
  }
};

/**
 * Get detailed plan information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getPlanDetails = async (req, res) => {
  try {
    const { planId } = req.params;
    
    const plan = await expertAdvisorService.getPlanDetails(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    logger.error('Error getting plan details', { 
      error: error.message,
      planId: req.params.planId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve plan details',
      error: error.message
    });
  }
};

/**
 * Approve a performance plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.approvePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { notes } = req.body;
    const expertId = req.user._id;
    
    const updatedPlan = await expertAdvisorService.submitReview(
      planId,
      expertId,
      'approved',
      notes || 'Plan approved by expert advisor'
    );
    
    // Notify user
    await notificationService.notifyUserOfPlanReviewStatus(
      updatedPlan.user_id,
      updatedPlan._id,
      'approved'
    );
    
    res.json({
      success: true,
      message: 'Plan approved successfully',
      data: {
        planId: updatedPlan._id,
        status: updatedPlan.status,
        review_status: updatedPlan.review_status
      }
    });
  } catch (error) {
    logger.error('Error approving plan', { 
      error: error.message,
      planId: req.params.planId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to approve plan',
      error: error.message
    });
  }
};

/**
 * Request revision for a performance plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.requestRevision = async (req, res) => {
  try {
    const { planId } = req.params;
    const { feedback } = req.body;
    const expertId = req.user._id;
    
    if (!feedback) {
      return res.status(400).json({
        success: false,
        message: 'Revision feedback is required'
      });
    }
    
    // Submit review first
    await expertAdvisorService.submitReview(
      planId,
      expertId,
      'revision_requested',
      feedback
    );
    
    // Generate revised plan
    const revisedPlan = await llmAnalysisService.generateRevisedPerformancePlan(
      planId,
      feedback
    );
    
    // Notify the user
    await notificationService.notifyUserOfPlanReviewStatus(
      revisedPlan.user_id,
      revisedPlan._id,
      'revision_requested'
    );
    
    res.json({
      success: true,
      message: 'Revision requested and new plan generated',
      data: {
        planId: revisedPlan._id,
        status: revisedPlan.status,
        review_status: revisedPlan.review_status
      }
    });
  } catch (error) {
    logger.error('Error requesting plan revision', { 
      error: error.message,
      planId: req.params.planId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to request plan revision',
      error: error.message
    });
  }
};

/**
 * Reject a performance plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.rejectPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { notes, generateNew } = req.body;
    const expertId = req.user._id;
    
    if (!notes) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }
    
    const updatedPlan = await expertAdvisorService.submitReview(
      planId,
      expertId,
      'rejected',
      notes
    );
    
    // Notify the user
    await notificationService.notifyUserOfPlanReviewStatus(
      updatedPlan.user_id,
      updatedPlan._id,
      'rejected'
    );
    
    res.json({
      success: true,
      message: 'Plan rejected successfully',
      data: {
        planId: updatedPlan._id,
        status: updatedPlan.status,
        review_status: updatedPlan.review_status
      }
    });
  } catch (error) {
    logger.error('Error rejecting plan', { 
      error: error.message,
      planId: req.params.planId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to reject plan',
      error: error.message
    });
  }
};

/**
 * Get review statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getReviewStats = async (req, res) => {
  try {
    const stats = await expertAdvisorService.getReviewStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting review stats', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve review statistics',
      error: error.message
    });
  }
};

/**
 * Submit expert feedback for LLM improvement
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { feedback, category, rating } = req.body;
    const expertId = req.user._id;
    
    // Store feedback for future training
    logger.info('Expert feedback received', {
      expertId,
      category,
      rating,
      feedback
    });
    
    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    logger.error('Error submitting expert feedback', { 
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
};