# Expert Advisor Implementation Guide

This document outlines the step-by-step implementation plan to incorporate the Expert Advisor workflow into the Alfred Brain system.

## Overview

The Expert Advisor feature introduces a human review layer between AI-generated plans and end users. When enabled, fitness professionals review and approve all AI-generated performance plans before they reach users, ensuring quality and expert validation.

## Implementation Steps

### Phase 1: Schema and Database Updates

1. **Update Performance Plan Model** (2 days)
   - Add new review-related fields to `performancePlanModel.js`:
   ```javascript
   // Add to the existing performancePlanSchema
   review_status: {
     type: String,
     enum: ['pending_review', 'approved', 'revision_requested', 'rejected'],
     default: function() {
       return process.env.EXPERT_ADVISOR_ENABLED === 'true' ? 'pending_review' : 'approved';
     }
   },
   reviewed_by: {
     type: mongoose.Schema.Types.ObjectId,
     ref: 'User'
   },
   review_notes: String,
   review_timestamp: Date,
   revision_count: {
     type: Number,
     default: 0
   },
   revision_history: [{
     version: Number,
     content: mongoose.Schema.Types.Mixed,
     created_at: Date,
     review_status: String,
     review_notes: String,
     reviewed_by: {
       type: mongoose.Schema.Types.ObjectId,
       ref: 'User'
     }
   }]
   ```

2. **Update User Model for Expert Role** (1 day)
   - Add expert role to user model:
   ```javascript
   // Add to userModel.js
   role: {
     type: String,
     enum: ['user', 'admin', 'expert_advisor', 'coach'],
     default: 'user'
   },
   expert_credentials: {
     title: String,
     specialization: [String],
     certifications: [String], 
     experience_years: Number,
     bio: String
   }
   ```

3. **Create Settings Collection for Feature Flags** (1 day)
   ```javascript
   // Create new file: backend/models/systemSettingsModel.js
   const mongoose = require('mongoose');

   const systemSettingsSchema = new mongoose.Schema({
     setting_name: {
       type: String,
       required: true,
       unique: true
     },
     setting_value: mongoose.Schema.Types.Mixed,
     description: String,
     category: {
       type: String,
       enum: ['feature_flag', 'system', 'notification', 'integration', 'other'],
       default: 'other'
     },
     created_at: {
       type: Date,
       default: Date.now
     },
     updated_at: {
       type: Date,
       default: Date.now
     }
   });

   const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

   module.exports = SystemSettings;
   ```

### Phase 2: Backend Services and Controllers

4. **Create Expert Advisor Queue Service** (2 days)
   ```javascript
   // Create new file: backend/services/expertAdvisorService.js
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
       logger.error('Error checking expert advisor setting', { error });
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
     .populate('reviewed_by', 'first_name last_name email')
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
       version: plan.revision_history.length + 1,
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
     
     plan.revision_history.push(currentVersion);
     plan.review_status = decision;
     plan.reviewed_by = expertId;
     plan.review_notes = notes;
     plan.review_timestamp = new Date();
     
     if (decision === 'revision_requested') {
       plan.revision_count += 1;
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
     return plan;
   }

   module.exports = {
     isExpertAdvisorEnabled,
     getPendingReviews,
     submitReview
   };
   ```

5. **Modify LLM Analysis Service for Revisions** (2 days)
   - Update `llmAnalysisService.js` to handle revision requests:
   ```javascript
   // Add to existing llmAnalysisService.js
   
   /**
    * Generate a revised performance plan based on expert feedback
    * @param {string} planId - ID of the plan to revise
    * @param {string} feedback - Expert feedback for revision
    * @returns {Promise<Object>} - Revised performance plan
    */
   async function generateRevisedPerformancePlan(planId, feedback) {
     try {
       // Fetch the original plan
       const originalPlan = await PerformancePlan.findById(planId)
         .populate('reviewed_by', 'first_name last_name')
         .lean();
       
       if (!originalPlan) {
         throw new Error(`Performance plan not found with ID: ${planId}`);
       }
       
       // Create revision prompt with original plan and expert feedback
       const systemPrompt = `You are an expert sports scientist revising a performance plan based on professional feedback.`;
       
       const userPrompt = `
       I need you to revise a performance plan based on expert feedback.
       
       ## Original Plan
       ${JSON.stringify(originalPlan, null, 2)}
       
       ## Expert Feedback
       ${feedback}
       
       Please generate a revised version of this performance plan that addresses all the expert's feedback and concerns.
       Return the complete revised plan as a JSON object with the same structure as the original plan.
       `;
       
       // Call OpenAI with revision prompt
       const response = await axios.post(
         OPENAI_API_URL,
         {
           model: LLM_MODEL,
           messages: [
             { role: 'system', content: systemPrompt },
             { role: 'user', content: userPrompt }
           ],
           temperature: 0.2,
           max_tokens: 4000
         },
         {
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${OPENAI_API_KEY}`
           }
         }
       );
       
       // Parse the response
       const responseContent = response.data.choices[0].message.content;
       let revisedPlan;
       
       try {
         revisedPlan = JSON.parse(responseContent);
       } catch (e) {
         logger.error('Error parsing LLM revision response', { error: e.message });
         // Try to extract JSON from the text response
         const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
         if (jsonMatch) {
           revisedPlan = JSON.parse(jsonMatch[0]);
         } else {
           throw new Error('Failed to parse LLM response as JSON');
         }
       }
       
       // Update the original plan with the revised content
       const updatedPlan = await PerformancePlan.findById(planId);
       
       // Apply revisions to plan fields
       if (revisedPlan.athletic_plan) {
         updatedPlan.athletic_plan = revisedPlan.athletic_plan;
       }
       
       if (revisedPlan.nutritional_plan) {
         updatedPlan.nutritional_plan = revisedPlan.nutritional_plan;
       }
       
       if (revisedPlan.mental_performance_plan) {
         updatedPlan.mental_performance_plan = revisedPlan.mental_performance_plan;
       }
       
       if (revisedPlan.recovery_plan) {
         updatedPlan.recovery_plan = revisedPlan.recovery_plan;
       }
       
       if (revisedPlan.data_based_modifications) {
         updatedPlan.data_based_modifications = revisedPlan.data_based_modifications;
       }
       
       // Update metadata
       updatedPlan.review_status = 'pending_review';
       updatedPlan.updated_at = new Date();
       
       await updatedPlan.save();
       return updatedPlan;
     } catch (error) {
       logger.error(`Error generating revised performance plan: ${error.message}`);
       throw error;
     }
   }
   
   // Add to module.exports
   module.exports = {
     // Existing exports...
     generateRevisedPerformancePlan
   };
   ```

6. **Create Expert Advisor API Routes** (1 day)
   ```javascript
   // Create new file: backend/api/expertAdvisorRoutes.js
   const express = require('express');
   const router = express.Router();
   const expertAdvisorController = require('./expertAdvisorController');
   const authMiddleware = require('../middleware/authMiddleware');

   // Ensure user is authenticated and has expert or admin role
   router.use(authMiddleware.authenticate);
   router.use(authMiddleware.requireRole(['expert_advisor', 'admin']));

   // Get review queue
   router.get('/queue', expertAdvisorController.getReviewQueue);

   // Get specific plan details
   router.get('/plan/:planId', expertAdvisorController.getPlanDetails);

   // Submit plan review (approve, revise, reject)
   router.post('/approve/:planId', expertAdvisorController.approvePlan);
   router.post('/revise/:planId', expertAdvisorController.requestRevision);
   router.post('/reject/:planId', expertAdvisorController.rejectPlan);

   // Expert feedback submission for LLM improvement
   router.post('/feedback', expertAdvisorController.submitFeedback);

   module.exports = router;
   ```

7. **Create Expert Advisor Controller** (2 days)
   ```javascript
   // Create new file: backend/api/expertAdvisorController.js
   const expertAdvisorService = require('../services/expertAdvisorService');
   const llmAnalysisService = require('../services/llmAnalysisService');
   const PerformancePlan = require('../models/performancePlanModel');
   const logger = require('../utils/logger');

   /**
    * Get all plans in the review queue
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
    */
   exports.getPlanDetails = async (req, res) => {
     try {
       const { planId } = req.params;
       
       const plan = await PerformancePlan.findById(planId)
         .populate('reviewed_by', 'first_name last_name email role')
         .lean();
       
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
       
       // Trigger notification to user (implement notification service separately)
       
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
       
       // Optionally generate a new plan if requested
       let newPlan = null;
       if (generateNew === true) {
         // Logic to generate a new plan would go here
         // newPlan = await llmAnalysisService.generatePerformancePlan(...);
       }
       
       res.json({
         success: true,
         message: 'Plan rejected successfully',
         data: {
           planId: updatedPlan._id,
           status: updatedPlan.status,
           review_status: updatedPlan.review_status,
           newPlanId: newPlan ? newPlan._id : null
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
    * Submit expert feedback for LLM improvement
    */
   exports.submitFeedback = async (req, res) => {
     try {
       const { feedback, category, rating } = req.body;
       const expertId = req.user._id;
       
       // Store feedback for future training (implement separately)
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
   ```

8. **Update Auth Middleware for Expert Roles** (1 day)
   ```javascript
   // Add to backend/middleware/authMiddleware.js
   
   /**
    * Middleware to require specific roles
    * @param {Array} roles - Array of allowed roles
    * @returns {Function} - Express middleware function
    */
   exports.requireRole = (roles) => {
     return (req, res, next) => {
       if (!req.user) {
         return res.status(401).json({ 
           success: false, 
           message: 'Authentication required' 
         });
       }
       
       if (!roles.includes(req.user.role)) {
         return res.status(403).json({ 
           success: false, 
           message: 'You do not have permission to access this resource' 
         });
       }
       
       next();
     };
   };
   ```

9. **Create Notification Service for Experts** (2 days)
   ```javascript
   // Create new file: backend/services/notificationService.js
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
       // For email example:
       /*
       for (const expert of experts) {
         await emailService.sendEmail({
           to: expert.email,
           subject: 'New Plan Awaiting Review',
           template: 'expert-review-needed',
           data: { 
             expertName: expert.first_name,
             planId,
             planType,
             reviewUrl: `${process.env.FRONTEND_URL}/expert/review/${planId}`
           }
         });
       }
       */
       
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
   ```

10. **Update Main Server Routes** (1 day)
    ```javascript
    // Update backend/server.js to include new routes
    
    // Add to existing routes
    const expertAdvisorRoutes = require('./api/expertAdvisorRoutes');
    
    // Add to route definitions
    app.use('/api/advisor', expertAdvisorRoutes);
    ```

### Phase 3: Frontend Implementation

11. **Create Expert Dashboard UI Components** (3 days)
    - Create React components for expert dashboard (detailed implementation not shown here)
    - Key components include:
      - ReviewQueue component
      - PlanReviewPage component
      - FeedbackForm component
      - RevisionRequestForm component
      - ApprovalForm component

12. **Update Frontend Routes** (1 day)
    - Add expert dashboard routes to frontend router
    - Implement role-based access control for UI

13. **Add Status Indicators for Users** (1 day)
    - Create components to display review status to end users
    - Add expert approval badges to approved plans

### Phase 4: Testing and Deployment

14. **Create Test Data and Test Cases** (2 days)
    - Create test users with expert roles
    - Generate sample plans for review
    - Test the complete review workflow

15. **Create Documentation** (1 day)
    - Update API documentation
    - Create expert workflow documentation
    - Update user guide

16. **Deployment Planning** (1 day)
    - Database migration plan
    - Feature flag implementation
    - Rollout strategy

## Configuration

### Environment Variables

Add the following to your `.env` file:

```
# Expert Advisor Settings
EXPERT_ADVISOR_ENABLED=true
EXPERT_REVIEW_TIMEOUT=48
REVISION_LIMIT=3
```

### Database Initialization

Add the following to your database initialization script:

```javascript
// Initialize system settings
await SystemSettings.findOneAndUpdate(
  { setting_name: 'expert_advisor_enabled' },
  { 
    setting_name: 'expert_advisor_enabled',
    setting_value: true,
    description: 'Enable expert advisor review workflow',
    category: 'feature_flag'
  },
  { upsert: true, new: true }
);
```

## Testing Checklist

- [ ] Verify that plans are properly queued for review when expert mode is enabled
- [ ] Test approval workflow
- [ ] Test revision workflow
- [ ] Test rejection workflow
- [ ] Verify notifications are working
- [ ] Verify user permissions and role-based access
- [ ] Test feature toggle functionality

## Rollout Plan

1. Deploy database schema changes
2. Deploy backend changes with feature flag disabled
3. Deploy frontend changes with feature hidden
4. Create test expert accounts and test internally
5. Enable feature for a small group of users
6. Monitor and gather feedback
7. Roll out to all users

## Resources Required

- Backend Developer: 10 days
- Frontend Developer: 5 days  
- QA Tester: 3 days
- Database Administrator: 1 day
- Product Manager: 2 days

Total estimated effort: 21 person-days