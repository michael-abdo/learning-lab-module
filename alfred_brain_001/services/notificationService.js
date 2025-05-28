/**
 * Notification Service
 * 
 * Service for sending notifications to users and experts.
 */

const User = require('../models/userModel');
const logger = require('../utils/logger');

/**
 * Send notification to expert advisors about new plan for review
 * @param {string} planId - ID of the plan
 * @param {string} planType - Type of the plan
 * @returns {Promise<boolean>} - Success status
 */
async function notifyExpertsOfNewPlan(planId, planType) {
  try {
    // Find experts with matching specialization
    const experts = await User.find({
      role: 'expert_advisor',
      // Add any other filtering criteria as needed
    }).lean();
    
    if (experts.length === 0) {
      logger.warn('No experts found for notification', { planId, planType });
      return false;
    }
    
    // Send notification to each expert (email, in-app, etc.)
    // This would integrate with your email or notification system
    logger.info(`Notifying ${experts.length} experts about new plan`, { planId });
    
    // Implementation depends on your notification system
    // For now, we'll just log the notification
    for (const expert of experts) {
      logger.info(`Notification to expert: ${expert.name}`, {
        expertId: expert._id,
        planId,
        planType,
        notificationType: 'new_plan_for_review'
      });
    }
    
    return true;
  } catch (error) {
    logger.error('Error notifying experts', { error: error.message, planId });
    return false;
  }
}

/**
 * Notify user that their plan has been reviewed
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {string} status - Review status
 * @returns {Promise<boolean>} - Success status
 */
async function notifyUserOfPlanReviewStatus(userId, planId, status) {
  try {
    const user = await User.findById(userId).lean();
    
    if (!user) {
      logger.warn('User not found for notification', { userId, planId });
      return false;
    }
    
    // Send notification to user about plan status
    logger.info(`Notifying user ${userId} about plan review status`, { 
      planId, 
      status 
    });
    
    // Implementation depends on your notification system
    // For now, we'll just log the notification
    logger.info(`Notification to user: ${user.name}`, {
      userId,
      planId,
      status,
      notificationType: 'plan_review_status'
    });
    
    return true;
  } catch (error) {
    logger.error('Error notifying user of plan status', { 
      error: error.message, 
      userId, 
      planId 
    });
    return false;
  }
}

module.exports = {
  notifyExpertsOfNewPlan,
  notifyUserOfPlanReviewStatus
};