/**
 * Expert Advisor Routes
 * 
 * Routes for expert advisors to review and manage performance plans.
 */

const express = require('express');
const router = express.Router();
const expertAdvisorController = require('./expertAdvisorController');
const authMiddleware = require('../middleware/authMiddleware');

// All expert advisor routes require authentication
router.use(authMiddleware);

// All expert advisor routes require expert_advisor role
router.use(authMiddleware.expertAdvisorAuth);

// Get review queue
router.get('/queue', expertAdvisorController.getReviewQueue);

// Get review statistics
router.get('/stats', expertAdvisorController.getReviewStats);

// Get specific plan details
router.get('/plan/:planId', expertAdvisorController.getPlanDetails);

// Submit plan review (approve, revise, reject)
router.post('/approve/:planId', expertAdvisorController.approvePlan);
router.post('/revise/:planId', expertAdvisorController.requestRevision);
router.post('/reject/:planId', expertAdvisorController.rejectPlan);

// Expert feedback submission for LLM improvement
router.post('/feedback', expertAdvisorController.submitFeedback);

module.exports = router;