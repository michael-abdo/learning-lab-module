/**
 * Expert Advisor Service
 * 
 * Service for handling the expert review workflow for performance plans.
 */

const PerformancePlan = require('../models/performancePlanModel');
const User = require('../models/userModel');
const SystemSettings = require('../models/systemSettingsModel');
const logger = require('../utils/logger');

/**
 * Check if expert advisor feature is enabled
 * @returns {Promise<boolean>} - Whether expert advisor is enabled
 */
async function isExpertAdvisorEnabled() {
  try {
    const setting = await SystemSettings.findOne({ setting_name: 'expert_advisor_enabled' });
    if (setting && setting.setting_value === true) {
      return true;
    }
    
    // Fall back to environment variable if setting doesn't exist
    return process.env.EXPERT_ADVISOR_ENABLED === 'true';
  } catch (error) {
    logger.error('Error checking expert advisor setting', { error: error.message });
    return process.env.EXPERT_ADVISOR_ENABLED === 'true'; 
  }
}

/**
 * Get all plans pending review
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of plans pending review
 */
async function getPendingReviews(options = {}) {
  const { limit = 20, sortBy = 'created_at', sortDir = -1 } = options;
  
  const sort = {};
  sort[sortBy] = sortDir;
  
  return PerformancePlan.find({ 
    review_status: 'pending_review' 
  })
  .sort(sort)
  .limit(limit)
  .populate('reviewed_by', 'name email role')
  .lean();
}

/**
 * Submit review for a performance plan
 * @param {string} planId - Plan ID
 * @param {string} expertId - Expert ID
 * @param {string} decision - Review decision
 * @param {string} notes - Review notes
 * @returns {Promise<Object>} - Updated plan
 */
async function submitReview(planId, expertId, decision, notes) {
  if (!['approved', 'revision_requested', 'rejected'].includes(decision)) {
    throw new Error('Invalid review decision');
  }
  
  const plan = await PerformancePlan.findById(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }
  
  // Save current version to revision history
  const currentVersion = {
    version: plan.revision_history ? plan.revision_history.length + 1 : 1,
    content: {
      athletic_plan: plan.athletic_plan,
      nutritional_plan: plan.nutritional_plan,
      mental_performance_plan: plan.mental_performance_plan,
      recovery_plan: plan.recovery_plan,
      data_based_modifications: plan.data_based_modifications
    },
    created_at: plan.updated_at,
    review_status: decision,
    review_notes: notes,
    reviewed_by: expertId
  };
  
  // Initialize revision_history if it doesn't exist
  if (!plan.revision_history) {
    plan.revision_history = [];
  }
  
  plan.revision_history.push(currentVersion);
  plan.review_status = decision;
  plan.reviewed_by = expertId;
  plan.review_notes = notes;
  plan.review_timestamp = new Date();
  
  if (decision === 'revision_requested') {
    plan.revision_count = (plan.revision_count || 0) + 1;
  } else if (decision === 'approved') {
    // Update relevant user-visible fields
    plan.status = 'active';
    plan.approval_status = 'approved';
    plan.approval_notes = notes;
  } else if (decision === 'rejected') {
    plan.status = 'archived';
    plan.approval_status = 'rejected';
    plan.approval_notes = notes;
  }
  
  await plan.save();
  
  logger.info(`Performance plan review submitted`, {
    planId: plan._id,
    expertId,
    decision,
    revisionCount: plan.revision_count
  });
  
  return plan;
}

/**
 * Get details for a specific plan including revision history
 * @param {string} planId - Plan ID
 * @returns {Promise<Object>} - Plan details
 */
async function getPlanDetails(planId) {
  return PerformancePlan.findById(planId)
    .populate('reviewed_by', 'name email role expert_credentials')
    .populate('revision_history.reviewed_by', 'name email role')
    .lean();
}

/**
 * Get statistics about the review process
 * @returns {Promise<Object>} - Review statistics
 */
async function getReviewStats() {
  const [
    pendingCount,
    approvedCount,
    rejectedCount,
    revisionCount,
    avgRevisionCount,
    oldestPending
  ] = await Promise.all([
    PerformancePlan.countDocuments({ review_status: 'pending_review' }),
    PerformancePlan.countDocuments({ review_status: 'approved' }),
    PerformancePlan.countDocuments({ review_status: 'rejected' }),
    PerformancePlan.countDocuments({ review_status: 'revision_requested' }),
    PerformancePlan.aggregate([
      { $match: { review_status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$revision_count' } } }
    ]),
    PerformancePlan.findOne({ review_status: 'pending_review' })
      .sort({ created_at: 1 })
      .select('created_at')
      .lean()
  ]);
  
  return {
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
    revision: revisionCount,
    avgRevisions: avgRevisionCount.length > 0 ? avgRevisionCount[0].avg : 0,
    oldestPendingDate: oldestPending ? oldestPending.created_at : null,
    waitTime: oldestPending 
      ? Math.round((Date.now() - new Date(oldestPending.created_at).getTime()) / (1000 * 60 * 60)) 
      : 0
  };
}

/**
 * Initialize the expert advisor service
 * @returns {Promise<void>}
 */
async function init() {
  // Ensure the feature flag exists
  const settingExists = await SystemSettings.findOne({ setting_name: 'expert_advisor_enabled' });
  
  if (!settingExists) {
    // Create the setting if it doesn't exist
    await SystemSettings.create({
      setting_name: 'expert_advisor_enabled',
      setting_value: process.env.EXPERT_ADVISOR_ENABLED === 'true',
      description: 'Enable expert advisor review workflow',
      category: 'feature_flag'
    });
    
    logger.info('Expert advisor feature flag initialized');
  }
  
  logger.info('Expert Advisor Service initialized', {
    enabled: await isExpertAdvisorEnabled()
  });
}

module.exports = {
  isExpertAdvisorEnabled,
  getPendingReviews,
  submitReview,
  getPlanDetails,
  getReviewStats,
  init
};